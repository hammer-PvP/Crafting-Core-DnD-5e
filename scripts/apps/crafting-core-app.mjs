import {
  DEFAULT_KNOWLEDGE_ICON,
  FILE_PICKER_ROOT,
  KNOWLEDGE_ICONS,
  KNOWLEDGE_PRICE_BY_RARITY,
  MODULE_ID
} from "../constants.mjs";
import { KnowledgeItemService } from "../services/knowledge-item-service.mjs";
import { RecipeService } from "../services/recipe-service.mjs";
import { MaterialCatalogApp } from "./material-catalog-app.mjs";
import { MaterialGeneratorApp } from "./material-generator-app.mjs";
import { CreatureScannerApp } from "./creature-scanner-app.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class CraftingCoreApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-gm",
    classes: ["crafting-core", "crafting-core-gm-app", "standard-form"],
    tag: "form",
    position: { width: 1120, height: 780 },
    window: { title: "Crafting Core", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/crafting-core.hbs` }
  };

  selectedId = null;
  draft = null;

  constructor(options={}) {
    super(options);
    this.#newDraft();
  }

  async _prepareContext() {
    const recipes = RecipeService.list();
    if (this.selectedId && !recipes.some(recipe => recipe.id === this.selectedId)) this.#newDraft();
    const rarity = String(this.draft?.result?.snapshot?.system?.rarity ?? "");
    const rarityLabel = rarity ? (CONFIG.DND5E?.itemRarity?.[rarity] ?? rarity) : "No rarity";
    return {
      recipeCount: recipes.length,
      recipes: recipes.map(recipe => ({
        ...recipe,
        selected: recipe.id === this.selectedId,
        published: Boolean(recipe.publication?.uuid),
        sourceType: recipe.publication?.sourceType ?? recipe.knowledge?.label ?? "Recipe"
      })),
      draft: foundry.utils.deepClone(this.draft),
      editingExisting: Boolean(this.selectedId),
      published: Boolean(this.draft?.publication?.uuid),
      defaultKnowledgeIcon: DEFAULT_KNOWLEDGE_ICON,
      knowledgeIcons: KNOWLEDGE_ICONS,
      outputRarity: rarityLabel,
      knowledgePrice: Number(KNOWLEDGE_PRICE_BY_RARITY[rarity] ?? 0)
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[data-action="new-recipe"]')?.addEventListener("click", event => {
      event.preventDefault(); this.#newDraft(); this.render({ force: true });
    });
    root.querySelector('[data-action="open-material-catalog"]')?.addEventListener("click", event => {
      event.preventDefault();
      new MaterialCatalogApp().render({ force: true });
    });
    root.querySelector('[data-action="open-material-generator"]')?.addEventListener("click", event => {
      event.preventDefault();
      const launcher = game.modules?.get?.(MODULE_ID)?.api?.openGenerator;
      if (typeof launcher === "function") launcher();
      else new MaterialGeneratorApp().render({ force: true });
    });
    root.querySelector('[data-action="open-creature-scanner"]')?.addEventListener("click", event => {
      event.preventDefault();
      new CreatureScannerApp().render({ force: true });
    });
    root.querySelector('[data-action="open-learn-sources"]')?.addEventListener("click", async event => {
      event.preventDefault();
      const pack = KnowledgeItemService.pack() ?? await KnowledgeItemService.ensurePack();
      pack.render?.(true);
    });
    root.querySelectorAll('[data-recipe-id]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault(); this.#loadRecipe(button.dataset.recipeId); this.render({ force: true });
    }));
    root.querySelector('[data-action="save-recipe"]')?.addEventListener("click", event => this.#save(event));
    root.querySelector('[data-action="delete-recipe"]')?.addEventListener("click", event => this.#delete(event));
    root.querySelector('[data-action="publish-recipe"]')?.addEventListener("click", event => this.#publish(event));
    root.querySelectorAll('[data-action="remove-ingredient"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#syncDraftFromForm();
      this.draft.ingredients.splice(Number(button.dataset.index), 1);
      this.render({ force: true });
    }));
    root.querySelector('[data-action="clear-result"]')?.addEventListener("click", event => {
      event.preventDefault(); this.#syncDraftFromForm(); this.draft.result = null; this.render({ force: true });
    });
    root.querySelectorAll('[data-drop-kind]').forEach(zone => {
      zone.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", event => this.#onDrop(event, zone.dataset.dropKind));
    });
    root.querySelectorAll('[data-action="browse-image"]').forEach(button => button.addEventListener("click", event => this.#browseImage(event, button.dataset.target)));
    root.querySelector('[name="knowledgeLabel"]')?.addEventListener("change", event => {
      this.#syncDraftFromForm();
      const oldDefaults = new Set(["icons/svg/book.svg", DEFAULT_KNOWLEDGE_ICON, ...Object.values(KNOWLEDGE_ICONS)]);
      const current = String(this.draft.knowledge?.img || "");
      if (!current || oldDefaults.has(current)) this.draft.knowledge.img = KNOWLEDGE_ICONS[event.currentTarget.value] ?? DEFAULT_KNOWLEDGE_ICON;
      this.render({ force: true });
    });
  }

  #newDraft() {
    this.selectedId = null;
    this.draft = RecipeService.normalize({
      id: foundry.utils.randomID(20),
      name: "New Recipe",
      craftingTime: 10,
      ingredients: [],
      result: null,
      knowledge: { label: "Recipe", name: "", img: KNOWLEDGE_ICONS.Recipe }
    });
  }

  #loadRecipe(id) {
    const recipe = RecipeService.get(id);
    if (!recipe) return;
    this.selectedId = recipe.id;
    this.draft = foundry.utils.deepClone(recipe);
  }

  #syncDraftFromForm() {
    const root = this.element;
    if (!root || !this.draft) return;
    this.draft.name = root.querySelector('[name="name"]')?.value ?? this.draft.name;
    this.draft.img = root.querySelector('[name="img"]')?.value ?? this.draft.img;
    this.draft.craftingTime = Math.max(0, Math.floor(Number(root.querySelector('[name="craftingTime"]')?.value) || 0));
    this.draft.knowledge ??= {};
    this.draft.knowledge.label = root.querySelector('[name="knowledgeLabel"]')?.value ?? "Recipe";
    this.draft.knowledge.name = root.querySelector('[name="knowledgeName"]')?.value ?? "";
    this.draft.knowledge.img = root.querySelector('[name="knowledgeImg"]')?.value ?? KNOWLEDGE_ICONS[this.draft.knowledge.label] ?? DEFAULT_KNOWLEDGE_ICON;
    root.querySelectorAll('[data-ingredient-quantity]').forEach(input => {
      const index = Number(input.dataset.ingredientQuantity);
      if (this.draft.ingredients[index]) this.draft.ingredients[index].quantity = Math.max(1, Math.floor(Number(input.value) || 1));
    });
    const resultQty = root.querySelector('[name="resultQuantity"]');
    if (this.draft.result && resultQty) this.draft.result.quantity = Math.max(1, Math.floor(Number(resultQty.value) || 1));
  }

  async #onDrop(event, kind) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    this.#syncDraftFromForm();
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.type !== "Item") {
        ui.notifications.warn("Drop a D&D5e Item here.");
        return;
      }
      const item = await Item.implementation.fromDropData(data);
      if (!(item instanceof Item)) {
        ui.notifications.warn("Crafting Core could not resolve that Item.");
        return;
      }
      const ref = RecipeService.itemReference(item, 1, { snapshot: kind === "result" });
      if (kind === "result") this.draft.result = ref;
      else {
        const existing = this.draft.ingredients.find(row => row.uuid === ref.uuid
          || (row.sourceUuid && ref.sourceUuid && row.sourceUuid === ref.sourceUuid)
          || (row.identifier && ref.identifier && row.identifier === ref.identifier && row.type === ref.type));
        if (existing) existing.quantity += 1;
        else this.draft.ingredients.push(ref);
      }
      if (!this.draft.img || this.draft.img === "icons/svg/item-bag.svg") this.draft.img = this.draft.result?.img ?? this.draft.img;
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Item drop failed.`, error);
      ui.notifications.error("Crafting Core could not read the dropped Item.");
    }
  }

  async #browseImage(event, targetName) {
    event.preventDefault();
    this.#syncDraftFromForm();
    const FilePicker = foundry.applications?.apps?.FilePicker?.implementation
      ?? foundry.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePicker) return ui.notifications.error("Foundry File Picker is unavailable.");
    const picker = new FilePicker({
      type: "image",
      current: FILE_PICKER_ROOT,
      callback: path => {
        if (targetName === "img") this.draft.img = path;
        if (targetName === "knowledgeImg") this.draft.knowledge.img = path;
        this.render({ force: true });
      }
    });
    await picker.render({ force: true });
  }

  #validateDraft() {
    if (!this.draft.name?.trim()) throw new Error("Give the recipe a name.");
    if (!this.draft.result?.uuid) throw new Error("Drop a result Item into the recipe first.");
    if (!this.draft.ingredients.length) throw new Error("Add at least one required Item.");
  }

  async #save(event) {
    event.preventDefault();
    this.#syncDraftFromForm();
    try {
      this.#validateDraft();
      const saved = await RecipeService.save(this.draft);
      this.selectedId = saved.id;
      this.draft = foundry.utils.deepClone(saved);
      ui.notifications.info(`Saved draft: ${saved.name}.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Save recipe failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save this draft.");
    }
  }

  async #publish(event) {
    event.preventDefault();
    this.#syncDraftFromForm();
    try {
      this.#validateDraft();
      const saved = await RecipeService.save(this.draft);
      this.selectedId = saved.id;
      this.draft = foundry.utils.deepClone(saved);
      const { item, recipe } = await KnowledgeItemService.publishRecipe(saved.id);
      this.draft = foundry.utils.deepClone(recipe);
      ui.notifications.info(`Published ${item.name} to the private Crafting Core — Learn Sources Compendium.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Publish recipe failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not publish this Knowledge Source.");
    }
  }

  async #delete(event) {
    event.preventDefault();
    if (!this.selectedId) return;
    const recipe = RecipeService.get(this.selectedId);
    const published = Boolean(recipe?.publication?.uuid);
    const content = published
      ? `<p>Delete the Recipe Builder draft <strong>${foundry.utils.escapeHTML(recipe?.name ?? "this recipe")}</strong>?</p><p>The published Knowledge Source and any Characters who already learned it remain fully functional.</p>`
      : `<p><strong>${foundry.utils.escapeHTML(recipe?.name ?? "This draft")}</strong> has not been published to the Crafting Core library.</p><p>Deleting it now permanently destroys this draft.</p>`;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: published ? "Delete Published Draft" : "Delete Unpublished Draft" },
      content,
      yes: { label: "Delete Draft", icon: "fa-solid fa-trash" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    await RecipeService.delete(this.selectedId);
    this.#newDraft();
    this.render({ force: true });
  }
}
