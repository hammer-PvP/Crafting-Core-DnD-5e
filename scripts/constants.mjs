export const MODULE_ID = "dnd5e-crafting-core";
export const MODULE_TITLE = "Crafting Core (DnD 5e)";
export const MODULE_VERSION = "0.0.2";

export const SETTINGS = Object.freeze({
  RECIPES: "recipes",
  MATERIAL_ECONOMY: "materialEconomy"
});

export const FLAGS = Object.freeze({
  KNOWN_RECIPES: "knownRecipes",
  CRAFTING_JOB: "craftingJob",
  SOURCE_UUID: "sourceUuid",
  KNOWLEDGE_RECIPE_ID: "knowledgeRecipeId",
  KNOWLEDGE_ACTIVITY: "knowledgeActivity",
  MATERIAL: "material",
  MATERIAL_ID: "materialId",
  MATERIAL_FAMILY: "materialFamily",
  MATERIAL_NATURE: "materialNature",
  MATERIAL_RARITY: "materialRarity",
  MATERIAL_CHANCE: "materialChance",
  MATERIAL_QUANTITY: "materialQuantity",
  MATERIAL_TAGS: "materialTags",
  MATERIAL_REQUIRES: "materialRequires",
  MATERIAL_BIOMES: "materialBiomes",
  MATERIAL_MANAGED: "materialManaged",
  MATERIAL_CATALOG_VERSION: "materialCatalogVersion"
});

export const DEFAULT_MATERIAL_ICON = "icons/containers/bags/coinpouch-simple-leather-silver-brown.webp";
export const FALLBACK_ITEM_ICON = "icons/svg/item-bag.svg";
export const FILE_PICKER_ROOT = "icons/";

export const KNOWLEDGE_ICONS = Object.freeze({
  Recipe: "icons/sundries/documents/document-gold.webp",
  Formula: "icons/sundries/scrolls/scroll-bound-leather-tan.webp",
  Manual: "icons/sundries/books/book-tooled-silver-blue.webp",
  Blueprint: "icons/commodities/tech/blueprint.webp"
});

export const DEFAULT_KNOWLEDGE_ICON = KNOWLEDGE_ICONS.Recipe;
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
