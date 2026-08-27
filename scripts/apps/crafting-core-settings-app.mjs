import { MODULE_ID } from "../constants.mjs";
import { HarvestProfileService } from "../services/harvest-profile-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CraftingCoreSettingsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-settings",
    classes: ["crafting-core", "crafting-core-settings-app", "standard-form"],
    tag: "form",
    position: { width: 720, height: 650 },
    window: { title: "Crafting Core — Settings", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/crafting-core-settings.hbs` }
  };

  selected = [];
  initialized = false;

  async _prepareContext() {
    const sources = HarvestProfileService.availableScannerSources();
    if (!this.initialized) {
      this.selected = HarvestProfileService.scannerSourceConfig().selected;
      this.initialized = true;
    }
    const sourceMap = new Map(sources.map(source => [source.id, source]));
    this.selected = this.selected.filter(id => sourceMap.has(id));
    const selectedSet = new Set(this.selected);
    const ordered = [
      ...this.selected.map(id => sourceMap.get(id)).filter(Boolean),
      ...sources.filter(source => !selectedSet.has(source.id))
    ];
    return {
      sources: ordered.map(source => ({
        ...source,
        selected: selectedSet.has(source.id),
        priority: selectedSet.has(source.id) ? this.selected.indexOf(source.id) + 1 : null,
        packCount: source.collections.length,
        packSummary: source.packLabels.join(" · ")
      })),
      selectedCount: this.selected.length,
      selectedPackCount: this.selected.reduce((count, id) => count + (sourceMap.get(id)?.collections?.length ?? 0), 0)
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
      this.#move(button.dataset.sourceId, -1);
    }));
    root.querySelectorAll('[data-action="source-down"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#move(button.dataset.sourceId, 1);
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
    root.querySelector('[data-action="save-settings"]')?.addEventListener("click", event => this.#save(event));
  }

  #move(id, delta) {
    const index = this.selected.indexOf(String(id));
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= this.selected.length) return;
    [this.selected[index], this.selected[target]] = [this.selected[target], this.selected[index]];
    this.render({ force: true });
  }

  async #save(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await HarvestProfileService.saveScannerSourceConfig(this.selected);
      ui.notifications.info(`Crafting Core Scanner sources saved: ${this.selected.length} source${this.selected.length === 1 ? "" : "s"}.`);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Could not save Crafting Core settings.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save Scanner sources.");
      button.disabled = false;
    }
  }
}
