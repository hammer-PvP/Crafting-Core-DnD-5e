import { FLAGS, MODULE_ID, SOCKET_CHANNEL } from "../constants.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { MaterialStackService } from "./material-stack-service.mjs";

const REQUEST_TIMED = "craft-request";
const REQUEST_PROJECT_START = "craft-project-start";
const REQUEST_PROJECT_WORK = "craft-project-work";
const REQUEST_PROJECT_EXTRA = "craft-project-extra-effort";
const REQUEST_PROJECT_FINAL = "craft-project-final";
const REQUEST_PROJECT_CANCEL = "craft-project-cancel";
const REST_UNLOCK = "craft-project-rest-unlock";
const RESPONSE = "craft-response";
const REQUEST_TIMEOUT_MS = 15000;

export class CraftingService {
  static #pending = new Map();
  static #heartbeat = null;
  static #restHook = null;

  static ready() {
    game.socket.on(SOCKET_CHANNEL, payload => this.#onSocket(payload));
    this.#restHook ??= Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
      void this.#onRestCompleted(actor, result, config);
    });
    if (game.user?.isGM) {
      this.#heartbeat = setInterval(() => void this.finalizeDueJobs(), 1000);
      void this.finalizeDueJobs();
    }
  }

  static shutdown() {
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#heartbeat = null;
    if (this.#restHook) Hooks.off("dnd5e.restCompleted", this.#restHook);
    this.#restHook = null;
  }

  static serverTime() {
    const value = Number(game.time?.serverTime);
    return Number.isFinite(value) ? value : Date.now();
  }

  static job(actor) {
    const job = actor?.getFlag?.(MODULE_ID, FLAGS.CRAFTING_JOB);
    return job && typeof job === "object" ? foundry.utils.deepClone(job) : null;
  }

  static project(actor) {
    const job = this.job(actor);
    return job?.mode === "project" ? job : null;
  }

  static isBusy(actor) {
    const job = this.job(actor);
    return Boolean(job && ["active", "finalizing"].includes(job.status));
  }

  static async requestCraft(actor, recipeId) {
    const recipe = KnowledgeItemService.recipeForActor(actor, String(recipeId));
    if (!recipe) throw new Error(`${actor?.name ?? "This character"} has not learned this recipe.`);
    if (recipe.craftingMode === "project") return this.requestStartProject(actor, recipeId);
    return this.#requestTimedCraft(actor, recipeId);
  }

  static async requestStartProject(actor, recipeId) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const recipe = KnowledgeItemService.recipeForActor(actor, String(recipeId));
    if (!recipe) throw new Error(`${actor.name} has not learned this recipe.`);
    if (recipe.craftingMode !== "project") return this.#requestTimedCraft(actor, recipeId);
    if (this.isBusy(actor)) throw new Error(`${actor.name} already has an active crafting project.`);

    const evaluation = this.evaluateResolution(actor, recipe);
    if (!evaluation.eligible) throw new Error(evaluation.publicBlockReason || `${actor.name} does not meet this recipe's requirements.`);
    const projectConfig = RecipeService.normalizeProject(recipe.project);
    const previewProject = { completedWork: 0, midpointPassed: false };
    const checkApplies = this.#progressCheckApplies(previewProject, projectConfig);

    const payload = this.#baseRequest(REQUEST_PROJECT_START, actor, recipeId);
    payload.rollMessageId = null;
    if (checkApplies) {
      const roll = await this.#performRoll(actor, recipe, projectConfig.progressCheck, "progress", payload.requestId, {
        revealCheck: RecipeService.normalizePlayerVisibility(recipe.playerVisibility).progressCheck,
        revealDc: RecipeService.normalizePlayerVisibility(recipe.playerVisibility).progressDC
      });
      if (!roll) throw new Error("The Progress Check was cancelled.");
      payload.rollMessageId = roll.messageId;
    }
    return this.#submitRequest(gm, payload);
  }

  static async requestWorkOnProject(actor) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const project = this.project(actor);
    if (!project || project.status !== "active") throw new Error("There is no active Crafting Project.");
    if (project.phase !== "working") throw new Error("This Project is not waiting for a Work Attempt.");
    const recipe = RecipeService.snapshot(project.recipe);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    if (!project.workAvailable) throw new Error(visibility.craftingTime
      ? `Another ${this.#cadenceLabel(project.cadence)} is required before more work can be performed.`
      : "Another work opportunity is required before more work can be performed.");


    const projectConfig = RecipeService.normalizeProject(recipe.project);
    const checkApplies = this.#progressCheckApplies(project, projectConfig);
    const payload = this.#baseRequest(REQUEST_PROJECT_WORK, actor, recipe.id, project.id);
    payload.rollMessageId = null;
    if (checkApplies) {
      const roll = await this.#performRoll(actor, recipe, projectConfig.progressCheck, "progress", payload.requestId, {
        projectId: project.id,
        revealCheck: visibility.progressCheck,
        revealDc: visibility.progressDC
      });
      if (!roll) throw new Error("The Progress Check was cancelled.");
      payload.rollMessageId = roll.messageId;
    }
    return this.#submitRequest(gm, payload);
  }

  static async requestExtraEffort(actor) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const project = this.project(actor);
    if (!project || project.status !== "active") throw new Error("There is no active Crafting Project.");
    if (project.phase !== "working") throw new Error("Extra Effort is only available while the Project is still in progress.");
    const recipe = RecipeService.snapshot(project.recipe);
    const config = RecipeService.normalizeProject(recipe.project);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    if (!config.extraEffort.enabled) throw new Error("This Recipe does not allow Extra Effort.");
    if (!project.extraEffortAvailable) throw new Error("Extra Effort is not available for the current Work Period.");

    const payload = this.#baseRequest(REQUEST_PROJECT_EXTRA, actor, recipe.id, project.id);
    const roll = await this.#performRoll(actor, recipe, config.extraEffort, "extra", payload.requestId, {
      projectId: project.id,
      revealCheck: visibility.extraEffortCheck,
      revealDc: visibility.extraEffortDC
    });
    if (!roll) throw new Error("The Extra Effort Check was cancelled.");
    payload.rollMessageId = roll.messageId;
    return this.#submitRequest(gm, payload);
  }

  static async requestFinalCheck(actor) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const project = this.project(actor);
    if (!project || project.status !== "active") throw new Error("There is no active Crafting Project.");
    if (project.phase !== "readyFinal") throw new Error("This Project is not ready for completion.");
    const recipe = RecipeService.snapshot(project.recipe);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    if (!project.finalAvailable) throw new Error(visibility.craftingTime
      ? `Another ${this.#cadenceLabel(project.cadence)} is required before retrying completion.`
      : "Another work opportunity is required before retrying completion.");


    const resolution = RecipeService.normalizeCraftingResolution(recipe.craftingResolution);
    const payload = this.#baseRequest(REQUEST_PROJECT_FINAL, actor, recipe.id, project.id);
    payload.rollMessageId = null;
    if (resolution.check.required && !project.finalPolicy?.automaticSuccess) {
      const roll = await this.#performRoll(actor, recipe, resolution.check, "final", payload.requestId, {
        projectId: project.id,
        revealCheck: visibility.craftingCheck,
        revealDc: visibility.craftingDC
      });
      if (!roll) throw new Error("The Final Crafting Check was cancelled.");
      payload.rollMessageId = roll.messageId;
    }
    return this.#submitRequest(gm, payload);
  }

  static async requestCancelProject(actor) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const project = this.project(actor);
    if (!project || project.status !== "active") throw new Error("There is no active Crafting Project to cancel.");
    return this.#submitRequest(gm, this.#baseRequest(REQUEST_PROJECT_CANCEL, actor, project.recipeId, project.id));
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
    const project = RecipeService.normalizeProject(recipe.project);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    return {
      ...recipe,
      playerVisibility: visibility,
      project,
      ingredientRows: rows,
      craftCount,
      resolution,
      projectDisplay: {
        cadenceLabel: this.#cadenceLabel(project.cadence),
        progressCheckLabel: RecipeService.checkLabel(project.progressCheck, actor),
        progressFailureLabel: this.#failureLabel(project.progressCheck.failure, { revealPercent: visibility.progressFailurePercent }),
        extraEffortCheckLabel: RecipeService.checkLabel(project.extraEffort, actor),
        extraEffortFailureLabel: project.extraEffort.failure.mode === "regress"
          ? `Regress ${project.extraEffort.failure.regressBy} Work Period${project.extraEffort.failure.regressBy === 1 ? "" : "s"}`
          : "No Extra Progress",
        finalFailureLabel: recipe.craftingMode === "project"
          ? this.#failureLabel(resolution.failure, { final: true, revealPercent: visibility.failurePercent })
          : (resolution.failure.loseMaterials ? `Lose ${resolution.failure.lossPercent}% materials` : "No materials lost")
      },
      canCraft: Boolean(recipe.result?.uuid || recipe.result?.snapshot) && craftCount > 0 && resolution.eligible
    };
  }

  static prepareProjectForActor(actor, project=this.project(actor)) {
    if (!project) return null;
    const recipe = RecipeService.snapshot(project.recipe ?? {});
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    const config = RecipeService.normalizeProject(recipe.project);
    const resolution = RecipeService.normalizeCraftingResolution(recipe.craftingResolution);
    const requiredWork = Math.max(1, Number(project.requiredWork ?? config.requiredWork) || 1);
    const completedWork = Math.clamp(Number(project.completedWork) || 0, 0, requiredWork);
    const progressPercent = Math.clamp((completedWork / requiredWork) * 100, 0, 100);
    const reserved = this.#reservedSummary(project.reservedMaterials ?? []);
    let stateLabel = "In Progress";
    if (project.phase === "readyFinal") {
      if (project.finalAvailable) stateLabel = visibility.craftingCheck ? "Ready for Final Check" : "Ready to Complete";
      else stateLabel = visibility.craftingTime ? `Waiting for ${this.#cadenceLabel(project.cadence)}` : "Not Available Yet";
    } else if (project.extraEffortAvailable && config.extraEffort.enabled) stateLabel = visibility.extraEffort ? "Extra Effort Available" : "In Progress";
    else if (project.workAvailable) stateLabel = "Work Available";
    else stateLabel = visibility.craftingTime ? `Waiting for ${this.#cadenceLabel(project.cadence)}` : "Work Not Available Yet";
    return {
      ...project,
      recipe,
      visibility,
      config,
      resolution,
      requiredWork,
      completedWork,
      progressPercent,
      stateLabel,
      cadenceLabel: this.#cadenceLabel(project.cadence),
      progressCheckLabel: RecipeService.checkLabel(config.progressCheck, actor),
      progressFailureLabel: this.#failureLabel(config.progressCheck.failure, { revealPercent: visibility.progressFailurePercent }),
      extraEffortCheckLabel: RecipeService.checkLabel(config.extraEffort, actor),
      extraEffortFailureLabel: config.extraEffort.failure.mode === "regress"
        ? `Regress ${config.extraEffort.failure.regressBy} Work Period${config.extraEffort.failure.regressBy === 1 ? "" : "s"}`
        : "No Extra Progress",
      extraEffortStateLabel: project.extraEffortAvailable ? "Extra Effort Available"
        : project.workAvailable ? "Complete normal work first"
          : project.extraEffortUsedThisPeriod ? "Extra Effort Used"
            : "Extra Effort Not Available",
      finalCheckLabel: RecipeService.checkLabel(resolution.check, actor),
      manualFinalRequired: Boolean(resolution.check.required && !project.finalPolicy?.automaticSuccess),
      finalFailureLabel: this.#failureLabel(resolution.failure, { final: true, revealPercent: visibility.failurePercent }),
      reservedMaterials: reserved
    };
  }

  static evaluateResolution(actor, recipe) {
    const proficiency = RecipeService.proficiencyEvaluation(actor, recipe?.craftingResolution);
    const resolution = proficiency.resolution;
    const configured = resolution.proficiencies;
    const proficiencyRows = proficiency.rows;
    const qualifies = proficiency.qualifies;
    const eligible = proficiency.eligible;
    const automaticByProficiency = configured.length > 0 && qualifies
      && resolution.proficientPolicy === "automaticSuccess";
    const automaticSuccess = eligible && (!resolution.check.required || automaticByProficiency);
    const rollRequired = eligible && resolution.check.required && !automaticByProficiency;
    const checkLabel = RecipeService.checkLabel(resolution.check, actor);
    let blockReason = "";
    if (!eligible) {
      if (!configured.length) blockReason = "This recipe requires a relevant proficiency, but none is configured.";
      else if (proficiencyRows.length === 1) blockReason = `${actor?.name ?? "This character"} requires proficiency in ${proficiencyRows[0].label}.`;
      else {
        const qualifier = resolution.proficiencyMatch === "all" ? "all of" : "one of";
        blockReason = `${actor?.name ?? "This character"} requires ${qualifier}: ${proficiencyRows.map(row => row.label).join(", ")}.`;
      }
    }
    const visibility = RecipeService.normalizePlayerVisibility(recipe?.playerVisibility);
    const publicBlockReason = eligible ? "" : visibility.proficiencies ? blockReason : "You do not meet the requirements to craft this recipe.";
    return {
      ...resolution,
      proficiencyRows,
      qualifies,
      eligible,
      automaticSuccess,
      rollRequired,
      checkLabel,
      blockReason,
      publicBlockReason,
      visibility,
      summary: this.#resolutionSummary(resolution, proficiencyRows, qualifies, checkLabel)
    };
  }

  static async finalizeDueJobs() {
    if (!this.#isActiveGM()) return;
    const now = this.serverTime();
    for (const actor of game.actors.contents.filter(a => a.type === "character")) {
      const job = this.job(actor);
      if (!job || job.mode === "project" || job.status !== "active" || Number(job.endsAt) > now) continue;
      try {
        await this.#finalizeTimed(actor, job);
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to finalize crafting job for ${actor.name}.`, error);
        await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, { ...job, status: "error", error: String(error?.message ?? error) });
      }
    }
  }

  static async #requestTimedCraft(actor, recipeId) {
    this.#assertCharacter(actor);
    const gm = this.#requireActiveGM();
    const recipe = KnowledgeItemService.recipeForActor(actor, String(recipeId));
    if (!recipe) throw new Error(`${actor.name} has not learned this recipe.`);
    const evaluation = this.evaluateResolution(actor, recipe);
    if (!evaluation.eligible) throw new Error(evaluation.publicBlockReason || `${actor.name} does not meet this recipe's requirements.`);
    const payload = this.#baseRequest(REQUEST_TIMED, actor, recipeId);
    payload.rollMessageId = null;
    if (evaluation.rollRequired) {
      const roll = await this.#performRoll(actor, recipe, evaluation.check, "final", payload.requestId, {
        revealCheck: evaluation.visibility.craftingCheck,
        revealDc: evaluation.visibility.craftingDC
      });
      if (!roll) throw new Error("The Crafting Check was cancelled.");
      payload.rollMessageId = roll.messageId;
    }
    return this.#submitRequest(gm, payload);
  }

  static #baseRequest(action, actor, recipeId, projectId="") {
    return {
      action,
      requestId: foundry.utils.randomID(24),
      requesterId: game.user.id,
      actorId: actor.id,
      recipeId: String(recipeId ?? ""),
      projectId: String(projectId ?? "")
    };
  }

  static async #submitRequest(gm, payload) {
    if (gm.id === game.user.id) return this.#executeRequest(payload);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(payload.requestId);
        reject(new Error("The active GM did not respond to the crafting request in time."));
      }, REQUEST_TIMEOUT_MS);
      this.#pending.set(payload.requestId, { resolve, reject, timeout });
      game.socket.emit(SOCKET_CHANNEL, payload);
    });
  }

  static async #onSocket(payload) {
    if (!payload || typeof payload !== "object") return;
    if (payload.action === REST_UNLOCK) {
      if (!this.#isActiveGM()) return;
      try { await this.#executeRestUnlock(payload); }
      catch (error) { console.warn(`${MODULE_ID} | Rest crafting unlock failed.`, error); }
      return;
    }
    if ([REQUEST_TIMED, REQUEST_PROJECT_START, REQUEST_PROJECT_WORK, REQUEST_PROJECT_EXTRA, REQUEST_PROJECT_FINAL, REQUEST_PROJECT_CANCEL].includes(payload.action)) {
      if (!this.#isActiveGM()) return;
      const response = { action: RESPONSE, requestId: payload.requestId, requesterId: payload.requesterId, success: false };
      try {
        response.result = await this.#executeRequest(payload);
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

  static async #executeRequest(request) {
    if (!this.#isActiveGM()) throw new Error("Only the active GM may commit a crafting transaction.");
    if (request.action === REQUEST_TIMED) return this.#executeTimedCraft(request);
    if (request.action === REQUEST_PROJECT_START) return this.#executeProjectStart(request);
    if (request.action === REQUEST_PROJECT_WORK) return this.#executeProjectWork(request);
    if (request.action === REQUEST_PROJECT_EXTRA) return this.#executeProjectExtraEffort(request);
    if (request.action === REQUEST_PROJECT_FINAL) return this.#executeProjectFinal(request);
    if (request.action === REQUEST_PROJECT_CANCEL) return this.#executeProjectCancel(request);
    throw new Error("Unknown Crafting Core request.");
  }

  static #requestContext(request) {
    const requester = game.users.get(String(request.requesterId ?? ""));
    if (!requester) throw new Error("Crafting requester could not be resolved.");
    const actor = game.actors.get(String(request.actorId ?? ""));
    if (!actor || actor.type !== "character") throw new Error("Crafting Actor could not be resolved.");
    if (!actor.testUserPermission(requester, "OWNER") && !requester.isGM) throw new Error("The requesting user does not own this Character.");
    return { requester, actor };
  }

  static async #executeTimedCraft(request) {
    const { requester, actor } = this.#requestContext(request);
    const recipe = KnowledgeItemService.recipeForActor(actor, String(request.recipeId ?? ""));
    if (!recipe) throw new Error(`${actor.name} has not learned this recipe.`);
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");
    if (this.isBusy(actor)) throw new Error(`${actor.name} is already crafting something.`);

    const prepared = this.prepareRecipeForActor(actor, recipe);
    const missing = prepared.ingredientRows.filter(row => !row.sufficient);
    if (missing.length) throw new Error(prepared.playerVisibility?.ingredients
      ? `Missing materials: ${missing.map(row => row.name).join(", ")}.`
      : "Required crafting materials are missing.");
    if (!prepared.resolution.eligible) throw new Error(prepared.resolution.publicBlockReason);

    const rollResult = prepared.resolution.rollRequired
      ? await this.#validateRoll(actor, recipe, requester, request, prepared.resolution.check, "final")
      : { success: true, total: null, message: null };

    if (!rollResult.success) {
      const failure = prepared.resolution.failure;
      const lossPercent = failure.loseMaterials ? failure.lossPercent : 0;
      const lostRequirements = this.#scaledRequirements(recipe.ingredients, lossPercent);
      if (lostRequirements.length) await this.#consumeIngredients(actor, lostRequirements, { revealNames: prepared.playerVisibility?.ingredients });
      await this.#postTimedOutcome(actor, recipe, { success: false, total: rollResult.total, dc: prepared.resolution.check.dc, lossPercent });
      return { actorId: actor.id, recipeId: recipe.id, outcome: "failure", total: rollResult.total, dc: prepared.resolution.check.dc, lossPercent };
    }

    let resultData = recipe.result?.snapshot ? foundry.utils.deepClone(recipe.result.snapshot) : null;
    if (!resultData && recipe.result?.uuid) {
      const resultSource = await fromUuid(recipe.result.uuid);
      if (!(resultSource instanceof Item)) throw new Error(`Result Item not found: ${recipe.result.uuid}`);
      resultData = resultSource.toObject();
    }
    await this.#consumeIngredients(actor, recipe.ingredients, { revealNames: prepared.playerVisibility?.ingredients });
    const startedAt = this.serverTime();
    const endsAt = startedAt + Math.max(0, Number(recipe.craftingTime) || 0) * 1000;
    const job = {
      mode: "timed",
      id: foundry.utils.randomID(20), recipeId: recipe.id, recipeName: recipe.name,
      resultUuid: recipe.result.sourceUuid || recipe.result.uuid, resultQuantity: recipe.result.quantity,
      resultData, startedAt, endsAt, status: "active", requesterId: requester.id,
      resolution: { automaticSuccess: prepared.resolution.automaticSuccess, checkLabel: prepared.resolution.checkLabel, dc: prepared.resolution.check.dc, total: rollResult.total }
    };
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, job);
    if (endsAt <= this.serverTime()) await this.#finalizeTimed(actor, job);
    return { actorId: actor.id, recipeId: recipe.id, outcome: "success", job };
  }

  static async #executeProjectStart(request) {
    const { requester, actor } = this.#requestContext(request);
    if (this.isBusy(actor)) throw new Error(`${actor.name} already has an active crafting project.`);
    const recipe = KnowledgeItemService.recipeForActor(actor, String(request.recipeId ?? ""));
    if (!recipe || recipe.craftingMode !== "project") throw new Error("This is not an available Crafting Project recipe.");
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");
    const prepared = this.prepareRecipeForActor(actor, recipe);
    const missing = prepared.ingredientRows.filter(row => !row.sufficient);
    if (missing.length) throw new Error(prepared.playerVisibility?.ingredients
      ? `Missing materials: ${missing.map(row => row.name).join(", ")}.`
      : "Required crafting materials are missing.");
    if (!prepared.resolution.eligible) throw new Error(prepared.resolution.publicBlockReason);

    const config = RecipeService.normalizeProject(recipe.project);
    const checkApplies = this.#progressCheckApplies({ completedWork: 0, midpointPassed: false }, config);
    const rollResult = checkApplies
      ? await this.#validateRoll(actor, recipe, requester, request, config.progressCheck, "progress")
      : { success: true, total: null, message: null };

    const reservedMaterials = await this.#reserveIngredients(actor, recipe.ingredients, { revealNames: prepared.playerVisibility?.ingredients });
    const snapshot = RecipeService.snapshot(recipe);
    const project = {
      mode: "project", id: foundry.utils.randomID(20), status: "active", phase: "working",
      recipeId: recipe.id, recipeName: recipe.name, recipe: snapshot,
      requiredWork: config.requiredWork, completedWork: 0, cadence: config.cadence,
      midpointPassed: false, workAvailable: false, finalAvailable: false,
      extraEffortAvailable: false, extraEffortUsedThisPeriod: false,
      reservedMaterials, requesterId: requester.id, startedAt: this.serverTime(), updatedAt: this.serverTime(),
      finalPolicy: { automaticSuccess: prepared.resolution.automaticSuccess, rollRequired: prepared.resolution.rollRequired }
    };
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    return this.#applyProgressAttempt(actor, project, snapshot, { checkApplies, rollResult, initial: true });
  }

  static async #executeProjectWork(request) {
    const { requester, actor } = this.#requestContext(request);
    const project = this.project(actor);
    if (!project || project.id !== String(request.projectId ?? "") || project.status !== "active") throw new Error("The active Crafting Project changed.");
    if (project.phase !== "working" || !project.workAvailable) throw new Error("No Work Attempt is currently available for this Project.");
    const recipe = RecipeService.snapshot(project.recipe);
    const config = RecipeService.normalizeProject(recipe.project);
    const checkApplies = this.#progressCheckApplies(project, config);
    const rollResult = checkApplies
      ? await this.#validateRoll(actor, recipe, requester, request, config.progressCheck, "progress", project.id)
      : { success: true, total: null, message: null };
    project.workAvailable = false;
    project.extraEffortAvailable = false;
    project.extraEffortUsedThisPeriod = false;
    project.updatedAt = this.serverTime();
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    return this.#applyProgressAttempt(actor, project, recipe, { checkApplies, rollResult, initial: false });
  }

  static async #executeProjectExtraEffort(request) {
    const { requester, actor } = this.#requestContext(request);
    const project = this.project(actor);
    if (!project || project.id !== String(request.projectId ?? "") || project.status !== "active") throw new Error("The active Crafting Project changed.");
    if (project.phase !== "working" || !project.extraEffortAvailable) throw new Error("No Extra Effort attempt is currently available for this Project.");

    const recipe = RecipeService.snapshot(project.recipe);
    const config = RecipeService.normalizeProject(recipe.project);
    if (!config.extraEffort.enabled) throw new Error("This Recipe does not allow Extra Effort.");
    const rollResult = await this.#validateRoll(actor, recipe, requester, request, config.extraEffort, "extra", project.id);
    project.extraEffortAvailable = false;
    project.extraEffortUsedThisPeriod = true;
    project.updatedAt = this.serverTime();

    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    const facts = [];
    if (visibility.extraEffortCheck && Number.isFinite(Number(rollResult.total))) {
      facts.push(visibility.extraEffortDC
        ? `Extra Effort Check: ${rollResult.total} vs DC ${config.extraEffort.dc}`
        : `Extra Effort Check result: ${rollResult.total}`);
    }

    if (!rollResult.success) {
      const failure = config.extraEffort.failure;
      if (failure.mode === "regress") {
        project.completedWork = Math.max(0, Number(project.completedWork || 0) - failure.regressBy);
      }
      project.lastAttempt = { stage: "extra", success: false, total: rollResult.total, dc: config.extraEffort.dc, at: this.serverTime() };
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
      if (visibility.extraEffortFailure) facts.push(failure.mode === "regress"
        ? `Progress lost: ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}`
        : "No progress was gained or lost.");
      if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);
      await this.#postProjectMessage(actor, recipe, "Extra Effort Failed", failure.mode === "regress"
        ? `The Project regressed by ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}.`
        : "The additional effort produced no progress.");
      return {
        outcome: "extra-failure",
        project: this.prepareProjectForActor(actor, project),
        feedback: this.#feedback("Extra Effort Failed",
          visibility.extraEffortFailure
            ? (failure.mode === "regress" ? "The additional effort caused a setback." : "The additional effort did not produce progress.")
            : "The Extra Effort attempt was unsuccessful.",
          facts, failure.mode === "regress" && visibility.extraEffortFailure ? "warning" : "info", "fa-solid fa-person-running")
      };
    }

    const before = Math.max(0, Number(project.completedWork) || 0);
    project.completedWork = Math.min(project.requiredWork, before + config.extraEffort.progressGain);
    if (config.progressCheck.required && config.progressCheck.timing === "midpoint" && !project.midpointPassed) {
      const midpoint = Math.ceil(config.requiredWork / 2);
      if (before < midpoint && project.completedWork >= midpoint) project.midpointPassed = true;
    }
    project.lastAttempt = { stage: "extra", success: true, total: rollResult.total, dc: config.extraEffort.dc, at: this.serverTime() };
    if (visibility.extraEffort) facts.push(`Extra progress: +${project.completedWork - before}`);
    if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);

    if (project.completedWork >= project.requiredWork) {
      project.extraEffortAvailable = false;
      if (!RecipeService.normalizeCraftingResolution(recipe.craftingResolution).check.required || project.finalPolicy?.automaticSuccess) {
        return this.#completeProject(actor, project, recipe, rollResult, { feedbackFacts: facts, completedBy: "extra" });
      }
      project.phase = "readyFinal";
      project.finalAvailable = true;
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
      await this.#postProjectMessage(actor, recipe, "Extra Effort Complete", visibility.craftingCheck
        ? "The Project is ready for its Final Crafting Check."
        : "The required project work is complete.");
      return {
        outcome: "ready-final",
        project: this.prepareProjectForActor(actor, project),
        feedback: this.#feedback("Extra Effort Successful",
          visibility.craftingCheck ? "The extra effort completed the required work. The Project is ready for its Final Crafting Check." : "The extra effort completed the required project work.",
          facts, "success", "fa-solid fa-person-running")
      };
    }

    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    await this.#postProjectMessage(actor, recipe, "Extra Effort", "The additional effort advanced the Project.");
    return {
      outcome: "extra-success",
      project: this.prepareProjectForActor(actor, project),
      feedback: this.#feedback("Extra Effort Successful", "The additional effort advanced the Project.", facts, "success", "fa-solid fa-person-running")
    };
  }

  static async #executeProjectFinal(request) {
    const { requester, actor } = this.#requestContext(request);
    const project = this.project(actor);
    if (!project || project.id !== String(request.projectId ?? "") || project.status !== "active") throw new Error("The active Crafting Project changed.");
    if (project.phase !== "readyFinal" || !project.finalAvailable) throw new Error("The Final Crafting Check is not currently available.");
    const recipe = RecipeService.snapshot(project.recipe);
    const resolution = RecipeService.normalizeCraftingResolution(recipe.craftingResolution);
    if (!resolution.check.required || project.finalPolicy?.automaticSuccess) return this.#completeProject(actor, project, recipe);
    const rollResult = await this.#validateRoll(actor, recipe, requester, request, resolution.check, "final", project.id);
    project.finalAvailable = false;
    project.updatedAt = this.serverTime();
    if (rollResult.success) return this.#completeProject(actor, project, recipe, rollResult);
    return this.#applyFinalFailure(actor, project, recipe, rollResult);
  }

  static async #executeProjectCancel(request) {
    const { actor } = this.#requestContext(request);
    const project = this.project(actor);
    if (!project || project.id !== String(request.projectId ?? "") || project.status !== "active") throw new Error("The active Crafting Project changed.");
    await this.#refundReservedMaterials(actor, project.reservedMaterials ?? [], 0);
    await actor.unsetFlag(MODULE_ID, FLAGS.CRAFTING_JOB);
    await this.#postProjectMessage(actor, project.recipe, "Project Cancelled", "Reserved materials were returned.");
    return { outcome: "cancelled", actorId: actor.id, recipeId: project.recipeId };
  }

  static async #applyProgressAttempt(actor, project, recipe, { checkApplies, rollResult, initial=false }) {
    const config = RecipeService.normalizeProject(recipe.project);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    const facts = [];
    if (checkApplies && visibility.progressCheck && Number.isFinite(Number(rollResult.total))) {
      facts.push(visibility.progressDC
        ? `Progress Check: ${rollResult.total} vs DC ${config.progressCheck.dc}`
        : `Progress Check result: ${rollResult.total}`);
    }

    if (checkApplies && !rollResult.success) {
      const failure = config.progressCheck.failure;
      if (failure.mode === "failProject") {
        return this.#failProject(actor, project, recipe, failure, { stage: "progress", total: rollResult.total, dc: config.progressCheck.dc });
      }
      if (failure.mode === "regress") project.completedWork = Math.max(0, Number(project.completedWork || 0) - failure.regressBy);
      project.workAvailable = false;
      project.extraEffortAvailable = Boolean(config.extraEffort.enabled);
      project.extraEffortUsedThisPeriod = false;
      project.updatedAt = this.serverTime();
      project.lastAttempt = { stage: "progress", success: false, total: rollResult.total, dc: config.progressCheck.dc, at: this.serverTime(), initial };
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
      const detail = visibility.progressFailure
        ? (failure.mode === "regress"
          ? `The Project regressed by ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}.`
          : "The Project did not advance.")
        : "The Work Attempt failed.";
      if (visibility.progressFailure) facts.push(failure.mode === "regress"
        ? `Progress lost: ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}`
        : "No progress was gained or lost.");
      if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);
      if (config.extraEffort.enabled && visibility.extraEffort) facts.push("Extra Effort is available for this Work Period.");
      await this.#postProjectMessage(actor, recipe, visibility.progressCheck ? "Progress Check Failed" : "Project Work", detail);
      return {
        outcome: "progress-failure",
        project: this.prepareProjectForActor(actor, project),
        feedback: this.#feedback("Work Period Failed",
          visibility.progressFailure
            ? (failure.mode === "regress" ? "The work attempt failed and the Project lost progress." : "The work attempt failed. The opportunity was spent, but the Project did not advance or regress.")
            : "The Work Period was unsuccessful.",
          facts, failure.mode === "regress" && visibility.progressFailure ? "warning" : "info", "fa-solid fa-hammer")
      };
    }

    project.completedWork = Math.min(project.requiredWork, Number(project.completedWork || 0) + 1);
    if (checkApplies && config.progressCheck.timing === "midpoint") project.midpointPassed = true;
    project.workAvailable = false;
    project.extraEffortAvailable = Boolean(config.extraEffort.enabled && project.completedWork < project.requiredWork);
    project.extraEffortUsedThisPeriod = false;
    project.updatedAt = this.serverTime();
    project.lastAttempt = { stage: "progress", success: true, total: rollResult.total, dc: checkApplies ? config.progressCheck.dc : null, at: this.serverTime(), initial };
    if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);
    if (project.extraEffortAvailable && visibility.extraEffort) facts.push("Extra Effort is available for this Work Period.");

    if (project.completedWork >= project.requiredWork) {
      project.extraEffortAvailable = false;
      if (!RecipeService.normalizeCraftingResolution(recipe.craftingResolution).check.required || project.finalPolicy?.automaticSuccess) {
        return this.#completeProject(actor, project, recipe, rollResult, { feedbackFacts: facts, completedBy: "work" });
      }
      project.phase = "readyFinal";
      project.finalAvailable = true;
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
      await this.#postProjectMessage(actor, recipe, "Project Work Complete", visibility.craftingCheck
        ? "The Project is ready for its Final Crafting Check."
        : "The required project work is complete.");
      return {
        outcome: "ready-final",
        project: this.prepareProjectForActor(actor, project),
        feedback: this.#feedback("Work Period Successful",
          visibility.craftingCheck ? "The required work is complete. The Project is ready for its Final Crafting Check." : "The required project work is complete.",
          facts, "success", "fa-solid fa-hammer")
      };
    }

    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    await this.#postProjectMessage(actor, recipe, "Project Progress", "Work on the Project was completed.");
    return {
      outcome: "progress",
      project: this.prepareProjectForActor(actor, project),
      feedback: this.#feedback("Work Period Successful", "The work attempt succeeded and the Project advanced.", facts, "success", "fa-solid fa-hammer")
    };
  }

  static async #applyFinalFailure(actor, project, recipe, rollResult) {
    const resolution = RecipeService.normalizeCraftingResolution(recipe.craftingResolution);
    const failure = resolution.failure;
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    const facts = [];
    if (visibility.craftingCheck && Number.isFinite(Number(rollResult.total))) {
      facts.push(visibility.craftingDC
        ? `Final Crafting Check: ${rollResult.total} vs DC ${resolution.check.dc}`
        : `Final Crafting Check result: ${rollResult.total}`);
    }
    project.lastAttempt = { stage: "final", success: false, total: rollResult.total, dc: resolution.check.dc, at: this.serverTime() };
    if (failure.mode === "failProject") {
      return this.#failProject(actor, project, recipe, failure, { stage: "final", total: rollResult.total, dc: resolution.check.dc });
    }
    if (failure.mode === "regress") {
      project.completedWork = Math.max(0, Number(project.completedWork || 0) - failure.regressBy);
      project.phase = "working";
      project.workAvailable = false;
      project.finalAvailable = false;
      project.extraEffortAvailable = false;
      project.extraEffortUsedThisPeriod = false;
      project.updatedAt = this.serverTime();
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
      if (visibility.failure) facts.push(`Progress lost: ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}`);
      if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);
      await this.#postProjectMessage(actor, recipe, visibility.craftingCheck ? "Final Check Failed" : "Completion Attempt", visibility.failure
        ? `The Project regressed by ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}.`
        : "The completion attempt failed.");
      return {
        outcome: "final-regress",
        project: this.prepareProjectForActor(actor, project),
        feedback: this.#feedback("Final Check Failed",
          visibility.failure ? "The completion attempt failed and the Project regressed." : "The completion attempt was unsuccessful.",
          facts, visibility.failure ? "warning" : "info", "fa-solid fa-triangle-exclamation")
      };
    }
    project.phase = "readyFinal";
    project.finalAvailable = false;
    project.extraEffortAvailable = false;
    project.extraEffortUsedThisPeriod = false;
    project.updatedAt = this.serverTime();
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    if (visibility.failure) facts.push(visibility.craftingTime
      ? `Another ${this.#cadenceLabel(project.cadence)} is required before retrying.`
      : "Another work opportunity is required before retrying.");
    if (visibility.projectProgress) facts.push(`Progress: ${project.completedWork} / ${project.requiredWork}`);
    await this.#postProjectMessage(actor, recipe, visibility.craftingCheck ? "Final Check Failed" : "Completion Attempt", visibility.failure
      ? (visibility.craftingTime
        ? `Another ${this.#cadenceLabel(project.cadence)} is required before a new Final Check attempt.`
        : "Another work opportunity is required before a new completion attempt.")
      : "The completion attempt failed.");
    return {
      outcome: "final-retry",
      project: this.prepareProjectForActor(actor, project),
      feedback: this.#feedback("Final Check Failed",
        visibility.failure ? "The completion attempt failed, but no project progress was lost." : "The completion attempt was unsuccessful.",
        facts, "info", "fa-solid fa-hourglass-half")
    };
  }

  static async #failProject(actor, project, recipe, failure, { stage, total=null, dc=null }={}) {
    const lossPercent = failure.loseMaterials ? failure.lossPercent : 0;
    await this.#refundReservedMaterials(actor, project.reservedMaterials ?? [], lossPercent);
    await actor.unsetFlag(MODULE_ID, FLAGS.CRAFTING_JOB);
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    let detail = "The Project failed and must be restarted.";
    const facts = [];
    const showCheck = stage === "progress" ? visibility.progressCheck : visibility.craftingCheck;
    const showDc = stage === "progress" ? visibility.progressDC : visibility.craftingDC;
    if (showCheck && Number.isFinite(Number(total))) facts.push(showDc
      ? `${stage === "progress" ? "Progress" : "Final Crafting"} Check: ${total} vs DC ${dc}`
      : `${stage === "progress" ? "Progress" : "Final Crafting"} Check result: ${total}`);
    if ((stage === "progress" ? visibility.progressFailure : visibility.failure)) {
      if (lossPercent > 0) {
        const revealPercent = stage === "progress" ? visibility.progressFailurePercent : visibility.failurePercent;
        detail += revealPercent ? ` ${lossPercent}% of reserved materials were lost.` : " Some reserved materials were lost.";
        facts.push(revealPercent ? `Reserved materials lost: ${lossPercent}%` : "Some reserved materials were lost.");
      }
      else {
        detail += " Reserved materials were returned.";
        facts.push("Reserved materials were returned.");
      }
    }
    const title = stage === "progress"
      ? (visibility.progressCheck ? "Progress Check — Project Failed" : "Project Failed")
      : (visibility.craftingCheck ? "Final Check — Project Failed" : "Project Failed");
    await this.#postProjectMessage(actor, recipe, title, detail);
    return {
      outcome: "project-failure", actorId: actor.id, recipeId: recipe.id, stage, total, dc, lossPercent,
      feedback: this.#feedback("Project Failed", "The Project failed and must be restarted.", facts, "danger", "fa-solid fa-triangle-exclamation")
    };
  }

  static async #completeProject(actor, project, recipe, rollResult={ total: null }, { feedbackFacts=[], completedBy="final" }={}) {
    const result = recipe.result;
    let resultData = result?.snapshot ? foundry.utils.deepClone(result.snapshot) : null;
    let sourceUuid = String(result?.sourceUuid || result?.uuid || "");
    if (!resultData) {
      const source = await fromUuid(String(result?.uuid || ""));
      if (!(source instanceof Item)) throw new Error(`Result Item not found: ${result?.uuid}`);
      resultData = source.toObject();
      sourceUuid = source.uuid;
    }
    const finalizing = { ...project, status: "finalizing", updatedAt: this.serverTime() };
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, finalizing);
    const outputQuantity = Math.max(1, Number(result?.quantity) || 1);
    try {
      await this.#createResult(actor, resultData, outputQuantity, sourceUuid);
    } catch (error) {
      await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, {
        ...project,
        status: "active",
        phase: "readyFinal",
        completedWork: Math.max(Number(project.completedWork) || 0, Number(project.requiredWork) || 1),
        workAvailable: false,
        finalAvailable: true,
        extraEffortAvailable: false,
        extraEffortUsedThisPeriod: false,
        updatedAt: this.serverTime()
      });
      throw error;
    }
    await actor.unsetFlag(MODULE_ID, FLAGS.CRAFTING_JOB);
    await this.#postProjectMessage(actor, recipe, "Crafting Successful", "The Project was completed successfully.");
    const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
    const facts = [...(feedbackFacts ?? [])];
    if (visibility.craftingCheck && Number.isFinite(Number(rollResult?.total)) && completedBy === "final") {
      const resolution = RecipeService.normalizeCraftingResolution(recipe.craftingResolution);
      facts.push(visibility.craftingDC
        ? `Final Crafting Check: ${rollResult.total} vs DC ${resolution.check.dc}`
        : `Final Crafting Check result: ${rollResult.total}`);
    }
    if (visibility.output) facts.push(`Created: ${result?.name || resultData?.name || "Item"} ×${outputQuantity}`);
    facts.push("Crafted result added to the character inventory.");
    return {
      outcome: "success", actorId: actor.id, recipeId: recipe.id, total: rollResult?.total ?? null,
      resultName: result?.name || resultData?.name || "Item", resultQuantity: outputQuantity,
      feedback: this.#feedback("Crafting Complete",
        visibility.output
          ? `${result?.name || resultData?.name || "The crafted item"} ×${outputQuantity} was completed successfully.`
          : "The Project was completed successfully.",
        facts, "success", "fa-solid fa-circle-check")
    };
  }

  static async #onRestCompleted(actor, result, config) {
    if (!actor || actor.type !== "character") return;
    const project = this.project(actor);
    if (!project || project.status !== "active") return;
    const restType = String(result?.type || config?.type || "");
    if (!this.#restUnlocks(project.cadence, restType)) return;
    const needsUnlock = (project.phase === "working" && !project.workAvailable)
      || (project.phase === "readyFinal" && !project.finalAvailable);
    if (!needsUnlock) return;
    const payload = { action: REST_UNLOCK, actorId: actor.id, projectId: project.id, restType };
    if (this.#isActiveGM()) await this.#executeRestUnlock(payload);
    else game.socket.emit(SOCKET_CHANNEL, payload);
  }

  static async #executeRestUnlock(payload) {
    if (!this.#isActiveGM()) return false;
    const actor = game.actors.get(String(payload.actorId ?? ""));
    if (!actor || actor.type !== "character") return false;
    const project = this.project(actor);
    if (!project || project.id !== String(payload.projectId ?? "") || project.status !== "active") return false;
    const restType = String(payload.restType || "");
    if (!this.#restUnlocks(project.cadence, restType)) return false;
    let changed = false;
    if (project.phase === "working" && !project.workAvailable) {
      project.workAvailable = true;
      project.extraEffortAvailable = false;
      project.extraEffortUsedThisPeriod = false;
      changed = true;
    }
    if (project.phase === "readyFinal" && !project.finalAvailable) { project.finalAvailable = true; changed = true; }
    if (!changed) return false;
    project.lastRestType = restType;
    project.lastRestAt = this.serverTime();
    project.updatedAt = this.serverTime();
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, project);
    actor.sheet?.render?.({ force: true });
    return true;
  }

  static #restUnlocks(cadence, restType) {
    if (cadence === "short") return restType === "short" || restType === "long";
    return restType === "long";
  }

  static #progressCheckApplies(project, config) {
    const check = config.progressCheck;
    if (!check.required) return false;
    if (check.timing === "every") return true;
    if (project.midpointPassed) return false;
    const midpoint = Math.ceil(config.requiredWork / 2);
    const completed = Math.max(0, Number(project.completedWork) || 0);
    return completed < midpoint && (completed + 1) >= midpoint;
  }

  static async #performRoll(actor, recipe, check, kind, requestId, { projectId="", revealCheck=true, revealDc=true }={}) {
    const kindLabel = kind === "progress" ? "Progress" : kind === "extra" ? "Extra Effort" : "Crafting";
    if (!check?.id) throw new Error(`This recipe does not have a valid ${kindLabel} Check configured.`);
    const label = RecipeService.checkLabel(check, actor);
    const flagData = {
      requestId, requesterId: game.user.id, actorId: actor.id, recipeId: recipe.id, projectId: String(projectId || ""), kind,
      check: { type: check.type, id: check.id, dc: check.dc }, createdAt: Date.now(), consumedAt: 0
    };
    const title = revealCheck
      ? (kind === "progress" ? "Progress Check" : kind === "extra" ? "Extra Effort Check" : "Final Crafting Check")
      : (kind === "progress" ? "Crafting Work" : kind === "extra" ? "Extra Effort" : "Crafting Completion");
    const revealedCheck = revealCheck ? ` · ${foundry.utils.escapeHTML(label)}` : "";
    const revealedDc = revealCheck && revealDc ? ` DC ${check.dc}` : "";
    const message = { data: { flags: { [MODULE_ID]: { [FLAGS.CRAFTING_ROLL]: flagData } }, flavor: `${title} — ${foundry.utils.escapeHTML(recipe.name)}${revealedCheck}${revealedDc}` } };
    const config = revealCheck && revealDc ? { target: check.dc } : {};
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

  static async #validateRoll(actor, recipe, requester, request, expectedCheck, kind, projectId="") {
    const messageId = String(request.rollMessageId || "");
    if (!messageId) throw new Error(`A validated ${kind === "progress" ? "Progress" : kind === "extra" ? "Extra Effort" : "Final Crafting"} Check is required.`);
    const message = await this.#waitForMessage(messageId);
    if (!message) throw new Error("The crafting roll chat message could not be found.");
    const authorId = String(message.author?.id ?? message.user?.id ?? message.user ?? "");
    if (authorId && authorId !== requester.id) throw new Error("The crafting roll was not made by the requesting user.");
    const speakerActor = String(message.speaker?.actor ?? "");
    if (speakerActor && speakerActor !== actor.id) throw new Error("The crafting roll was made for a different Actor.");
    const flag = message.getFlag?.(MODULE_ID, FLAGS.CRAFTING_ROLL) ?? message.flags?.[MODULE_ID]?.[FLAGS.CRAFTING_ROLL];
    if (!flag || typeof flag !== "object") throw new Error("This roll is not a Crafting Core crafting roll.");
    if (Number(flag.consumedAt) > 0) throw new Error("This crafting roll has already been used.");
    if (String(flag.requestId) !== String(request.requestId) || String(flag.requesterId) !== requester.id
      || String(flag.actorId) !== actor.id || String(flag.recipeId) !== recipe.id || String(flag.kind) !== kind
      || String(flag.projectId || "") !== String(projectId || "")) throw new Error("The crafting roll does not match this request.");
    if (String(flag.check?.type) !== String(expectedCheck.type) || String(flag.check?.id) !== String(expectedCheck.id)
      || Number(flag.check?.dc) !== Number(expectedCheck.dc)) throw new Error("The configured crafting check changed after this roll was made.");
    const roll = message.rolls?.[0] ?? message.roll ?? null;
    const total = Number(roll?.total);
    if (!Number.isFinite(total)) throw new Error("Crafting Core could not read the crafting roll total.");
    await message.setFlag?.(MODULE_ID, FLAGS.CRAFTING_ROLL, { ...flag, consumedAt: Date.now() });
    return { success: total >= Number(expectedCheck.dc), total, message };
  }

  static async #waitForMessage(messageId) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const message = game.messages?.get?.(messageId);
      if (message) return message;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return null;
  }

  static async #reserveIngredients(actor, requirements, { revealNames=true }={}) {
    const state = new Map(actor.items.map(item => [item.id, {
      item, quantity: this.#itemQuantity(item), remaining: this.#itemQuantity(item), used: 0
    }]));
    const allocations = [];
    for (let requirementIndex = 0; requirementIndex < (requirements ?? []).length; requirementIndex += 1) {
      const requirement = requirements[requirementIndex];
      let need = Math.max(1, Number(requirement.quantity) || 1);
      const candidates = [...state.values()].filter(row => row.remaining > 0 && RecipeService.itemMatchesReference(row.item, requirement));
      for (const row of candidates) {
        if (need <= 0) break;
        const used = Math.min(row.remaining, need);
        row.remaining -= used;
        row.used += used;
        need -= used;
        const data = row.item.toObject();
        if (this.#hasQuantity(row.item)) data.system.quantity = used;
        allocations.push({
          requirementIndex,
          requirementName: requirement.name || row.item.name,
          itemData: data,
          quantity: used,
          name: row.item.name,
          img: row.item.img,
          type: row.item.type,
          sourceUuid: RecipeService.canonicalUuid(row.item) ?? row.item.uuid
        });
      }
      if (need > 0) throw new Error(revealNames ? `Not enough ${requirement.name}.` : "Not enough required crafting materials.");
    }
    const updates = [];
    const deletes = [];
    for (const row of state.values()) {
      if (row.used <= 0) continue;
      if (this.#hasQuantity(row.item)) {
        if (row.remaining <= 0) deletes.push(row.item.id);
        else updates.push({ _id: row.item.id, "system.quantity": row.remaining });
      } else if (row.remaining <= 0) deletes.push(row.item.id);
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    if (deletes.length) await actor.deleteEmbeddedDocuments("Item", deletes);
    return allocations;
  }

  static async #refundReservedMaterials(actor, reservedMaterials, lossPercent=0) {
    const pct = Math.clamp(Number(lossPercent) || 0, 0, 100);
    const groups = new Map();
    for (const row of reservedMaterials ?? []) {
      const key = Number.isFinite(Number(row.requirementIndex)) ? Number(row.requirementIndex) : `legacy:${row.requirementName || row.name}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const docs = [];
    for (const rows of groups.values()) {
      const total = rows.reduce((sum, row) => sum + Math.max(1, Number(row.quantity) || 1), 0);
      let lossRemaining = pct > 0 ? Math.ceil(total * pct / 100) : 0;
      for (const row of rows) {
        const quantity = Math.max(1, Number(row.quantity) || 1);
        const lostHere = Math.min(quantity, lossRemaining);
        lossRemaining -= lostHere;
        const refund = quantity - lostHere;
        if (refund <= 0) continue;
        const base = foundry.utils.deepClone(row.itemData ?? {});
        delete base._id; delete base.folder; delete base.ownership;
        if (foundry.utils.hasProperty(base, "system.quantity")) {
          base.system.quantity = refund;
          docs.push(base);
        } else {
          for (let i = 0; i < refund; i += 1) docs.push(foundry.utils.deepClone(base));
        }
      }
    }
    if (docs.length) {
      const plain = [];
      for (const data of docs) {
        if (MaterialStackService.isCraftingMaterial(data) && foundry.utils.hasProperty(data, "system.quantity")) {
          await MaterialStackService.createOrStack(actor, data, Math.max(1, Number(data.system.quantity) || 1));
        } else plain.push(data);
      }
      if (plain.length) await actor.createEmbeddedDocuments("Item", plain);
    }
  }

  static #reservedSummary(rows) {
    const map = new Map();
    for (const row of rows ?? []) {
      const key = `${row.name}|${row.sourceUuid}`;
      const current = map.get(key) ?? { name: row.name || "Item", img: row.img || "icons/svg/item-bag.svg", quantity: 0 };
      current.quantity += Math.max(1, Number(row.quantity) || 1);
      map.set(key, current);
    }
    return [...map.values()];
  }

  static #scaledRequirements(requirements, percent) {
    const pct = Math.clamp(Number(percent) || 0, 0, 100);
    if (pct <= 0) return [];
    return (requirements ?? []).map(requirement => ({ ...requirement, quantity: Math.ceil(Math.max(1, Number(requirement.quantity) || 1) * pct / 100) })).filter(requirement => requirement.quantity > 0);
  }

  static async #consumeIngredients(actor, requirements, { revealNames=true }={}) {
    const state = new Map(actor.items.map(item => [item.id, { item, quantity: this.#itemQuantity(item), remaining: this.#itemQuantity(item) }]));
    for (const requirement of requirements) {
      let need = Math.max(1, Number(requirement.quantity) || 1);
      const candidates = [...state.values()].filter(row => row.remaining > 0 && RecipeService.itemMatchesReference(row.item, requirement));
      for (const row of candidates) {
        if (need <= 0) break;
        const used = Math.min(row.remaining, need); row.remaining -= used; need -= used;
      }
      if (need > 0) throw new Error(revealNames ? `Not enough ${requirement.name}.` : "Not enough required crafting materials.");
    }
    const updates = [];
    const deletes = [];
    for (const { item, quantity, remaining } of state.values()) {
      if (remaining === quantity) continue;
      if (this.#hasQuantity(item)) {
        if (remaining <= 0) deletes.push(item.id); else updates.push({ _id: item.id, "system.quantity": remaining });
      } else if (remaining <= 0) deletes.push(item.id);
    }
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
    if (deletes.length) await actor.deleteEmbeddedDocuments("Item", deletes);
  }

  static async #postTimedOutcome(actor, recipe, { success, total=null, dc=null, lossPercent=0 }={}) {
    if (!globalThis.ChatMessage?.create) return;
    const visibility = RecipeService.normalizePlayerVisibility(recipe?.playerVisibility);
    let content = success ? `<p><strong>${foundry.utils.escapeHTML(recipe.name)}</strong> was crafted successfully.</p>` : `<p><strong>${foundry.utils.escapeHTML(recipe.name)}</strong> failed.</p>`;
    if (!success && visibility.craftingCheck && Number.isFinite(Number(total))) content += visibility.craftingDC
      ? `<p>Crafting Check: <strong>${total}</strong> vs DC <strong>${dc}</strong>.</p>` : `<p>Crafting Check result: <strong>${total}</strong>.</p>`;
    if (!success && visibility.failure) {
      if (lossPercent > 0) content += visibility.failurePercent ? `<p>${lossPercent}% of the required materials were lost.</p>` : `<p>Some required materials were lost.</p>`;
      else content += `<p>No materials were lost.</p>`;
    }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { [MODULE_ID]: { craftingOutcome: { recipeId: recipe.id, success, total, dc, lossPercent } } } });
  }

  static async #postProjectMessage(actor, recipe, title, detail) {
    if (!globalThis.ChatMessage?.create) return;
    const visibility = RecipeService.normalizePlayerVisibility(recipe?.playerVisibility);
    let content = `<p><strong>${foundry.utils.escapeHTML(title)}</strong> — ${foundry.utils.escapeHTML(recipe?.name || "Crafting Project")}</p>`;
    if (detail) content += `<p>${foundry.utils.escapeHTML(detail)}</p>`;
    // Exact progress is only included when the GM allows it.
    const project = this.project(actor);
    if (project && visibility.projectProgress) content += `<p>Progress: <strong>${project.completedWork} / ${project.requiredWork}</strong>.</p>`;
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { [MODULE_ID]: { craftingProject: { recipeId: recipe?.id, title } } } });
  }

  static async #finalizeTimed(actor, expectedJob) {
    const current = this.job(actor);
    if (!current || current.mode === "project" || current.status !== "active" || current.id !== expectedJob.id) return false;
    if (Number(current.endsAt) > this.serverTime()) return false;
    await actor.setFlag(MODULE_ID, FLAGS.CRAFTING_JOB, { ...current, status: "finalizing" });
    const recipe = KnowledgeItemService.recipeForActor(actor, current.recipeId);
    const quantity = Math.max(1, Number(current.resultQuantity) || 1);
    let resultData = current.resultData ? foundry.utils.deepClone(current.resultData) : null;
    let sourceUuid = String(current.resultUuid || "");
    if (!resultData) {
      const source = await fromUuid(sourceUuid);
      if (!(source instanceof Item)) throw new Error(`Result Item not found: ${sourceUuid}`);
      resultData = source.toObject(); sourceUuid = source.uuid;
    }
    await this.#createResult(actor, resultData, quantity, sourceUuid);
    await actor.unsetFlag(MODULE_ID, FLAGS.CRAFTING_JOB);
    ui.notifications.info(`${actor.name} completed ${recipe?.name ?? current.recipeName ?? "crafting"}.`);
    return true;
  }

  static async #createResult(actor, sourceData, quantity, sourceUuid) {
    const data = foundry.utils.deepClone(sourceData);
    delete data._id; delete data.folder; delete data.ownership;
    data.flags ??= {}; data.flags[MODULE_ID] ??= {}; data.flags[MODULE_ID][FLAGS.SOURCE_UUID] = sourceUuid;
    if (foundry.utils.hasProperty(data, "system.quantity")) {
      await MaterialStackService.createOrStack(actor, data, quantity);
      return;
    }
    await actor.createEmbeddedDocuments("Item", Array.from({ length: quantity }, () => foundry.utils.deepClone(data)));
  }

  static #feedback(title, message, facts=[], tone="info", icon="fa-solid fa-hammer") {
    return { title, message, facts: (facts ?? []).filter(Boolean), tone, icon };
  }

  static #failureLabel(failure, { final=false, revealPercent=true }={}) {
    if (!failure) return "No consequence";
    if (failure.mode === "regress") return `Regress ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}`;
    if (failure.mode === "failProject") {
      if (!failure.loseMaterials) return "Fail Project · materials returned";
      return revealPercent ? `Fail Project · lose ${failure.lossPercent}% materials` : "Fail Project · lose some materials";
    }
    return final ? "Stay ready; retry after rest" : "No Progress";
  }

  static #resolutionSummary(resolution, proficiencyRows, qualifies, checkLabel) {
    const parts = [];
    if (proficiencyRows.length) {
      const joiner = resolution.proficiencyMatch === "all" ? " + " : " or ";
      parts.push(`${proficiencyRows.map(row => row.label).join(joiner)}${qualifies ? " ✓" : ""}`);
    }
    if (resolution.check.required) parts.push(`${checkLabel} DC ${resolution.check.dc}`); else parts.push("No final check required");
    if (resolution.check.required) parts.push(this.#failureLabel(resolution.failure, { final: true }));
    return parts.join(" · ");
  }

  static #cadenceLabel(cadence) { return cadence === "short" ? "Short Rest" : "Long Rest"; }
  static #hasQuantity(item) { return foundry.utils.hasProperty(item, "system.quantity") && Number.isFinite(Number(item.system.quantity)); }
  static #itemQuantity(item) { return this.#hasQuantity(item) ? Math.max(0, Number(item.system.quantity) || 0) : 1; }
  static #assertCharacter(actor) { if (!actor || actor.type !== "character") throw new Error("Crafting requires a Character Actor."); }
  static #requireActiveGM() { const gm = this.#activeGM(); if (!gm) throw new Error("A connected GM is required to begin crafting."); return gm; }
  static #activeGM() {
    const preferred = game.users?.activeGM;
    if (preferred?.active && preferred.isGM) return preferred;
    return game.users?.contents?.filter(user => user.active && user.isGM).sort((a, b) => String(a.id).localeCompare(String(b.id)))[0] ?? null;
  }
  static #isActiveGM() { return Boolean(game.user?.isGM && this.#activeGM()?.id === game.user.id); }
}
