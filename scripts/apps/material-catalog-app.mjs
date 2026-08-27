import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";
import { MaterialEditorApp } from "./material-editor-app.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class MaterialCatalogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-materials",
    classes: ["crafting-core", "crafting-core-materials-app", "standard-form"],
    tag: "form",
    position: { width: 1080, height: 780 },
    window: { title: "Crafting Core — Materials", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-catalog.hbs` }
  };

  filters = { search: "", family: "all", nature: "all", rarity: "all" };

  async _prepareContext() {
    const summary = await MaterialCatalogService.packSummary();
    const entries = await MaterialCatalogService.allEntries();
    const filtered = entries.filter(entry => this.#matches(entry));
    const natures = [...new Set(entries.map(entry => entry.nature).filter(Boolean))].sort((a,b) => a.localeCompare(b, game.i18n.lang));
    return {
      summary,
      groups: MaterialCatalogService.groupedEntries(filtered),
      economy: MaterialCatalogService.economy(),
      catalogCount: entries.length,
      shownCount: filtered.length,
      filters: this.filters,
      natureOptions: natures.map(value => ({ value, label: value.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()), selected: this.filters.nature === value })),
      familyOptions: [
        { value: "all", label: "All Families", selected: this.filters.family === "all" },
        { value: "creature", label: "Creature Harvest", selected: this.filters.family === "creature" },
        { value: "gathering", label: "Gathering", selected: this.filters.family === "gathering" },
        { value: "profession", label: "Profession & Trade", selected: this.filters.family === "profession" }
      ],
      rarityOptions: MaterialCatalogService.rarityOptions({ includeAll: true }).map(option => ({ ...option, selected: this.filters.rarity === option.value }))
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[data-action="sync-materials"]')?.addEventListener("click", event => this.#sync(event));
    root.querySelector('[data-action="open-materials"]')?.addEventListener("click", event => {
      event.preventDefault();
      if (!MaterialCatalogService.openPack()) ui.notifications.warn("Create / Sync the Materials Compendium first.");
    });
    root.querySelector('[data-action="save-economy"]')?.addEventListener("click", event => this.#saveEconomy(event));
    root.querySelectorAll('[data-action="edit-material"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      new MaterialEditorApp(button.dataset.materialId).render({ force: true });
    }));

    for (const selector of ['[name="filter.family"]','[name="filter.nature"]','[name="filter.rarity"]']) {
      root.querySelector(selector)?.addEventListener("change", event => {
        const key = event.currentTarget.name.split(".")[1];
        this.filters[key] = event.currentTarget.value;
        this.render({ force: true });
      });
    }
    root.querySelector('[name="filter.search"]')?.addEventListener("input", event => {
      this.filters.search = event.currentTarget.value;
      clearTimeout(this._ccSearchTimer);
      this._ccSearchTimer = setTimeout(() => this.render({ force: true }), 180);
    });

    const dropZone = root.querySelector('[data-drop-kind="custom-material"]');
    if (dropZone) {
      dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", event => this.#registerDrop(event, dropZone));
    }

    this._ccMaterialSavedHook ??= Hooks.on(`${MODULE_ID}.materialEditorSaved`, () => this.render({ force: true }));
  }

  async close(options={}) {
    if (this._ccMaterialSavedHook) Hooks.off(`${MODULE_ID}.materialEditorSaved`, this._ccMaterialSavedHook);
    this._ccMaterialSavedHook = null;
    return super.close(options);
  }

  #matches(entry) {
    if (this.filters.family !== "all" && entry.family !== this.filters.family) return false;
    if (this.filters.nature !== "all" && entry.nature !== this.filters.nature) return false;
    if (this.filters.rarity !== "all" && entry.rarity !== this.filters.rarity) return false;
    const search = String(this.filters.search || "").trim().toLowerCase();
    if (!search) return true;
    return [entry.name, entry.id, entry.nature, entry.category, ...(entry.tags ?? [])].join(" ").toLowerCase().includes(search);
  }

  async #sync(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await this.#saveEconomy(null, { notify: false });
      const result = await MaterialCatalogService.sync();
      ui.notifications.info(`Materials synchronized: ${result.created} created, ${result.updated} updated.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Material sync failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not synchronize materials.");
      button.disabled = false;
    }
  }

  async #saveEconomy(event, { notify=true }={}) {
    event?.preventDefault?.();
    const root = this.element;
    const economy = {};
    for (const rarity of MaterialCatalogService.RARITIES) {
      economy[rarity] = {
        price: Number(root.querySelector(`[name="economy.${rarity}.price"]`)?.value ?? 0),
        chance: Number(root.querySelector(`[name="economy.${rarity}.chance"]`)?.value ?? 0),
        denomination: "gp"
      };
    }
    await MaterialCatalogService.saveEconomy(economy);
    if (notify) {
      ui.notifications.info("Material rarity defaults saved. Sync the Compendium to apply them to unchanged curated materials.");
      this.render({ force: true });
    }
  }

  async #registerDrop(event, dropZone) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.type !== "Item") return ui.notifications.warn("Drop a D&D5e Item here.");
      const item = await Item.implementation.fromDropData(data);
      if (!(item instanceof Item)) return ui.notifications.warn("Crafting Core could not resolve that Item.");
      const created = await MaterialCatalogService.registerItem(item);
      ui.notifications.info(`${created.name} registered in Crafting Core — Materials.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Custom material registration failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not register that material.");
    }
  }
}
