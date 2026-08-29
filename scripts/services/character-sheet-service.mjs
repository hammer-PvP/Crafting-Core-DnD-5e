import { FLAGS, MODULE_ID } from "../constants.mjs";
import { CraftingService } from "./crafting-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { ResultDialog } from "../ui/result-dialog.mjs";

export class CharacterSheetService {
  static #selection = new Map();
  static #displayedRecipe = new Map();
  static #staleSelection = new Map();
  static #unlearnPending = new Set();
  static #patched = false;

  static patchDnd5eSheet() {
    if (this.#patched) return true;
    const Sheet = globalThis.dnd5e?.applications?.actor?.CharacterActorSheet;
    if (!Sheet) {
      console.error(`${MODULE_ID} | D&D5e CharacterActorSheet was not available during initialization.`);
      return false;
    }
    Sheet.PARTS.crafting = {
      container: { classes: ["tab-body"], id: "tabs" },
      template: `modules/${MODULE_ID}/templates/character-crafting.hbs`,
      scrollable: [""]
    };
    if (!Sheet.TABS.some(entry => entry.tab === "crafting")) {
      const effectsIndex = Sheet.TABS.findIndex(entry => entry.tab === "effects");
      const descriptor = { tab: "crafting", label: "Crafting", icon: "fa-solid fa-hammer" };
      Sheet.TABS.splice(effectsIndex >= 0 ? effectsIndex + 1 : Sheet.TABS.length, 0, descriptor);
    }
    this.#patched = true;
    return true;
  }

  static installHooks() {
    Hooks.on("dnd5e.prepareSheetContext", (sheet, partId, context) => {
      if (partId !== "crafting") return;
      const actor = sheet.actor ?? sheet.document;
      if (!actor || actor.type !== "character") return;
      Object.assign(context, this.#prepareContext(actor, sheet));
    });

    Hooks.on("renderApplicationV2", (app, element) => {
      if (!this.#isCharacterSheet(app)) return;
      const root = element instanceof HTMLElement ? element : app.element;
      const tab = root?.querySelector('[data-tab="crafting"][data-group="primary"]');
      if (!tab) return;
      this.#activateListeners(app, root);
      this.#animateTimedJob(app, root);
    });

    Hooks.on("updateActor", (actor, changes, _options) => {
      if (actor?.type !== "character") return;
      const flagChanges = changes?.flags?.[MODULE_ID] ?? {};
      const topKeys = Object.keys(changes ?? {});
      const flatChanged = prefix => topKeys.some(key => key === prefix || key.startsWith(`${prefix}.`));
      const craftingPrefix = `flags.${MODULE_ID}.${FLAGS.CRAFTING_JOB}`;
      const learnedPrefix = `flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}`;
      const legacyPrefix = `flags.${MODULE_ID}.${FLAGS.KNOWN_RECIPES}`;

      if ((FLAGS.CRAFTING_JOB in flagChanges) || (`-=${FLAGS.CRAFTING_JOB}` in flagChanges) || flatChanged(craftingPrefix)) {
        this.#renderActorSheets(actor);
        return;
      }

      if ((FLAGS.LEARNED_RECIPES in flagChanges) || (`-=${FLAGS.LEARNED_RECIPES}` in flagChanges)
        || (FLAGS.KNOWN_RECIPES in flagChanges) || (`-=${FLAGS.KNOWN_RECIPES}` in flagChanges)
        || flatChanged(learnedPrefix) || flatChanged(legacyPrefix)) {
        this.#handleKnowledgeUpdate(actor);
      }
    });
  }

  static #sheetKey(sheet, actor=null) {
    return String(sheet?.id ?? actor?.id ?? "crafting-core-character");
  }

  static #prepareContext(actor, sheet) {
    const entries = KnowledgeItemService.knownRecipeEntries(actor);
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    let preparedRecipes = entries.map(entry => ({
      ...CraftingService.prepareRecipeForActor(actor, entry.recipe),
      publishedRevision: entry.publishedRevision,
      publishedSourceUuid: entry.publishedSourceUuid
    }));
    const job = CraftingService.job(actor);
    const activeProject = job?.mode === "project" ? CraftingService.prepareProjectForActor(actor, job) : null;
    if (activeProject && !preparedRecipes.some(recipe => recipe.id === activeProject.recipeId)) {
      preparedRecipes = [{
        ...CraftingService.prepareRecipeForActor(actor, activeProject.recipe),
        publishedRevision: 0,
        publishedSourceUuid: "",
        activeProjectOnly: true
      }, ...preparedRecipes];
    }
    const key = this.#sheetKey(sheet, actor);

    let selected = this.#selection.get(key);
    if (!preparedRecipes.some(recipe => recipe.id === selected)) selected = activeProject?.recipeId ?? preparedRecipes[0]?.id ?? null;
    if (selected) this.#selection.set(key, selected);
    else this.#selection.delete(key);

    let prepared = selected ? preparedRecipes.find(recipe => recipe.id === selected) ?? null : null;
    const stale = this.#staleSelection.get(key);
    const displayed = this.#displayedRecipe.get(key);
    if (stale?.recipeId === selected && displayed?.recipeId === selected && displayed?.recipe) {
      prepared = {
        ...CraftingService.prepareRecipeForActor(actor, displayed.recipe),
        publishedRevision: displayed.revision,
        publishedSourceUuid: displayed.sourceUuid
      };
    }

    if (activeProject && prepared?.id === activeProject.recipeId) {
      prepared = {
        ...CraftingService.prepareRecipeForActor(actor, activeProject.recipe),
        publishedRevision: entryById.get(activeProject.recipeId)?.publishedRevision ?? 0,
        publishedSourceUuid: entryById.get(activeProject.recipeId)?.publishedSourceUuid ?? ""
      };
    }

    if (selected && !(stale?.recipeId === selected)) {
      const entry = entryById.get(selected);
      if (entry) {
        this.#displayedRecipe.set(key, {
          recipeId: selected,
          recipe: RecipeService.snapshot(entry.recipe),
          revision: entry.publishedRevision,
          sourceUuid: entry.publishedSourceUuid
        });
      }
    }

