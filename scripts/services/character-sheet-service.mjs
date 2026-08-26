import { MODULE_ID } from "../constants.mjs";
import { CraftingService } from "./crafting-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";

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
      this.#animateJob(app, root);
    });

    Hooks.on(`${MODULE_ID}.recipesChanged`, () => {
      for (const app of Object.values(ui.windows ?? {})) {
        if (this.#isCharacterSheet(app)) app.render({ force: true });
      }
    });
  }

  static #prepareContext(actor, sheet) {
    const recipes = KnowledgeItemService.knownRecipes(actor);
    const preparedRecipes = recipes.map(recipe => CraftingService.prepareRecipeForActor(actor, recipe));
    let selected = this.#selection.get(sheet.id ?? actor.id);
    if (!preparedRecipes.some(recipe => recipe.id === selected)) selected = preparedRecipes[0]?.id ?? null;
    if (selected) this.#selection.set(sheet.id ?? actor.id, selected);

    const prepared = selected ? preparedRecipes.find(recipe => recipe.id === selected) ?? null : null;
    const job = CraftingService.job(actor);
    const now = CraftingService.serverTime();
    const progress = job?.status === "active"
      ? Math.clamp(((now - Number(job.startedAt)) / Math.max(1, Number(job.endsAt) - Number(job.startedAt))) * 100, 0, 100)
      : 0;

    return {
      craftingCore: {
        recipes: preparedRecipes.map(recipe => ({ ...recipe, selected: recipe.id === selected })),
        selectedRecipe: prepared,
        hasRecipes: preparedRecipes.length > 0,
        job: job ? { ...job, progress } : null,
        busy: Boolean(job && ["active", "finalizing"].includes(job.status))
      }
    };
  }

  static #activateListeners(app, root) {
    const select = root.querySelector('.crafting-core-tab select[data-action="select-recipe"]');
    if (select && !select.dataset.ccBound) {
      select.dataset.ccBound = "true";
      select.addEventListener("change", () => {
        this.#selection.set(app.id ?? app.actor?.id, select.value);
        app.render({ force: true });
      });
    }

    const craft = root.querySelector('.crafting-core-tab [data-action="craft"]');
    if (craft && !craft.dataset.ccBound) {
      craft.dataset.ccBound = "true";
      craft.addEventListener("click", async event => {
        event.preventDefault();
        const actor = app.actor ?? app.document;
        const recipeId = this.#selection.get(app.id ?? actor.id) ?? craft.dataset.recipeId;
        if (!recipeId) return;
        craft.disabled = true;
        try {
          await CraftingService.requestCraft(actor, recipeId);
          app.render({ force: true });
        } catch (error) {
          console.error(`${MODULE_ID} | Craft failed.`, error);
          ui.notifications.error(error.message ?? "Crafting Core could not begin crafting.");
          craft.disabled = false;
        }
      });
    }
  }

  static #animateJob(app, root) {
    const bar = root.querySelector('.crafting-core-tab [data-crafting-progress]');
    if (!bar) return;
    const actor = app.actor ?? app.document;
    const job = CraftingService.job(actor);
    if (!job || job.status !== "active") return;
    const jobId = job.id;

    const tick = () => {
      if (!bar.isConnected) return;
      const current = CraftingService.job(actor);
      if (!current || current.id !== jobId || current.status !== "active") return;
      const span = Math.max(1, Number(current.endsAt) - Number(current.startedAt));
      const progress = Math.clamp(((CraftingService.serverTime() - Number(current.startedAt)) / span) * 100, 0, 100);
      bar.style.width = `${progress}%`;
      if (progress < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  static #isCharacterSheet(app) {
    const actor = app?.actor ?? app?.document;
    return Boolean(actor?.type === "character" && (app.constructor?.name === "CharacterActorSheet"
      || app?.options?.classes?.includes?.("character")));
  }
}
