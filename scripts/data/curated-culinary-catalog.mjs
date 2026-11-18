import { canonicalMealIcon } from "./canonical-icon-catalog.mjs";

/**
 * Crafting Core official Curated Culinary library.
 *
 * These records are content definitions, not world documents. CuratedContentService
 * materializes them into the private Products and Learn Sources world Compendiums.
 */

export const CURATED_CULINARY_VERSION = 8;

const MEAL = Object.freeze({
  HEARTY: "hearty",
  ENERGIZING: "energizing",
  COMPLETE: "complete"
});

const recipe = ({ id, name, culture, mealType, description, ingredients, yieldCount=1 }) => ({
  id,
  recipeId: `crafting-core-curated-culinary-${id}`,
  productId: `crafting-core-product-${id}`,
  name,
  culture,
  category: "culinary",
  subcategory: "meal",
  mealType,
  rarity: "common",
  curated: true,
  source: "crafting-core",
  effectFamily: "food",
  durationMode: "hours",
  durationValue: 6,
  tempHp: mealType === MEAL.HEARTY ? 5 : 0,
  maximumHpBonus: mealType === MEAL.COMPLETE ? 5 : 0,
  movementBonus: mealType === MEAL.ENERGIZING || mealType === MEAL.COMPLETE ? 5 : 0,
  // v0.2.3: products are priced dynamically at 2x the current ingredient value during sync.
  // Keeping the multiplier in the catalog makes Supplier/other consumers aware of the pricing rule.
  yield: Math.max(1, Math.min(4, Number(yieldCount) || 1)),
  priceMultiplier: 2,
  craftingTime: 10,
  description,
  ingredients: ingredients.map(([materialId, quantity=1]) => ({ materialId, quantity })),
  icon: canonicalMealIcon(id)
});

