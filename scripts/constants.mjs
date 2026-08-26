export const MODULE_ID = "dnd5e-crafting-core";
export const MODULE_TITLE = "Crafting Core (DnD 5e)";
export const MODULE_VERSION = "0.0.1";

export const SETTINGS = Object.freeze({
  RECIPES: "recipes"
});

export const FLAGS = Object.freeze({
  KNOWN_RECIPES: "knownRecipes",
  CRAFTING_JOB: "craftingJob",
  SOURCE_UUID: "sourceUuid",
  KNOWLEDGE_RECIPE_ID: "knowledgeRecipeId",
  KNOWLEDGE_ACTIVITY: "knowledgeActivity"
});

export const DEFAULT_MATERIAL_ICON = "icons/containers/bags/coinpouch-simple-leather-silver-brown.webp";
export const DEFAULT_KNOWLEDGE_ICON = "icons/svg/book.svg";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;
