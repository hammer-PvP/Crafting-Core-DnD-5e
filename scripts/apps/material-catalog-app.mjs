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
    position: { width: 1280, height: 820 },
    window: { title: "Crafting Core — Materials", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-catalog.hbs` }
  };

  filters = { search: "", family: "all", nature: "all", rarity: "all" };

  async _prepareContext() {
    const summary = await MaterialCatalogService.packSummary();
    const entries = await MaterialCatalogService.allEntries();
    const filtered = entries.filter(entry => this.#matches(entry, { includeSearch: false })).map(entry => {
      const row = MaterialCatalogService.withIconChoices(entry);
      row.searchText = this.#searchText(entry);
      return row;
    });
    const natures = [...new Set(entries.map(entry => entry.nature).filter(Boolean))].sort((a,b) => a.localeCompare(b, game.i18n.lang));
    return {
      summary,
      groups: MaterialCatalogService.groupedEntries(filtered),
      economy: MaterialCatalogService.economy(),
      catalogCount: entries.length,
      shownCount: filtered.filter(entry => !this.filters.search || entry.searchText.includes(String(this.filters.search).trim().toLowerCase())).length,
      filters: this.filters,
      natureOptions: natures.map(value => ({ value, label: value.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()), selected: this.filters.nature === value })),
      familyOptions: [
        { value: "all", label: "All Families", selected: this.filters.family === "all" },
        { value: "creature", label: "Creature Harvest", selected: this.filters.family === "creature" },
        { value: "essence", label: "Essences", selected: this.filters.family === "essence" },
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
    root.querySelectorAll('[data-action="choose-material-icon"]').forEach(input => input.addEventListener("change", event => this.#chooseIcon(event)));

    for (const selector of ['[name="filter.family"]','[name="filter.nature"]','[name="filter.rarity"]']) {
      root.querySelector(selector)?.addEventListener("change", event => {
        const key = event.currentTarget.name.split(".")[1];
        this.filters[key] = event.currentTarget.value;
        this.render({ force: true });
      });
    }
    const searchInput = root.querySelector('[name="filter.search"]');
    searchInput?.addEventListener("input", event => {
      this.filters.search = event.currentTarget.value;
      this.#applySearchFilter();
    });
    // Search is deliberately DOM-local: no render while the GM is typing, so focus, caret,
    // scroll position and open groups remain untouched even with a slow human typing cadence.
    this.#applySearchFilter();

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

  #matches(entry, { includeSearch=true }={}) {
    if (this.filters.family !== "all" && entry.family !== this.filters.family) return false;
    if (this.filters.nature !== "all" && entry.nature !== this.filters.nature) return false;
    if (this.filters.rarity !== "all" && entry.rarity !== this.filters.rarity) return false;
    if (!includeSearch) return true;
    const search = String(this.filters.search || "").trim().toLowerCase();
    return !search || this.#searchText(entry).includes(search);
  }

  #searchText(entry) {
    return [entry.name, entry.id, entry.nature, entry.category, ...(entry.tags ?? []), ...(entry.biomes ?? [])]
      .join(" ").toLowerCase();
  }

  #applySearchFilter() {
    const root = this.element;
    if (!root) return;
    const search = String(this.filters.search || "").trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll(".cc-material-group").forEach(group => {
      let groupShown = 0;
      group.querySelectorAll(".cc-material-table-row").forEach(row => {
        const matches = !search || String(row.dataset.search ?? "").includes(search);
        row.hidden = !matches;
        if (matches) { shown += 1; groupShown += 1; }
      });
      group.hidden = groupShown === 0;
      const count = group.querySelector("[data-role=group-visible-count]");
      if (count) count.textContent = `${groupShown} material${groupShown === 1 ? "" : "s"}`;
    });
    const counter = root.querySelector("[data-role=material-visible-count]");
    if (counter) counter.textContent = String(shown);
  }

  async #chooseIcon(event) {
    const input = event.currentTarget;
    if (!input?.checked) return;
    const row = input.closest(".cc-material-table-row");
    const materialId = String(input.dataset.materialId ?? "");
    const path = String(input.value ?? "");
    const previousPath = String(row?.dataset.currentIcon ?? "");
    const controls = [...(row?.querySelectorAll('[data-action="choose-material-icon"]') ?? [])];
    const labels = [...(row?.querySelectorAll(".cc-icon-choice") ?? [])];

    controls.forEach(control => control.disabled = true);
    row?.classList.add("saving-icon");
    try {
      const saved = await MaterialCatalogService.saveIconChoice(materialId, path);
      const savedPath = String(saved?.img ?? path);
      const preview = row?.querySelector(".cc-material-name img");
      if (preview && savedPath) preview.src = savedPath;
      controls.forEach(control => { control.checked = control.value === savedPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === savedPath));
      if (row) row.dataset.currentIcon = savedPath;
      row?.classList.add("icon-saved");
      setTimeout(() => row?.classList.remove("icon-saved"), 550);
    } catch (error) {
      console.error(`${MODULE_ID} | Material icon selection failed.`, error);
      controls.forEach(control => { control.checked = control.value === previousPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === previousPath));
      ui.notifications.error(error.message ?? "Crafting Core could not save that material icon.");
    } finally {
      row?.classList.remove("saving-icon");
      controls.forEach(control => control.disabled = false);
    }
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