export const CURATED_CULINARY_RECIPES = Object.freeze([
  // Dwarven Cuisine
  recipe({
    id: "forge-stew",
    name: "Forge Stew",
    culture: "dwarven",
    mealType: MEAL.HEARTY,
    yieldCount: 3,
    description: "A thick stew of meat, roots, and vegetables traditionally kept close to a forge's coals for hours. Simple, heavy, and nourishing.",
    ingredients: [["hunt-wild-boar-basic"], ["trade-potato"], ["trade-carrot"]],}),
  recipe({
    id: "hot-stone-ribs",
    name: "Hot-Stone Ribs",
    culture: "dwarven",
    mealType: MEAL.HEARTY,
    yieldCount: 2,
    description: "Strongly seasoned meat cooked over stone heated directly by the fire, common among dwarven workers, hunters, and smiths.",
    ingredients: [["hunt-deer-basic"], ["trade-salt"], ["trade-seasonings"]],}),
  recipe({
    id: "khaz-marchbread",
    name: "Khaz Marchbread",
    culture: "dwarven",
    mealType: MEAL.ENERGIZING,
    yieldCount: 4,
    description: "A dense, compact, faintly sweet bread made for patrols and long underground journeys. Small, heavy, and surprisingly sustaining.",
    ingredients: [["trade-flour"], ["trade-barley"], ["trade-honey"]],}),
  recipe({
    id: "miners-hand-pie",
    name: "Miner's Hand Pie",
    culture: "dwarven",
    mealType: MEAL.ENERGIZING,
    yieldCount: 3,
    description: "A sturdy closed pie designed to survive a pocket or work satchel through a long mining shift, traditionally filled with meat and subterranean fungi.",
    ingredients: [["trade-flour"], ["gathering-bitter-fungus"], ["hunt-wild-boar-basic"]],}),
  recipe({
    id: "hot-stone-feast",
    name: "Hot-Stone Feast",
    culture: "dwarven",
    mealType: MEAL.COMPLETE,
    yieldCount: 4,
    description: "A complete meal of meat, roots, mushrooms, and bread served on broad heated stone slabs before journeys, heavy work, or smaller celebrations.",
    ingredients: [["hunt-wild-boar-basic"], ["trade-potato"], ["gathering-bitter-fungus"], ["trade-bread"]],}),

  // Elven Cuisine
  recipe({
    id: "silverdew-fruits",
    name: "Silverdew Fruits",
    culture: "elven",
    mealType: MEAL.HEARTY,
    yieldCount: 2,
    description: "Fresh fruit prepared at dawn and lightly dressed with honey, named for the tradition of serving it while the morning dew still clings to the harvest.",
    ingredients: [["trade-apple"], ["trade-grapes"], ["trade-honey"]],}),
  recipe({
    id: "stillleaf-broth",
    name: "Stillleaf Broth",
    culture: "elven",
    mealType: MEAL.HEARTY,
    yieldCount: 3,
    description: "A light broth slowly prepared from roots, fungi, and aromatic leaves, traditionally served warm during periods of rest and contemplation.",
    ingredients: [["gathering-elfleaf"], ["gathering-common-root"], ["gathering-bitter-fungus"]],}),
  recipe({
    id: "lightleaf-cakes",
    name: "Lightleaf Cakes",
    culture: "elven",
    mealType: MEAL.ENERGIZING,
    yieldCount: 4,
    description: "Small aromatic travel cakes commonly wrapped in leaves for elven scouts, travelers, and explorers.",
    ingredients: [["trade-flour"], ["trade-honey"], ["gathering-elfleaf"]],}),
  recipe({
    id: "greenway-salad",
    name: "Greenway Salad",
    culture: "elven",
    mealType: MEAL.ENERGIZING,
    yieldCount: 2,
    description: "A fresh meal of greens, fruit, and herbs, common among travelers moving along forest paths.",
    ingredients: [["trade-cabbage"], ["trade-apple"], ["gathering-elfleaf"]],}),
  recipe({
    id: "table-of-the-star-roads",
    name: "Table of the Star Roads",
    culture: "elven",
    mealType: MEAL.COMPLETE,
    yieldCount: 4,
    description: "A small composed meal of fruit, aromatic leaves, accompaniments, and honey traditionally prepared before a long journey beneath the night sky.",
    ingredients: [["trade-apple"], ["trade-grapes"], ["trade-honey"], ["gathering-elfleaf"]],}),

  // Common Cuisine
  recipe({
    id: "roadside-stew",
    name: "Roadside Stew",
    culture: "common",
    mealType: MEAL.HEARTY,
    yieldCount: 3,
    description: "A simple roadside stew made from inexpensive ingredients easily found in rural regions, common among merchants, travelers, and adventurers.",
    ingredients: [["hunt-hare-basic"], ["trade-potato"], ["trade-carrot"]],}),
  recipe({
    id: "farmers-pie",
    name: "Farmer's Pie",
    culture: "common",
    mealType: MEAL.HEARTY,
    yieldCount: 4,
    description: "A rustic meat-and-vegetable pie traditionally served on farms, in small villages, and at rural inns.",
    ingredients: [["trade-flour"], ["hunt-game-bird-basic"], ["trade-potato"]],}),
  recipe({
    id: "messengers-bread",
    name: "Messenger's Bread",
    culture: "common",
    mealType: MEAL.ENERGIZING,
    yieldCount: 2,
    description: "Bread served with fruit and honey as a quick meal for messengers and travelers who need to keep moving.",
    ingredients: [["trade-bread"], ["trade-honey"], ["trade-apple"]],}),
  recipe({
    id: "first-bell-eggs",
    name: "First Bell Eggs",
    culture: "common",
    mealType: MEAL.ENERGIZING,
    yieldCount: 1,
    description: "Seasoned eggs served with bread at dawn, named for the first morning bell in towns, barracks, villages, and rural communities.",
    ingredients: [["trade-eggs"], ["trade-bread"], ["trade-seasonings"]],}),
  recipe({
    id: "adventurers-breakfast",
    name: "Adventurer's Breakfast",
    culture: "common",
    mealType: MEAL.COMPLETE,
    yieldCount: 2,
    description: "A substantial inn breakfast of eggs, meat, bread, and potatoes prepared for someone expecting a full day of travel, exploration, or monster hunting.",
    ingredients: [["trade-eggs"], ["hunt-game-bird-basic"], ["trade-bread"], ["trade-potato"]],})
]);

export const CURATED_CULINARY_MEAL_TYPES = MEAL;