    let timedJob = null;
    if (job && job.mode !== "project" && ["active", "finalizing"].includes(job.status)) {
      const now = CraftingService.serverTime();
      const progress = job.status === "active"
        ? Math.clamp(((now - Number(job.startedAt)) / Math.max(1, Number(job.endsAt) - Number(job.startedAt))) * 100, 0, 100)
        : 100;
      timedJob = { ...job, progress };
    }

    const busy = Boolean(job && ["active", "finalizing"].includes(job.status));
    const selectedIsActiveProject = Boolean(activeProject && prepared?.id === activeProject.recipeId);
    const list = preparedRecipes.map(recipe => ({
      ...recipe,
      selected: recipe.id === selected,
      active: Boolean(activeProject && activeProject.recipeId === recipe.id),
      modeLabel: recipe.craftingMode === "project" ? "Project" : "Timed"
    }));

    return {
      craftingCore: {
        recipes: list,
        selectedRecipe: prepared,
        selectedRecipeId: selected,
        hasRecipes: preparedRecipes.length > 0,
        busy,
        activeProject,
        selectedIsActiveProject,
        selectedCanUnlearn: Boolean(prepared && !selectedIsActiveProject),
        timedJob,
        hasActiveProject: Boolean(activeProject),
        selectedCanStart: Boolean(prepared?.canCraft && !busy),
        selectedBlockedByOtherProject: Boolean(activeProject && prepared && activeProject.recipeId !== prepared.id)
      }
    };
  }

  static #activateListeners(app, root) {
    root.querySelectorAll('.crafting-core-tab [data-action="select-recipe"][data-recipe-id]').forEach(button => {
      if (button.dataset.ccBound) return;
      button.dataset.ccBound = "true";
      button.addEventListener("click", event => {
        event.preventDefault();
        const key = this.#sheetKey(app, app.actor ?? app.document);
        this.#selection.set(key, button.dataset.recipeId);
        this.#staleSelection.delete(key);
        this.#displayedRecipe.delete(key);
        app.render({ force: true });
      });
    });

    this.#bindAsync(root, app, "craft", async actor => {
      const recipeId = this.#selection.get(this.#sheetKey(app, actor));
      if (!recipeId) return;
      const staleFeedback = this.#consumeFreshnessGate(app, actor, recipeId);
      if (staleFeedback) return { feedback: staleFeedback, refreshOnly: true };
      return CraftingService.requestCraft(actor, recipeId);
    });
    this.#bindAsync(root, app, "start-project", async actor => {
      const recipeId = this.#selection.get(this.#sheetKey(app, actor));
      if (!recipeId) return;
      const staleFeedback = this.#consumeFreshnessGate(app, actor, recipeId);
      if (staleFeedback) return { feedback: staleFeedback, refreshOnly: true };
      return CraftingService.requestStartProject(actor, recipeId);
    });
    this.#bindAsync(root, app, "work-project", actor => CraftingService.requestWorkOnProject(actor));
    this.#bindAsync(root, app, "extra-effort", actor => CraftingService.requestExtraEffort(actor));
    this.#bindAsync(root, app, "final-project", actor => CraftingService.requestFinalCheck(actor));

    const unlearn = root.querySelector('.crafting-core-tab [data-action="unlearn-recipe"]');
    if (unlearn && !unlearn.dataset.ccBound) {
      unlearn.dataset.ccBound = "true";
      unlearn.addEventListener("click", event => this.#unlearnRecipe(event, app, unlearn));
    }

    const cancel = root.querySelector('.crafting-core-tab [data-action="cancel-project"]');
    if (cancel && !cancel.dataset.ccBound) {
      cancel.dataset.ccBound = "true";
      cancel.addEventListener("click", async event => {
        event.preventDefault();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Cancel Crafting Project" },
          content: "<p>Cancel the active Crafting Project? All still-reserved materials will be returned.</p>",
          modal: true,
          render: (_event, dialog) => { dialog?.bringToFront?.(); requestAnimationFrame(() => dialog?.bringToFront?.()); },
          yes: { label: "Cancel Project", icon: "fa-solid fa-ban" }, no: { label: "Keep Project" }
        });
        if (!confirmed) return;
        cancel.disabled = true;
        try {
          await CraftingService.requestCancelProject(app.actor ?? app.document);
          await app.render({ force: true });
        } catch (error) {
          console.error(`${MODULE_ID} | Cancel project failed.`, error);
          await ResultDialog.error(error.message ?? "Crafting Core could not cancel the Project.");
          cancel.disabled = false;
        }
      });
    }
  }

  static #consumeFreshnessGate(app, actor, recipeId) {
    const key = this.#sheetKey(app, actor);
    const displayed = this.#displayedRecipe.get(key);
    const current = KnowledgeItemService.entryForActor(actor, recipeId);
    const stale = this.#staleSelection.get(key);
    if (!current) {
      this.#staleSelection.delete(key);
      this.#displayedRecipe.delete(key);
      return {
        title: "Recipe No Longer Available",
        message: "This Recipe is no longer part of this Character's known Recipes. The Crafting tab has been refreshed.",
        tone: "warning",
        icon: "fa-solid fa-book"
      };
    }
    const changed = Boolean(stale?.recipeId === recipeId)
      || (displayed?.recipeId === recipeId && Number(displayed.revision || 0) !== Number(current.publishedRevision || 0));
    if (!changed) return null;
    this.#staleSelection.delete(key);
    this.#displayedRecipe.delete(key);
    return {
      title: "Recipe Updated",
      message: "This Recipe changed after you opened it. The latest published version has been loaded. Review its requirements before crafting.",
      facts: [`Published revision: ${current.publishedRevision}`],
      tone: "warning",
      icon: "fa-solid fa-rotate"
    };
  }

  static async #unlearnRecipe(event, app, button) {
    event.preventDefault();
    const actor = app.actor ?? app.document;
    const key = `${actor?.id ?? "actor"}:${this.#selection.get(this.#sheetKey(app, actor)) ?? "recipe"}`;
    if (this.#unlearnPending.has(key)) return;
    const recipeId = this.#selection.get(this.#sheetKey(app, actor));
    const entry = recipeId ? KnowledgeItemService.entryForActor(actor, recipeId) : null;
    if (!entry) return;
    const activeProject = CraftingService.project(actor);
    if (activeProject?.recipeId === recipeId) {
      await ResultDialog.show({
        title: "Unable to Unlearn Recipe",
        message: "This Recipe is currently being used by the active Crafting Project. Complete or cancel that Project before forgetting it.",
        tone: "warning",
        icon: "fa-solid fa-lock"
      });
      return;
    }

    this.#unlearnPending.add(key);
    button.disabled = true;
    try {
      const confirmed = await ResultDialog.confirmPhrase({
        title: "Unlearn Recipe",
        message: `You are about to forget ${entry.recipe.name}.`,
        warning: "You may not be able to learn this Recipe again unless you obtain another valid Knowledge Source.",
        phrase: "I AGREE",
        confirmLabel: "Unlearn Recipe",
        icon: "fa-solid fa-book-skull"
      });
      if (!confirmed) return;
      const removed = await KnowledgeItemService.unlearn(actor, recipeId);
      if (!removed) throw new Error("This Character no longer knows that Recipe.");
      this.#selection.delete(this.#sheetKey(app, actor));
      this.#staleSelection.delete(this.#sheetKey(app, actor));
      this.#displayedRecipe.delete(this.#sheetKey(app, actor));
      await app.render({ force: true });
      await ResultDialog.show({
        title: "Recipe Forgotten",
        message: `${entry.recipe.name} has been removed from ${actor.name}'s known Recipes.`,
        facts: ["You may need to obtain another valid Knowledge Source to learn it again."],
        tone: "success",
        icon: "fa-solid fa-book"
      });
    } catch (error) {
      console.error(`${MODULE_ID} | Unlearn Recipe failed.`, error);
      await ResultDialog.error(error.message ?? "Crafting Core could not forget that Recipe.", "Unable to Unlearn Recipe");
    } finally {
      this.#unlearnPending.delete(key);
      if (button.isConnected) button.disabled = false;
    }
  }

  static #bindAsync(root, app, action, handler) {
    const button = root.querySelector(`.crafting-core-tab [data-action="${action}"]`);
    if (!button || button.dataset.ccBound) return;
    button.dataset.ccBound = "true";
    button.addEventListener("click", async event => {
      event.preventDefault();
      button.disabled = true;
      try {
        const result = await handler(app.actor ?? app.document);
        await app.render({ force: true });
        if (result?.feedback) await ResultDialog.show(result.feedback);
        else if (result?.outcome === "failure") ui.notifications.warn("Crafting failed.");
      } catch (error) {
        console.error(`${MODULE_ID} | Crafting action failed.`, error);
        await ResultDialog.error(error.message ?? "Crafting Core could not perform that crafting action.");
        if (button.isConnected) button.disabled = false;
      }
    });
  }

  static #handleKnowledgeUpdate(actor) {
    const sheets = this.#actorSheets(actor);
    for (const app of sheets) {
      const key = this.#sheetKey(app, actor);
      const selected = this.#selection.get(key);
      if (!selected) { void app.render({ force: true }); continue; }
      const current = KnowledgeItemService.entryForActor(actor, selected);
      const displayed = this.#displayedRecipe.get(key);
      if (!current) {
        this.#staleSelection.delete(key);
        this.#displayedRecipe.delete(key);
        void app.render({ force: true });
        continue;
      }
      if (displayed?.recipeId === selected && Number(displayed.revision || 0) !== Number(current.publishedRevision || 0)) {
        // Refresh the surrounding Crafting UI immediately, but preserve the selected Recipe detail as the
        // version the player was reading. The next Craft/Start action performs the freshness gate.
        this.#staleSelection.set(key, { recipeId: selected, revision: current.publishedRevision });
        void app.render({ force: true });
        continue;
      }
      void app.render({ force: true });
    }
  }

  static #actorSheets(actor) {
    const windows = Object.values(ui.windows ?? {}).filter(app => this.#isCharacterSheet(app)
      && String((app.actor ?? app.document)?.id ?? "") === String(actor.id));
    if (!windows.length && actor.sheet && this.#isCharacterSheet(actor.sheet)) windows.push(actor.sheet);
    return [...new Set(windows)];
  }

  static #renderActorSheets(actor) {
    for (const app of this.#actorSheets(actor)) void app.render({ force: true });
  }

  static #animateTimedJob(app, root) {
    const bar = root.querySelector('.crafting-core-tab [data-crafting-progress]');
    if (!bar) return;
    const actor = app.actor ?? app.document;
    const job = CraftingService.job(actor);
    if (!job || job.mode === "project" || job.status !== "active") return;
    const jobId = job.id;
    const tick = () => {
      if (!bar.isConnected) return;
      const current = CraftingService.job(actor);
      if (!current || current.id !== jobId || current.mode === "project" || current.status !== "active") return;
      const span = Math.max(1, Number(current.endsAt) - Number(current.startedAt));
      const progress = Math.clamp(((CraftingService.serverTime() - Number(current.startedAt)) / span) * 100, 0, 100);
      bar.style.width = `${progress}%`;
      if (progress < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  static #isCharacterSheet(app) {
    const actor = app?.actor ?? app?.document;
    return Boolean(actor?.type === "character" && (app.constructor?.name === "CharacterActorSheet" || app?.options?.classes?.includes?.("character")));
  }
}
