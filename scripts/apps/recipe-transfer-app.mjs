import { MODULE_ID } from "../constants.mjs";
import { RecipeService } from "../services/recipe-service.mjs";
import { RecipeTransferService } from "../services/recipe-transfer-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class RecipeTransferApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-recipe-transfer",
    classes: ["crafting-core", "crafting-core-recipe-transfer-app", "standard-form"],
    tag: "form",
    position: { width: 920, height: 720 },
    window: { title: "Crafting Core — Recipe Transfer", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/recipe-transfer.hbs` }
  };

  mode = "export";
  selected = new Set();
  inspectKey = "";
  bundle = null;
  importRows = [];
  importChoices = new Map();
  search = "";

  constructor({ mode="export", ...options }={}) {
    super(options);
    this.mode = mode === "import" ? "import" : "export";
  }

  async _prepareContext() {
    const rows = this.mode === "export"
      ? RecipeTransferService.listRecipes().map(recipe => this.#exportRow(recipe))
      : this.importRows.map(row => this.#importRow(row));
    const query = this.search.trim().toLowerCase();
    const filtered = query ? rows.filter(row => `${row.name} ${row.resultName} ${row.type}`.toLowerCase().includes(query)) : rows;
    if (this.inspectKey && !rows.some(row => row.key === this.inspectKey)) this.inspectKey = "";
    const inspected = rows.find(row => row.key === this.inspectKey) ?? rows[0] ?? null;
    if (!this.inspectKey && inspected) this.inspectKey = inspected.key;

    return {
      mode: this.mode,
      isExport: this.mode === "export",
      isImport: this.mode === "import",
      title: this.mode === "export" ? "Export Recipes" : "Import Recipes",
      subtitle: this.mode === "export"
        ? "Select Recipe drafts to package for another Foundry World. Click a row to inspect it."
        : "Load a Crafting Core Recipe JSON, inspect its dependencies, then choose what to import.",
      rows: filtered,
      hasRows: filtered.length > 0,
      selectedCount: [...this.selected].filter(key => rows.some(row => row.key === key && !row.disabled)).length,
      totalCount: rows.filter(row => !row.disabled).length,
      inspected,
      bundleLoaded: Boolean(this.bundle),
      search: this.search
    };
  }

  #exportRow(recipe) {
    const result = recipe.result ?? {};
    return {
      key: String(recipe.id),
      name: recipe.name,
      img: recipe.img || result.img || "icons/svg/item-bag.svg",
      resultName: result.name || "No Result Item",
      type: result.type || "",
      quantity: Math.max(1, Number(result.quantity) || 1),
      ingredients: (recipe.ingredients ?? []).map(row => ({ name: row.name, quantity: row.quantity })),
      craftingTime: recipe.craftingMode === "project" ? "Crafting Project" : `${recipe.craftingTime ?? 0}s`,
      selected: this.selected.has(String(recipe.id)),
      inspected: this.inspectKey === String(recipe.id),
      disabled: !recipe.transferable,
      status: recipe.transferable ? "Ready" : "Missing Result Item",
      statusClass: recipe.transferable ? "ready" : "missing",
      recipeAction: "",
      resultAction: "",
      iconSource: "Current World",
      proficiencySummary: RecipeService.proficiencyRuleSummary(recipe.craftingResolution)
    };
  }

  #importRow(row) {
    const choice = this.importChoices.get(row.key) ?? {
      recipeAction: row.existingRecipe ? "update" : "preserve",
      resultAction: row.existingResult ? "use-existing" : "import-new"
    };
    return {
      ...row,
      resultName: row.result?.name || row.recipe?.result?.name || "Item",
      type: row.result?.type || row.result?.snapshot?.type || "",
      quantity: Math.max(1, Number(row.result?.quantity || row.recipe?.result?.quantity) || 1),
      ingredients: (row.dependencies ?? []).map(dep => ({ ...dep, missing: dep.status === "missing" })),
      craftingTime: row.recipe?.craftingMode === "project" ? "Crafting Project" : `${row.recipe?.craftingTime ?? 0}s`,
      selected: this.selected.has(row.key),
      inspected: this.inspectKey === row.key,
      disabled: !row.ready,
      status: !row.ready ? `Missing ${row.missingDependencies.length} dependenc${row.missingDependencies.length === 1 ? "y" : "ies"}`
        : row.existingRecipe || row.existingResult ? "Conflict review" : "Ready",
      statusClass: !row.ready ? "missing" : row.existingRecipe || row.existingResult ? "warning" : "ready",
      recipeAction: choice.recipeAction,
      resultAction: choice.resultAction,
      proficiencySummary: RecipeService.proficiencyRuleSummary(row.recipe?.craftingResolution)
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[name="transferSearch"]')?.addEventListener("input", event => {
      this.search = String(event.currentTarget.value || "");
      this.render({ force: true });
    });

    root.querySelectorAll('[data-transfer-checkbox]').forEach(input => input.addEventListener("change", event => {
      event.stopPropagation();
      const key = String(event.currentTarget.dataset.transferCheckbox || "");
      if (!key) return;
      if (event.currentTarget.checked) this.selected.add(key);
      else this.selected.delete(key);
      this.render({ force: true });
    }));

    root.querySelectorAll('[data-transfer-row]').forEach(row => row.addEventListener("click", event => {
      if (event.target.closest("input,select,button,label")) return;
      this.inspectKey = String(row.dataset.transferRow || "");
      this.render({ force: true });
    }));

    root.querySelector('[data-action="select-all-transfer"]')?.addEventListener("click", event => {
      event.preventDefault();
      const rows = this.mode === "export" ? RecipeTransferService.listRecipes().map(recipe => this.#exportRow(recipe)) : this.importRows.map(row => this.#importRow(row));
      rows.filter(row => !row.disabled).forEach(row => this.selected.add(row.key));
      this.render({ force: true });
    });
    root.querySelector('[data-action="clear-transfer"]')?.addEventListener("click", event => {
      event.preventDefault();
      this.selected.clear();
      this.render({ force: true });
    });

    root.querySelector('[name="recipeConflictAction"]')?.addEventListener("change", event => {
      if (!this.inspectKey) return;
      const current = this.importChoices.get(this.inspectKey) ?? {};
      current.recipeAction = String(event.currentTarget.value);
      this.importChoices.set(this.inspectKey, current);
    });
    root.querySelector('[name="resultConflictAction"]')?.addEventListener("change", event => {
      if (!this.inspectKey) return;
      const current = this.importChoices.get(this.inspectKey) ?? {};
      current.resultAction = String(event.currentTarget.value);
      this.importChoices.set(this.inspectKey, current);
    });

    root.querySelector('[data-action="choose-import-file"]')?.addEventListener("click", event => {
      event.preventDefault();
      root.querySelector('[data-transfer-file]')?.click();
    });
    root.querySelector('[data-transfer-file]')?.addEventListener("change", event => this.#loadImportFile(event));
    root.querySelector('[data-action="export-selected"]')?.addEventListener("click", event => this.#exportSelected(event));
    root.querySelector('[data-action="import-selected"]')?.addEventListener("click", event => this.#importSelected(event));
  }

  async #loadImportFile(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    try {
      this.bundle = await RecipeTransferService.readBundleFile(file);
      this.importRows = await RecipeTransferService.analyzeBundle(this.bundle);
      this.selected.clear();
      this.importChoices.clear();
      this.inspectKey = this.importRows[0]?.key ?? "";
      for (const row of this.importRows) {
        this.importChoices.set(row.key, {
          recipeAction: row.existingRecipe ? "update" : "preserve",
          resultAction: row.existingResult ? "use-existing" : "import-new"
        });
      }
      ui.notifications.info(`Loaded ${this.importRows.length} Recipe${this.importRows.length === 1 ? "" : "s"} for review.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Recipe import file could not be read.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not read that Recipe export.");
    } finally {
      event.currentTarget.value = "";
    }
  }

  async #exportSelected(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const ids = [...this.selected];
    if (!ids.length) return ui.notifications.warn("Select at least one Recipe to export.");
    button.disabled = true;
    try {
      const suggestedName = RecipeTransferService.suggestedFilename(ids.length);
      // Ask where to save while the export button's user activation is still active.
      // Building the bundle may perform async document reads that would otherwise cause
      // Chromium to reject showSaveFilePicker for lacking transient user activation.
      const target = await RecipeTransferService.requestSaveTarget(suggestedName);
      if (!target) return;
      const bundle = await RecipeTransferService.buildBundle(ids);
      const saved = await RecipeTransferService.saveBundle(bundle, suggestedName, target);
      if (saved.saved) ui.notifications.info(`Exported ${ids.length} Recipe${ids.length === 1 ? "" : "s"}.`);
    } catch (error) {
      console.error(`${MODULE_ID} | Recipe export failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not export the selected Recipes.");
    } finally {
      button.disabled = false;
    }
  }

  async #importSelected(event) {
    event.preventDefault();
    if (!this.bundle) return ui.notifications.warn("Load a Crafting Core Recipe JSON first.");
    const keys = [...this.selected];
    if (!keys.length) return ui.notifications.warn("Select at least one Recipe to import.");
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const selections = keys.map(key => {
        const choice = this.importChoices.get(key) ?? {};
        return { key, recipeAction: choice.recipeAction, resultAction: choice.resultAction };
      });
      const result = await RecipeTransferService.importEntries(this.bundle, selections);
      if (result.imported.length) ui.notifications.info(`Imported ${result.imported.length} Recipe${result.imported.length === 1 ? "" : "s"} as Builder Draft${result.imported.length === 1 ? "" : "s"}.`);
      if (result.skipped.length) ui.notifications.warn(`${result.skipped.length} Recipe${result.skipped.length === 1 ? " was" : "s were"} skipped. Check missing dependencies or conflict choices.`);
      this.importRows = await RecipeTransferService.analyzeBundle(this.bundle);
      this.selected.clear();
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Recipe import failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not import the selected Recipes.");
    } finally {
      button.disabled = false;
    }
  }
}
