import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class MaterialCatalogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-materials",
    classes: ["crafting-core", "crafting-core-materials-app", "standard-form"],
    tag: "form",
    position: { width: 980, height: 760 },
    window: { title: "Crafting Core — Materials", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-catalog.hbs` }
  };

  async _prepareContext() {
    const summary = await MaterialCatalogService.packSummary();
    return {
      summary,
      groups: MaterialCatalogService.groupedDefinitions(),
      economy: MaterialCatalogService.economy(),
      catalogCount: MaterialCatalogService.definitions().length
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
    for (const rarity of ["common", "rare", "legendary"]) {
      economy[rarity] = {
        price: Number(root.querySelector(`[name="economy.${rarity}.price"]`)?.value ?? 0),
        chance: Number(root.querySelector(`[name="economy.${rarity}.chance"]`)?.value ?? 0),
        denomination: "gp"
      };
    }
    await MaterialCatalogService.saveEconomy(economy);
    if (notify) {
      ui.notifications.info("Material rarity defaults saved. Sync the Compendium to apply price/chance metadata.");
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
