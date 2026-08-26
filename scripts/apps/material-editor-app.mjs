import { FILE_PICKER_ROOT, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MaterialEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-material-editor",
    classes: ["crafting-core", "crafting-core-material-editor", "standard-form"],
    tag: "form",
    position: { width: 620, height: 700 },
    window: { title: "Crafting Core — Edit Material", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-editor.hbs` }
  };

  constructor(materialId, options={}) {
    super(options);
    this.materialId = String(materialId);
  }

  async _prepareContext() {
    const material = await MaterialCatalogService.getEntry(this.materialId);
    if (!material) throw new Error("Crafting Core material could not be resolved.");
    return {
      material,
      builtIn: Boolean(material.managed),
      familyOptions: [
        { value: "creature", label: "Creature Harvest", selected: material.family === "creature" },
        { value: "gathering", label: "Gathering", selected: material.family === "gathering" },
        { value: "profession", label: "Profession & Trade", selected: material.family === "profession" }
      ],
      rarityOptions: ["common", "rare", "legendary"].map(value => ({ value, label: value[0].toUpperCase()+value.slice(1), selected: material.rarity === value }))
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[data-action="save-material"]')?.addEventListener("click", event => this.#save(event));
    root.querySelector('[data-action="reset-material"]')?.addEventListener("click", event => this.#reset(event));
    root.querySelector('[data-action="browse-material-image"]')?.addEventListener("click", event => this.#browse(event));
  }

  #formData() {
    const root = this.element;
    return {
      name: root.querySelector('[name="name"]')?.value ?? "",
      img: root.querySelector('[name="img"]')?.value ?? "",
      family: root.querySelector('[name="family"]')?.value ?? "profession",
      nature: root.querySelector('[name="nature"]')?.value ?? "trade",
      category: root.querySelector('[name="category"]')?.value ?? "general",
      rarity: root.querySelector('[name="rarity"]')?.value ?? "common",
      chance: Number(root.querySelector('[name="chance"]')?.value ?? 0),
      quantity: root.querySelector('[name="quantity"]')?.value ?? "1",
      price: Number(root.querySelector('[name="price"]')?.value ?? 0),
      denomination: "gp",
      tags: root.querySelector('[name="tags"]')?.value ?? "",
      requires: root.querySelector('[name="requires"]')?.value ?? "",
      biomes: root.querySelector('[name="biomes"]')?.value ?? ""
    };
  }

  async #save(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await MaterialCatalogService.saveEntry(this.materialId, this.#formData());
      ui.notifications.info("Crafting Core material saved and synchronized.");
      Hooks.callAll(`${MODULE_ID}.materialEditorSaved`, this.materialId);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Material edit failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save that material.");
      button.disabled = false;
    }
  }

  async #reset(event) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Curated Material" },
      content: "<p>Reset this material to the Crafting Core curated defaults?</p>",
      yes: { label: "Reset", icon: "fa-solid fa-rotate-left" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    try {
      await MaterialCatalogService.resetEntry(this.materialId);
      ui.notifications.info("Curated material reset to default metadata.");
      Hooks.callAll(`${MODULE_ID}.materialEditorSaved`, this.materialId);
      await this.close();
    } catch (error) {
      ui.notifications.error(error.message ?? "Crafting Core could not reset that material.");
    }
  }

  async #browse(event) {
    event.preventDefault();
    const FilePicker = foundry.applications?.apps?.FilePicker?.implementation
      ?? foundry.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePicker) return ui.notifications.error("Foundry File Picker is unavailable.");
    const picker = new FilePicker({
      type: "image",
      current: FILE_PICKER_ROOT,
      callback: path => {
        const input = this.element.querySelector('[name="img"]');
        if (input) input.value = path;
        const preview = this.element.querySelector(".cc-material-editor-preview img");
        if (preview) preview.src = path;
      }
    });
    await picker.render({ force: true });
  }
}
