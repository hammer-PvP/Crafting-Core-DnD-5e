export const MODULE_ID = "dnd5e-crafting-core";
export const MODULE_TITLE = "Crafting Core (DnD 5e)";
export const MODULE_VERSION = "0.0.7";

export const SETTINGS = Object.freeze({
  RECIPES: "recipes",
  MATERIAL_ECONOMY: "materialEconomy",
  MATERIAL_OVERRIDES: "materialOverrides",
  HARVEST_PROFILES: "harvestProfiles"
});

export const FLAGS = Object.freeze({
  // Legacy v0.0.1/v0.0.2 knowledge flag. Kept for migration/backward compatibility.
  KNOWN_RECIPES: "knownRecipes",
  // v0.0.3+ self-contained Actor knowledge store: { [recipeId]: { recipe, learnedAt, ... } }.
  LEARNED_RECIPES: "learnedRecipes",
  CRAFTING_JOB: "craftingJob",
  SOURCE_UUID: "sourceUuid",
  KNOWLEDGE_RECIPE_ID: "knowledgeRecipeId",
  KNOWLEDGE_ACTIVITY: "knowledgeActivity",
  KNOWLEDGE_RECIPE_SNAPSHOT: "knowledgeRecipeSnapshot",
  KNOWLEDGE_SOURCE_TYPE: "knowledgeSourceType",
  KNOWLEDGE_PUBLISHED: "knowledgePublished",
  KNOWLEDGE_PUBLISHED_AT: "knowledgePublishedAt",
  MATERIAL: "material",
  MATERIAL_ID: "materialId",
  MATERIAL_FAMILY: "materialFamily",
  MATERIAL_NATURE: "materialNature",
  MATERIAL_CATEGORY: "materialCategory",
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

// D&D5e 5.3.3 2024 magic-item crafting gold costs. Crafting Core uses the
// output Item's rarity to price its permanent Knowledge Source.
export const KNOWLEDGE_PRICE_BY_RARITY = Object.freeze({
  "": 0,
  common: 50,
  uncommon: 200,
  rare: 2000,
  veryRare: 20000,
  legendary: 100000,
  artifact: 100000
});

export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
