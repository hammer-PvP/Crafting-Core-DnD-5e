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

    const payload = {
      action: REQUEST,
      requestId: foundry.utils.randomID(24),
      requesterId: game.user.id,
      actorId: actor.id,
      recipeId: String(recipeId)
    };

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
    return {
      ...recipe,
      ingredientRows: rows,
      craftCount,
      canCraft: Boolean(recipe.result?.uuid || recipe.result?.snapshot) && craftCount > 0
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

    const recipe = RecipeService.get(String(request.recipeId ?? ""));
    if (!recipe) throw new Error("That recipe no longer exists.");
    if (!KnowledgeItemService.knows(actor, recipe.id)) throw new Error(`${actor.name} has not learned this recipe.`);
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");
    let resultData = recipe.result?.snapshot ? foundry.utils.deepClone(recipe.result.snapshot) : null;
    let resultSource = null;
    if (!resultData && recipe.result?.uuid) {
      resultSource = await fromUuid(recipe.result.uuid);
      if (!(resultSource instanceof Item)) throw new Error(`Result Item not found: ${recipe.result.uuid}`);
      resultData = resultSource.toObject();
    }
    if (this.job(actor)?.status === "active") throw new Error(`${actor.name} is already crafting something.`);

    const prepared = this.prepareRecipeForActor(actor, recipe);
    const missing = prepared.ingredientRows.filter(row => !row.sufficient);
    if (missing.length) throw new Error(`Missing materials: ${missing.map(row => row.name).join(", ")}.`);

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
      requesterId: requester.id
    };
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, job);

    if (endsAt <= this.serverTime()) await this.#finalize(actor, job);
    return { actorId: actor.id, recipeId: recipe.id, job };
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

  static async #finalize(actor, expectedJob) {
    const current = this.job(actor);
    if (!current || current.status !== "active" || current.id !== expectedJob.id) return false;
    if (Number(current.endsAt) > this.serverTime()) return false;

    // Claim finalization before creating the result. A second GM/client cannot finalize the same job.
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, { ...current, status: "finalizing" });
    const recipe = RecipeService.get(current.recipeId);
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
