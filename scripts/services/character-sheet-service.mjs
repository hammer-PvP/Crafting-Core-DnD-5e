import { FLAGS, MODULE_ID } from "../constants.mjs";
import { CraftingService } from "./crafting-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { ResultDialog } from "../ui/result-dialog.mjs";

export class CharacterSheetService {
  static #selection = new Map();
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

    Hooks.on("updateActor", (actor, changes) => {
      if (actor?.type !== "character") return;
      const flagChanges = changes?.flags?.[MODULE_ID];
      if (!flagChanges || (!(FLAGS.CRAFTING_JOB in flagChanges) && !(`-=${FLAGS.CRAFTING_JOB}` in flagChanges))) return;
      actor.sheet?.render?.({ force: true });
    });

    Hooks.on(`${MODULE_ID}.recipesChanged`, () => {
      for (const app of Object.values(ui.windows ?? {})) if (this.#isCharacterSheet(app)) app.render({ force: true });
    });
  }

  static #prepareContext(actor, sheet) {
    const recipes = KnowledgeItemService.knownRecipes(actor);
    const preparedRecipes = recipes.map(recipe => CraftingService.prepareRecipeForActor(actor, recipe));
    const job = CraftingService.job(actor);
    const activeProject = job?.mode === "project" ? CraftingService.prepareProjectForActor(actor, job) : null;

    let selected = this.#selection.get(sheet.id ?? actor.id);
    if (!preparedRecipes.some(recipe => recipe.id === selected)) selected = activeProject?.recipeId ?? preparedRecipes[0]?.id ?? null;
    if (selected) this.#selection.set(sheet.id ?? actor.id, selected);
    let prepared = selected ? preparedRecipes.find(recipe => recipe.id === selected) ?? null : null;
    if (activeProject && prepared?.id === activeProject.recipeId) {
      prepared = CraftingService.prepareRecipeForActor(actor, activeProject.recipe);
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
        hasRecipes: preparedRecipes.length > 0,
        busy,
        activeProject,
        selectedIsActiveProject,
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
        this.#selection.set(app.id ?? app.actor?.id, button.dataset.recipeId);
        app.render({ force: true });
      });
    });

    this.#bindAsync(root, app, "craft", async actor => {
      const recipeId = this.#selection.get(app.id ?? actor.id);
      if (!recipeId) return;
      return CraftingService.requestCraft(actor, recipeId);
    });
    this.#bindAsync(root, app, "start-project", async actor => {
      const recipeId = this.#selection.get(app.id ?? actor.id);
      if (!recipeId) return;
      return CraftingService.requestStartProject(actor, recipeId);
    });
    this.#bindAsync(root, app, "work-project", actor => CraftingService.requestWorkOnProject(actor));
    this.#bindAsync(root, app, "extra-effort", actor => CraftingService.requestExtraEffort(actor));
    this.#bindAsync(root, app, "final-project", actor => CraftingService.requestFinalCheck(actor));

    const cancel = root.querySelector('.crafting-core-tab [data-action="cancel-project"]');
    if (cancel && !cancel.dataset.ccBound) {
      cancel.dataset.ccBound = "true";
      cancel.addEventListener("click", async event => {
        event.preventDefault();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Cancel Crafting Project" },
          content: "<p>Cancel the active Crafting Project? All still-reserved materials will be returned.</p>",
          yes: { label: "Cancel Project", icon: "fa-solid fa-ban" }, no: { label: "Keep Project" }
        });
        if (!confirmed) return;
        cancel.disabled = true;
        try {
          await CraftingService.requestCancelProject(app.actor ?? app.document);
          app.render({ force: true });
        } catch (error) {
          console.error(`${MODULE_ID} | Cancel project failed.`, error);
          ui.notifications.error(error.message ?? "Crafting Core could not cancel the Project.");
          cancel.disabled = false;
        }
      });
    }
  }

  static #bindAsync(root, app, action, handler) {
    const button = root.querySelector(`.crafting-core-tab [data-action="${action}"]`);
    if (!button || button.dataset.ccBound) return;
    button.dataset.ccBound = "true";
    button.addEventListener("click", async event => {
      event.preventDefault(); button.disabled = true;
      try {
        const result = await handler(app.actor ?? app.document);
        // ApplicationV2 rendering is asynchronous. Await the sheet refresh before
        // opening the result dialog so the sheet cannot finish rendering afterward
        // and steal the foreground from the Crafting Core message.
        await app.render({ force: true });
        if (result?.feedback) await ResultDialog.show(result.feedback);
        else if (result?.outcome === "failure") ui.notifications.warn("Crafting failed.");
      } catch (error) {
        console.error(`${MODULE_ID} | Crafting action failed.`, error);
        await ResultDialog.error(error.message ?? "Crafting Core could not perform that crafting action.");
        button.disabled = false;
      }
    });
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
