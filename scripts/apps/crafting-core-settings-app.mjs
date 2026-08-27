import { MODULE_ID } from "../constants.mjs";
import { HarvestProfileService } from "../services/harvest-profile-service.mjs";
import { GearNormalizationService } from "../services/gear-normalization-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftingCoreSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-settings",
    classes: ["crafting-core", "crafting-core-settings-app", "standard-form"],
    tag: "form",
    position: { width: 760, height: 760 },
    window: { title: "Crafting Core — Settings", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/crafting-core-settings.hbs` }
  };

  selected = [];
  normalizationSelected = [];
  normalizationMode = GearNormalizationService.MODES.NORMALIZE;
  firearmsToCrossbows = false;
  initialized = false;

  async _prepareContext() {
    const sources = HarvestProfileService.availableScannerSources();
    const itemPacks = GearNormalizationService.availableItemPacks();
    if (!this.initialized) {
      this.selected = HarvestProfileService.scannerSourceConfig().selected;
      const normalization = GearNormalizationService.config();
      this.normalizationSelected = normalization.sources;
      this.normalizationMode = normalization.mode;
      this.firearmsToCrossbows = Boolean(normalization?.homebrew?.firearmsToCrossbows);
      this.initialized = true;
    }

    const sourceMap = new Map(sources.map(source => [source.id, source]));
    this.selected = this.selected.filter(id => sourceMap.has(id));
    const selectedSet = new Set(this.selected);
    const ordered = [
      ...this.selected.map(id => sourceMap.get(id)).filter(Boolean),
      ...sources.filter(source => !selectedSet.has(source.id))
    ];

    const itemPackMap = new Map(itemPacks.map(pack => [pack.collection, pack]));
    this.normalizationSelected = this.normalizationSelected
      .filter(id => itemPackMap.has(id))
      .slice(0, GearNormalizationService.MAX_SOURCES);
    const normalizationSet = new Set(this.normalizationSelected);
    const normalizationOrdered = [
      ...this.normalizationSelected.map(id => itemPackMap.get(id)).filter(Boolean),
      ...itemPacks.filter(pack => !normalizationSet.has(pack.collection))
    ];
    const atNormalizationLimit = this.normalizationSelected.length >= GearNormalizationService.MAX_SOURCES;

    return {
      sources: ordered.map(source => ({
        ...source,
        selected: selectedSet.has(source.id),
        priority: selectedSet.has(source.id) ? this.selected.indexOf(source.id) + 1 : null,
        packCount: source.collections.length,
        packSummary: source.packLabels.join(" · ")
      })),
      selectedCount: this.selected.length,
      selectedPackCount: this.selected.reduce((count, id) => count + (sourceMap.get(id)?.collections?.length ?? 0), 0),
      normalizationMode: this.normalizationMode,
      normalizeMode: this.normalizationMode === GearNormalizationService.MODES.NORMALIZE,
      removeAllMode: this.normalizationMode === GearNormalizationService.MODES.REMOVE_ALL,
      filterMode: this.normalizationMode === GearNormalizationService.MODES.FILTER,
      keepAllMode: this.normalizationMode === GearNormalizationService.MODES.KEEP_ALL,
      normalizationSources: normalizationOrdered.map(pack => ({
        ...pack,
        selected: normalizationSet.has(pack.collection),
        priority: normalizationSet.has(pack.collection) ? this.normalizationSelected.indexOf(pack.collection) + 1 : null,
        disabled: atNormalizationLimit && !normalizationSet.has(pack.collection),
        sourceLabel: pack.sourceLabel,
        packLabel: pack.packLabel ?? pack.label,
        sourceKind: pack.sourceKind
      })),
      normalizationSelectedCount: this.normalizationSelected.length,
      normalizationMaxSources: GearNormalizationService.MAX_SOURCES,
      firearmsToCrossbows: this.firearmsToCrossbows
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelectorAll('[name="scanner.source"]').forEach(input => input.addEventListener("change", event => {
      const id = String(event.currentTarget.value);
      if (event.currentTarget.checked) {
        if (!this.selected.includes(id)) this.selected.push(id);
      } else this.selected = this.selected.filter(value => value !== id);
      this.render({ force: true });
    }));

    root.querySelectorAll('[data-action="source-up"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#moveScanner(button.dataset.sourceId, -1);
    }));
    root.querySelectorAll('[data-action="source-down"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#moveScanner(button.dataset.sourceId, 1);
    }));
    root.querySelector('[data-action="select-all-sources"]')?.addEventListener("click", event => {
      event.preventDefault();
      this.selected = HarvestProfileService.availableScannerSources().map(source => source.id);
      this.render({ force: true });
    });
    root.querySelector('[data-action="clear-sources"]')?.addEventListener("click", event => {
      event.preventDefault();
      this.selected = [];
      this.render({ force: true });
    });

    root.querySelector('[name="normalization.mode"]')?.addEventListener("change", event => {
      this.normalizationMode = String(event.currentTarget.value || GearNormalizationService.MODES.NORMALIZE);
      this.render({ force: true });
    });
    root.querySelector('[name="normalization.firearmsToCrossbows"]')?.addEventListener("change", event => {
      this.firearmsToCrossbows = Boolean(event.currentTarget.checked);
    });
    root.querySelectorAll('[name="normalization.source"]').forEach(input => input.addEventListener("change", event => {
      const id = String(event.currentTarget.value);
      if (event.currentTarget.checked) {
        if (!this.normalizationSelected.includes(id)) {
          if (this.normalizationSelected.length >= GearNormalizationService.MAX_SOURCES) {
            event.currentTarget.checked = false;
            return ui.notifications.warn(`Crafting Core supports up to ${GearNormalizationService.MAX_SOURCES} Gear Normalization Compendiums.`);
          }
          this.normalizationSelected.push(id);
        }
      } else this.normalizationSelected = this.normalizationSelected.filter(value => value !== id);
      this.render({ force: true });
    }));
    root.querySelectorAll('[data-action="normalization-up"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#moveNormalization(button.dataset.collection, -1);
    }));
    root.querySelectorAll('[data-action="normalization-down"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#moveNormalization(button.dataset.collection, 1);
    }));
    root.querySelector('[data-action="clear-normalization"]')?.addEventListener("click", event => {
      event.preventDefault();
      this.normalizationSelected = [];
      this.render({ force: true });
    });

    root.querySelector('[data-action="save-settings"]')?.addEventListener("click", event => this.#save(event));
  }

  #moveScanner(id, delta) {
    const index = this.selected.indexOf(String(id));
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= this.selected.length) return;
    [this.selected[index], this.selected[target]] = [this.selected[target], this.selected[index]];
    this.render({ force: true });
  }

  #moveNormalization(id, delta) {
    const index = this.normalizationSelected.indexOf(String(id));
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= this.normalizationSelected.length) return;
    [this.normalizationSelected[index], this.normalizationSelected[target]] = [this.normalizationSelected[target], this.normalizationSelected[index]];
    this.render({ force: true });
  }

  async #save(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await HarvestProfileService.saveScannerSourceConfig(this.selected);
      await GearNormalizationService.saveConfig({
        mode: this.normalizationMode,
        sources: this.normalizationSelected,
        homebrew: { firearmsToCrossbows: this.firearmsToCrossbows }
      });
      ui.notifications.info(`Crafting Core settings saved. ${this.selected.length} Scanner source${this.selected.length === 1 ? "" : "s"}; ${this.normalizationSelected.length} Gear Normalization source${this.normalizationSelected.length === 1 ? "" : "s"}.`);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save Crafting Core settings.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save settings.");
      button.disabled = false;
    }
  }
}
