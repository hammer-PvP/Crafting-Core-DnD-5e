import { FLAGS, MODULE_ID, SOCKET_CHANNEL } from "../constants.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";

const REQUEST = "craft-request";
const RESPONSE = "craft-response";
const REQUEST_TIMEOUT_MS = 15000;

export class CraftingService {
  static #pending = new Map();
  static #heartbeat = null;

  static ready() {
    game.socket.on(SOCKET_CHANNEL, payload => this.#onSocket(payload));
    if (game.user?.isGM) {
      // Every connected GM keeps a lightweight heartbeat. Only the currently active GM is allowed to commit.
      // This lets finalization continue automatically if Foundry elects a different active GM mid-session.
      this.#heartbeat = setInterval(() => void this.finalizeDueJobs(), 1000);
      void this.finalizeDueJobs();
    }
  }

  static shutdown() {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
  }

  static serverTime() {
    const value = Number(game.time?.serverTime);
    return Number.isFinite(value) ? value : Date.now();
  }

  static job(actor) {
    const job = actor?.getFlag?.(MODULE_ID, FLAGS.CRAFTING_JOB);
    return job && typeof job === "object" ? foundry.utils.deepClone(job) : null;
  }

  static async requestCraft(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Crafting requires a Character Actor.");
    const gm = this.#activeGM();
    if (!gm) throw new Error("A connected GM is required to begin crafting.");

    const recipe = KnowledgeItemService.recipeForActor(actor, String(recipeId));
    if (!recipe) throw new Error(`${actor.name} has not learned this recipe.`);
    const evaluation = this.evaluateResolution(actor, recipe);
    if (!evaluation.eligible) throw new Error(evaluation.blockReason || `${actor.name} does not meet this recipe's proficiency requirements.`);

    const payload = {
      action: REQUEST,
      requestId: foundry.utils.randomID(24),
      requesterId: game.user.id,
      actorId: actor.id,
      recipeId: String(recipeId),
      rollMessageId: null
    };

    if (evaluation.rollRequired) {
      const roll = await this.#performCraftingRoll(actor, recipe, payload.requestId);
      if (!roll) throw new Error("The Crafting Check was cancelled.");
      payload.rollMessageId = roll.messageId;
    }

    if (gm.id === game.user.id) return this.#executeCraft(payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(payload.requestId);
        reject(new Error("The active GM did not respond to the crafting request in time."));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(payload.requestId, { resolve, reject, timeout });
      game.socket.emit(SOCKET_CHANNEL, payload);
    });
  }

  static prepareRecipeForActor(actor, recipe) {
    const rows = (recipe.ingredients ?? []).map(reference => {
      const matches = actor.items.filter(item => RecipeService.itemMatchesReference(item, reference));
      const available = matches.reduce((sum, item) => sum + this.#itemQuantity(item), 0);
      return {
        ...reference,
        available,
        sufficient: available >= reference.quantity,
        matches: matches.map(item => item.id)
      };
    });
    const craftCount = rows.length
      ? Math.max(0, Math.min(...rows.map(row => Math.floor(row.available / Math.max(1, Number(row.quantity) || 1)))))
      : 0;
    const resolution = this.evaluateResolution(actor, recipe);
    return {
      ...recipe,
      ingredientRows: rows,
      craftCount,
      resolution,
      canCraft: Boolean(recipe.result?.uuid || recipe.result?.snapshot) && craftCount > 0 && resolution.eligible
    };
  }

  static evaluateResolution(actor, recipe) {
    const resolution = RecipeService.normalizeCraftingResolution(recipe?.craftingResolution);
    const configured = resolution.proficiencies;
    const proficiencyRows = configured.map(entry => ({
      ...entry,
      label: this.#proficiencyLabel(entry),
      proficient: this.#hasProficiency(actor, entry)
    }));
    const qualifies = configured.length > 0 && (resolution.proficiencyMatch === "all"
      ? proficiencyRows.every(row => row.proficient)
      : proficiencyRows.some(row => row.proficient));
    const eligible = resolution.attemptPolicy !== "requiresProficiency" || qualifies;
    const automaticByProficiency = configured.length > 0 && qualifies
      && resolution.proficientPolicy === "automaticSuccess";
    const automaticSuccess = eligible && (!resolution.check.required || automaticByProficiency);
    const rollRequired = eligible && resolution.check.required && !automaticByProficiency;
    const checkLabel = this.#checkLabel(resolution.check);
    const blockReason = eligible ? "" : configured.length
      ? `${actor?.name ?? "This character"} requires ${resolution.proficiencyMatch === "all" ? "all" : "one"} of: ${proficiencyRows.map(row => row.label).join(", ")}.`
      : "This recipe requires a relevant proficiency, but none is configured.";

    return {
      ...resolution,
      proficiencyRows,
      qualifies,
      eligible,
      automaticSuccess,
      rollRequired,
      checkLabel,
      blockReason,
      summary: this.#resolutionSummary(resolution, proficiencyRows, qualifies, checkLabel)
    };
  }

  static async finalizeDueJobs() {
    if (!this.#isActiveGM()) return;
    const now = this.serverTime();
    for (const actor of game.actors.contents.filter(a => a.type === "character")) {
      const job = this.job(actor);
      if (!job || job.status !== "active" || Number(job.endsAt) > now) continue;
      try {
        await this.#finalize(actor, job);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to finalize crafting job for ${actor.name}.`, error);
        await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, {
          ...job,
          status: "error",
          error: String(error?.message ?? error)
        });
      }
    }
  }

  static async #onSocket(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.action === REQUEST) {
      if (!this.#isActiveGM()) return;
      const response = {
        action: RESPONSE,
        requestId: payload.requestId,
        requesterId: payload.requesterId,
        success: false
      };
      try {
        response.result = await this.#executeCraft(payload);
        response.success = true;
      } catch (error) {
        console.warn(`${MODULE_ID} | Craft request rejected.`, error);
        response.error = String(error?.message ?? error);
      }
      game.socket.emit(SOCKET_CHANNEL, response);
      return;
    }

    if (payload.action === RESPONSE && payload.requesterId === game.user.id) {
      const pending = this.#pending.get(payload.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.#pending.delete(payload.requestId);
      if (payload.success) pending.resolve(payload.result ?? {});
      else pending.reject(new Error(payload.error || "The GM rejected the crafting request."));
    }
  }

  static async #executeCraft(request) {
    if (!this.#isActiveGM()) throw new Error("Only the active GM may commit a crafting transaction.");
    const requester = game.users.get(String(request.requesterId ?? ""));
    if (!requester) throw new Error("Crafting requester could not be resolved.");
    const actor = game.actors.get(String(request.actorId ?? ""));
    if (!actor || actor.type !== "character") throw new Error("Crafting Actor could not be resolved.");
    if (!actor.testUserPermission(requester, "OWNER") && !requester.isGM) {
      throw new Error("The requesting user does not own this Character.");
    }

    const recipe = KnowledgeItemService.recipeForActor(actor, String(request.recipeId ?? ""));
    if (!recipe) throw new Error(`${actor.name} has not learned this recipe.`);
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");
    if (this.job(actor)?.status === "active") throw new Error(`${actor.name} is already crafting something.`);

    const prepared = this.prepareRecipeForActor(actor, recipe);
    const missing = prepared.ingredientRows.filter(row => !row.sufficient);
    if (missing.length) throw new Error(`Missing materials: ${missing.map(row => row.name).join(", ")}.`);
    if (!prepared.resolution.eligible) throw new Error(prepared.resolution.blockReason);

    const rollResult = prepared.resolution.rollRequired
      ? await this.#validateCraftingRoll(actor, recipe, requester, request)
      : { success: true, total: null, message: null };

    if (!rollResult.success) {
      const failure = prepared.resolution.failure;
      const lossPercent = failure.loseMaterials ? failure.lossPercent : 0;
      const lostRequirements = this.#scaledRequirements(recipe.ingredients, lossPercent);
      if (lostRequirements.length) await this.#consumeIngredients(actor, lostRequirements);
      await this.#postOutcome(actor, recipe, {
        success: false,
        total: rollResult.total,
        dc: prepared.resolution.check.dc,
        lossPercent
      });
      return {
        actorId: actor.id,
        recipeId: recipe.id,
        outcome: "failure",
        total: rollResult.total,
        dc: prepared.resolution.check.dc,
        lossPercent
      };
    }

    let resultData = recipe.result?.snapshot ? foundry.utils.deepClone(recipe.result.snapshot) : null;
    let resultSource = null;
    if (!resultData && recipe.result?.uuid) {
      resultSource = await fromUuid(recipe.result.uuid);
      if (!(resultSource instanceof Item)) throw new Error(`Result Item not found: ${recipe.result.uuid}`);
      resultData = resultSource.toObject();
    }

    await this.#consumeIngredients(actor, recipe.ingredients);

    const startedAt = this.serverTime();
    const endsAt = startedAt + Math.max(0, Number(recipe.craftingTime) || 0) * 1000;
    const job = {
      id: foundry.utils.randomID(20),
      recipeId: recipe.id,
      recipeName: recipe.name,
      resultUuid: recipe.result.sourceUuid || recipe.result.uuid,
      resultQuantity: recipe.result.quantity,
      resultData,
      startedAt,
      endsAt,
      status: "active",
      requesterId: requester.id,
      resolution: {
        automaticSuccess: prepared.resolution.automaticSuccess,
        checkLabel: prepared.resolution.checkLabel,
        dc: prepared.resolution.check.dc,
        total: rollResult.total
      }
    };
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, job);

    if (endsAt <= this.serverTime()) await this.#finalize(actor, job);
    return { actorId: actor.id, recipeId: recipe.id, outcome: "success", job };
  }

  static async #performCraftingRoll(actor, recipe, requestId) {
    const evaluation = this.evaluateResolution(actor, recipe);
    const check = evaluation.check;
    if (!evaluation.rollRequired) return null;
    if (!check.id) throw new Error("This recipe does not have a valid Crafting Check configured.");

    const flagData = {
      requestId,
      requesterId: game.user.id,
      actorId: actor.id,
      recipeId: recipe.id,
      check: { type: check.type, id: check.id, dc: check.dc },
      createdAt: Date.now(),
      consumedAt: 0
    };
    const message = {
      data: {
        flags: { [MODULE_ID]: { [FLAGS.CRAFTING_ROLL]: flagData } },
        flavor: `Crafting Check — ${foundry.utils.escapeHTML(recipe.name)} · ${foundry.utils.escapeHTML(evaluation.checkLabel)} DC ${check.dc}`
      }
    };
    const config = { target: check.dc };
    let rolls;
    switch (check.type) {
      case "ability": rolls = await actor.rollAbilityCheck({ ...config, ability: check.id }, {}, message); break;
      case "save": rolls = await actor.rollSavingThrow({ ...config, ability: check.id }, {}, message); break;
      case "tool": rolls = await actor.rollToolCheck({ ...config, tool: check.id }, {}, message); break;
      case "skill":
      default: rolls = await actor.rollSkill({ ...config, skill: check.id }, {}, message); break;
    }
    const roll = Array.isArray(rolls) ? rolls[0] : rolls;
    if (!roll) return null;
    const messageId = roll.parent?.id ?? roll.message?.id ?? null;
    if (!messageId) throw new Error("Crafting Core could not validate the D&D5e roll message.");
    return { messageId, total: Number(roll.total) };
  }

  static async #validateCraftingRoll(actor, recipe, requester, request) {
    const messageId = String(request.rollMessageId || "");
    if (!messageId) throw new Error("A validated Crafting Check is required for this recipe.");
    const message = await this.#waitForMessage(messageId);
    if (!message) throw new Error("The Crafting Check chat message could not be found.");

    const authorId = String(message.author?.id ?? message.user?.id ?? message.user ?? "");
    if (authorId && authorId !== requester.id) throw new Error("The Crafting Check was not rolled by the requesting user.");
    const speakerActor = String(message.speaker?.actor ?? "");
    if (speakerActor && speakerActor !== actor.id) throw new Error("The Crafting Check was rolled for a different Actor.");

    const flag = message.getFlag?.(MODULE_ID, FLAGS.CRAFTING_ROLL)
      ?? message.flags?.[MODULE_ID]?.[FLAGS.CRAFTING_ROLL];
    if (!flag || typeof flag !== "object") throw new Error("This roll is not a Crafting Core Crafting Check.");
    if (Number(flag.consumedAt) > 0) throw new Error("This Crafting Check has already been used.");
    if (String(flag.requestId) !== String(request.requestId)
      || String(flag.requesterId) !== requester.id
      || String(flag.actorId) !== actor.id
      || String(flag.recipeId) !== recipe.id) {
      throw new Error("The Crafting Check does not match this crafting request.");
    }

    const evaluation = this.evaluateResolution(actor, recipe);
    const expected = evaluation.check;
    if (String(flag.check?.type) !== expected.type || String(flag.check?.id) !== expected.id
      || Number(flag.check?.dc) !== expected.dc) {
      throw new Error("The recipe's Crafting Check changed after this roll was made.");
    }

    const roll = message.rolls?.[0] ?? message.roll ?? null;
    const total = Number(roll?.total);
    if (!Number.isFinite(total)) throw new Error("Crafting Core could not read the Crafting Check total.");
    const target = Number(roll?.options?.target ?? expected.dc);
    if (Number.isFinite(target) && target !== expected.dc) throw new Error("The Crafting Check DC does not match the recipe.");

    await message.setFlag?.(MODULE_ID, FLAGS.CRAFTING_ROLL, { ...flag, consumedAt: Date.now() });
    return { success: total >= expected.dc, total, message };
  }

  static async #waitForMessage(messageId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const message = game.messages?.get?.(messageId);
      if (message) return message;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  }

  static #scaledRequirements(requirements, percent) {
    const pct = Math.clamp(Number(percent) || 0, 0, 100);
    if (pct <= 0) return [];
    return (requirements ?? []).map(requirement => ({
      ...requirement,
      quantity: Math.ceil(Math.max(1, Number(requirement.quantity) || 1) * pct / 100)
    })).filter(requirement => requirement.quantity > 0);
  }

  static async #consumeIngredients(actor, requirements) {
    const state = new Map(actor.items.map(item => [item.id, {
      item,
      quantity: this.#itemQuantity(item),
      remaining: this.#itemQuantity(item)
    }]));

    for (const requirement of requirements) {
      let need = Math.max(1, Number(requirement.quantity) || 1);
      const candidates = [...state.values()].filter(row => row.remaining > 0
        && RecipeService.itemMatchesReference(row.item, requirement));
      for (const row of candidates) {
        if (need <= 0) break;
        const used = Math.min(row.remaining, need);
        row.remaining -= used;
        need -= used;
      }
      if (need > 0) throw new Error(`Not enough ${requirement.name}.`);
    }

    const updates = [];
    const deletes = [];
    for (const { item, quantity, remaining } of state.values()) {
      if (remaining === quantity) continue;
      if (this.#hasQuantity(item)) {
        if (remaining <= 0) deletes.push(item.id);
        else updates.push({ _id: item.id, "system.quantity": remaining });
      } else if (remaining <= 0) deletes.push(item.id);
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    if (deletes.length) await actor.deleteEmbeddedDocuments("Item", deletes);
  }

  static async #postOutcome(actor, recipe, { success, total=null, dc=null, lossPercent=0 }={}) {
    if (!globalThis.ChatMessage?.create) return;
    const content = success
      ? `<p><strong>${foundry.utils.escapeHTML(recipe.name)}</strong> was crafted successfully.</p>`
      : `<p><strong>${foundry.utils.escapeHTML(recipe.name)}</strong> failed.</p><p>Crafting Check: <strong>${total}</strong> vs DC <strong>${dc}</strong>.</p><p>${lossPercent > 0 ? `${lossPercent}% of the required materials were lost.` : "No materials were lost."}</p>`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      flags: { [MODULE_ID]: { craftingOutcome: { recipeId: recipe.id, success, total, dc, lossPercent } } }
    });
  }

  static async #finalize(actor, expectedJob) {
    const current = this.job(actor);
    if (!current || current.status !== "active" || current.id !== expectedJob.id) return false;
    if (Number(current.endsAt) > this.serverTime()) return false;

    // Claim finalization before creating the result. A second GM/client cannot finalize the same job.
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, { ...current, status: "finalizing" });
    const recipe = KnowledgeItemService.recipeForActor(actor, current.recipeId);
    const quantity = Math.max(1, Number(current.resultQuantity) || 1);
    let resultData = current.resultData ? foundry.utils.deepClone(current.resultData) : null;
    let sourceUuid = String(current.resultUuid || "");
    if (!resultData) {
      const source = await fromUuid(sourceUuid);
      if (!(source instanceof Item)) throw new Error(`Result Item not found: ${sourceUuid}`);
      resultData = source.toObject();
      sourceUuid = source.uuid;
    }

    await this.#createResult(actor, resultData, quantity, sourceUuid);
    await actor.unsetFlag(MODULE_ID, FLAGS.CRAFTING_JOB);
    ui.notifications.info(`${actor.name} completed ${recipe?.name ?? current.recipeName ?? "crafting"}.`);
    return true;
  }

  static async #createResult(actor, sourceData, quantity, sourceUuid) {
    const data = foundry.utils.deepClone(sourceData);
    delete data._id;
    delete data.folder;
    delete data.ownership;
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    // Preserve the exact Item definition selected as the recipe result. This lets the crafted copy
    // satisfy future recipes that require that same world/compendium Item even after embedding.
    data.flags[MODULE_ID][FLAGS.SOURCE_UUID] = sourceUuid;

    if (foundry.utils.hasProperty(data, "system.quantity")) {
      data.system.quantity = quantity;
      await actor.createEmbeddedDocuments("Item", [data]);
      return;
    }

    const docs = Array.from({ length: quantity }, () => foundry.utils.deepClone(data));
    await actor.createEmbeddedDocuments("Item", docs);
  }

  static #hasProficiency(actor, requirement) {
    if (!actor || !requirement?.id) return false;
    const data = requirement.type === "tool"
      ? actor.system?.tools?.[requirement.id]
      : actor.system?.skills?.[requirement.id];
    if (!data) return false;
    if (typeof data.prof?.hasProficiency === "boolean") return data.prof.hasProficiency;
    if (typeof data.hasProficiency === "boolean") return data.hasProficiency;
    return Number(data.value ?? data.proficient ?? 0) > 0;
  }

  static #proficiencyLabel(requirement) {
    const config = requirement?.type === "tool" ? CONFIG.DND5E?.tools : CONFIG.DND5E?.skills;
    const data = config?.[requirement?.id];
    const raw = (typeof data === "string" ? data : data?.label) ?? requirement?.id ?? "Proficiency";
    return game.i18n.localize(raw);
  }

  static #checkLabel(check) {
    const type = String(check?.type || "skill");
    const id = String(check?.id || "");
    if (type === "skill") return this.#proficiencyLabel({ type: "skill", id });
    if (type === "tool") return this.#proficiencyLabel({ type: "tool", id });
    const data = CONFIG.DND5E?.abilities?.[id];
    const rawLabel = (typeof data === "string" ? data : data?.label) ?? id ?? "Ability";
    const label = game.i18n.localize(rawLabel);
    return type === "save" ? `${label} Saving Throw` : `${label} Check`;
  }

  static #resolutionSummary(resolution, proficiencyRows, qualifies, checkLabel) {
    const parts = [];
    if (proficiencyRows.length) {
      const joiner = resolution.proficiencyMatch === "all" ? " + " : " or ";
      parts.push(`${proficiencyRows.map(row => row.label).join(joiner)}${qualifies ? " ✓" : ""}`);
    }
    if (resolution.check.required) parts.push(`${checkLabel} DC ${resolution.check.dc}`);
    else parts.push("No check required");
    if (resolution.check.required) {
      parts.push(resolution.failure.loseMaterials
        ? `Failure loses ${resolution.failure.lossPercent}% materials`
        : "No material loss on failure");
    }
    return parts.join(" · ");
  }

  static #hasQuantity(item) {
    return foundry.utils.hasProperty(item, "system.quantity") && Number.isFinite(Number(item.system.quantity));
  }

  static #itemQuantity(item) {
    if (!this.#hasQuantity(item)) return 1;
    return Math.max(0, Number(item.system.quantity) || 0);
  }

  static #activeGM() {
    const preferred = game.users?.activeGM;
    if (preferred?.active && preferred.isGM) return preferred;
    return game.users?.contents?.filter(user => user.active && user.isGM)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
  }

  static #isActiveGM() {
    return Boolean(game.user?.isGM && this.#activeGM()?.id === game.user.id);
  }
}
