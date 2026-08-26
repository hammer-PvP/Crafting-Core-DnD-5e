import { DEFAULT_KNOWLEDGE_ICON, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";

export class RecipeService {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.RECIPES, {
      name: "Crafting Core Recipes",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }

  static all() {
    if (!game.user?.isGM) return {};
    const stored = game.settings.get(MODULE_ID, SETTINGS.RECIPES);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return foundry.utils.deepClone(stored);
  }

  static list() {
    return Object.values(this.all()).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n.lang));
  }

  static get(id) {
    return this.all()[id] ?? null;
  }

  static async save(recipe) {
    if (!game.user.isGM) throw new Error("Only a GM can create or edit Crafting Core recipes.");
    const normalized = this.normalize(recipe);
    const recipes = this.all();
    recipes[normalized.id] = normalized;
    await game.settings.set(MODULE_ID, SETTINGS.RECIPES, recipes);
    Hooks.callAll(`${MODULE_ID}.recipesChanged`, normalized.id);
    return normalized;
  }

  static async delete(id) {
    if (!game.user.isGM) throw new Error("Only a GM can delete Crafting Core recipes.");
    const recipes = this.all();
    if (!(id in recipes)) return false;
    delete recipes[id];
    await game.settings.set(MODULE_ID, SETTINGS.RECIPES, recipes);
    Hooks.callAll(`${MODULE_ID}.recipesChanged`, id);
    return true;
  }

  static normalize(recipe={}) {
    const id = String(recipe.id || foundry.utils.randomID(20));
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    return {
      id,
      name: String(recipe.name || "New Recipe").trim() || "New Recipe",
      img: String(recipe.img || recipe.result?.img || "icons/svg/item-bag.svg"),
      craftingTime: Math.max(0, Math.floor(Number(recipe.craftingTime) || 0)),
      ingredients: ingredients
        .filter(row => row?.uuid)
        .map(row => ({
          uuid: String(row.uuid),
          sourceUuid: String(row.sourceUuid || row.uuid),
          name: String(row.name || "Item"),
          img: String(row.img || "icons/svg/item-bag.svg"),
          type: String(row.type || ""),
          identifier: String(row.identifier || ""),
          quantity: Math.max(1, Math.floor(Number(row.quantity) || 1))
        })),
      result: recipe.result?.uuid ? {
        uuid: String(recipe.result.uuid),
        sourceUuid: String(recipe.result.sourceUuid || recipe.result.uuid),
        name: String(recipe.result.name || "Item"),
        img: String(recipe.result.img || "icons/svg/item-bag.svg"),
        type: String(recipe.result.type || ""),
        identifier: String(recipe.result.identifier || ""),
        quantity: Math.max(1, Math.floor(Number(recipe.result.quantity) || 1)),
        snapshot: recipe.result.snapshot && typeof recipe.result.snapshot === "object"
          ? foundry.utils.deepClone(recipe.result.snapshot)
          : null
      } : null,
      knowledge: (() => {
        const label = String(recipe.knowledge?.label || "Recipe").trim() || "Recipe";
        return {
          label,
          name: String(recipe.knowledge?.name || "").trim(),
          img: String((!recipe.knowledge?.img || recipe.knowledge?.img === "icons/svg/book.svg")
            ? (KNOWLEDGE_ICONS[label] || DEFAULT_KNOWLEDGE_ICON)
            : recipe.knowledge.img)
        };
      })(),
      publication: recipe.publication && typeof recipe.publication === "object" ? {
        uuid: String(recipe.publication.uuid || ""),
        pack: String(recipe.publication.pack || ""),
        sourceType: String(recipe.publication.sourceType || recipe.knowledge?.label || "Recipe"),
        publishedAt: Number(recipe.publication.publishedAt) || 0,
        updatedAt: Number(recipe.publication.updatedAt) || 0
      } : null,
      createdAt: Number(recipe.createdAt) || Date.now(),
      updatedAt: Date.now()
    };
  }

  static snapshot(recipe) {
    const normalized = this.normalize(foundry.utils.deepClone(recipe ?? {}));
    // Publication is authoring metadata, not part of the learned crafting definition.
    normalized.publication = null;
    return normalized;
  }

  static canonicalUuid(item) {
    if (!item) return null;
    return String(
      item.getFlag?.(MODULE_ID, "sourceUuid")
      ?? item.getFlag?.("dnd5e", "sourceId")
      ?? item._stats?.compendiumSource
      ?? item.flags?.core?.sourceId
      ?? item._stats?.duplicateSource
      ?? item.uuid
      ?? ""
    ) || null;
  }

  static itemReference(item, quantity=1, { snapshot=false }={}) {
    if (!item) return null;
    return {
      // uuid is the exact definition selected by the GM and is used when materializing the crafted result.
      uuid: String(item.uuid),
      // sourceUuid is a provenance identity used to recognize copies in Actor inventories.
      sourceUuid: this.canonicalUuid(item) ?? String(item.uuid),
      name: item.name,
      img: item.img,
      type: item.type,
      identifier: String(item.system?.identifier ?? ""),
      quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
      ...(snapshot ? { snapshot: item.toObject() } : {})
    };
  }

  static sourceCandidates(item) {
    if (!item) return new Set();
    return new Set([
      item.uuid,
      item.getFlag?.(MODULE_ID, "sourceUuid"),
      item.getFlag?.("dnd5e", "sourceId"),
      item._stats?.compendiumSource,
      item.flags?.core?.sourceId,
      item._stats?.duplicateSource
    ].filter(Boolean).map(String));
  }

  static itemMatchesReference(item, reference) {
    if (!item || !reference) return false;
    const candidates = this.sourceCandidates(item);
    const uuid = String(reference.uuid || "");
    const sourceUuid = String(reference.sourceUuid || "");
    if (uuid && candidates.has(uuid)) return true;
    if (sourceUuid && candidates.has(sourceUuid)) return true;

    const refIdentifier = String(reference.identifier || "").trim();
    const itemIdentifier = String(item.system?.identifier ?? "").trim();
    if (refIdentifier && itemIdentifier && refIdentifier === itemIdentifier) {
      return !reference.type || item.type === reference.type;
    }

    // Last-resort support for custom world Items without stable provenance metadata.
    return Boolean(reference.name && item.name === reference.name && (!reference.type || item.type === reference.type));
  }
}
