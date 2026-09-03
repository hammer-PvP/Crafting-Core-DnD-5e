import { FLAGS, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { CURATED_CULINARY_RECIPES, CURATED_CULINARY_VERSION } from "../data/curated-culinary-catalog.mjs";
import { CURATED_ALCOHOLIC_RECIPES, CURATED_NON_ALCOHOLIC_RECIPES, CURATED_DRINKS_VERSION } from "../data/curated-drinks-catalog.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { RecipeService } from "./recipe-service.mjs";

const ITEM_CREATOR_ID = "dnd5e-item-creator";
const ITEM_CREATOR_MIN_VERSION = "0.7.1";
const ITEM_CREATOR_SCHEMA_VERSION = 17;
const ACTIVE_EFFECT_ICON = "systems/dnd5e/icons/svg/documents/active-effect.svg";
const PRICE_CP = Object.freeze({ cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 });
const FOOD_RUNTIME_KEY = "crafting-core:culinary:food-benefit";
const LEGACY_FOOD_RUNTIME_KEY = "crafting-core:culinary:movement-benefit";
const ALCOHOL_RUNTIME_KEY = "crafting-core:culinary:alcohol-benefit";
const SIX_HOURS_SECONDS = 6 * 60 * 60;
const CURATED_CONTENT_VERSION = Math.max(CURATED_CULINARY_VERSION, 5 + CURATED_DRINKS_VERSION - 1);
const CURATED_RECIPES = Object.freeze([
  ...CURATED_CULINARY_RECIPES,
  ...CURATED_ALCOHOLIC_RECIPES,
  ...CURATED_NON_ALCOHOLIC_RECIPES
]);
const CURATED_BY_PRODUCT_ID = new Map(CURATED_RECIPES.map(entry => [entry.productId, entry]));
const CURATED_BY_RECIPE_ID = new Map(CURATED_RECIPES.map(entry => [entry.recipeId, entry]));

function clone(value) {
  return foundry.utils.deepClone(value);
}

function stableId(seed) {
  const text = String(seed ?? "");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0").slice(0, 16);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

function cleanDocumentSource(source) {
  const data = clone(source ?? {});
  for (const key of ["_id", "folder", "sort", "ownership", "_stats", "pack"]) delete data[key];
  return data;
}

function valuesOf(value) {
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return [...value];
  if (value?.values instanceof Function) {
    try { return [...value.values()]; } catch (_) { /* fall through */ }
  }
  return value && typeof value === "object" ? Object.values(value) : [];
}

function getPath(object, path) {
  return String(path).split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const parts = String(path).split(".");
  let cursor = object;
  for (const key of parts.slice(0, -1)) {
    cursor[key] ??= {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = clone(value);
}

function versionAtLeast(current, minimum) {
  const parse = value => String(value ?? "").split(/[+-]/)[0].split(".").map(part => Number.parseInt(part, 10) || 0);
  const left = parse(current);
  const right = parse(minimum);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

function priceToCopper(price) {
  const denomination = String(price?.denomination ?? "gp").toLowerCase();
  return Math.max(0, Math.round((Number(price?.value) || 0) * (PRICE_CP[denomination] ?? PRICE_CP.gp)));
}

function priceFromCopper(copper) {
  const value = Math.max(0, Math.round(Number(copper) || 0));
  if (value % PRICE_CP.gp === 0) return { value: value / PRICE_CP.gp, denomination: "gp" };
  if (value % PRICE_CP.sp === 0) return { value: value / PRICE_CP.sp, denomination: "sp" };
  return { value, denomination: "cp" };
}

function formatPrice(price) {
  return `${Number(price?.value ?? 0)} ${String(price?.denomination ?? "gp")}`;
}

function titleCase(value) {
  return String(value ?? "").replace(/[-_]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function itemFromActivity(activity) {
  const parent = activity?.item ?? activity?.parent ?? activity?.document?.parent;
  return parent?.documentName === "Item" || parent?.constructor?.documentName === "Item" ? parent : null;
}

function actorFromItem(item) {
  const parent = item?.actor ?? item?.parent;
  return parent?.documentName === "Actor" || parent?.constructor?.documentName === "Actor" ? parent : null;
}

function currentWorldTime() {
  return Number(game.time?.worldTime) || 0;
}

function signed(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function normalizedRecipeBaseline(recipe) {
  const data = RecipeService.snapshot(recipe);
  delete data.createdAt;
  delete data.updatedAt;
  delete data.publication;
  return data;
}

function editableProductSnapshot(source) {
  const data = source?.toObject instanceof Function ? source.toObject(false) : source ?? {};
  return {
    name: data.name ?? "",
    img: data.img ?? "",
    description: clone(data.system?.description ?? { value: "", chat: "" }),
    weight: clone(data.system?.weight ?? { value: 0, units: "lb" }),
    price: clone(data.system?.price ?? { value: 0, denomination: "gp" }),
    rarity: String(data.system?.rarity ?? "")
  };
}

function extractLegacyBaselineProduct(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.hasOwn(value, "description") && Object.hasOwn(value, "price")) return clone(value);
  if (value.system || value.name || value.img) return editableProductSnapshot(value);
  return null;
}

function preserveExternalFlags(current, next) {
  const currentFlags = clone(current?.flags ?? {});
  const nextFlags = clone(next?.flags ?? {});
  for (const [namespace, value] of Object.entries(currentFlags)) {
    if ([MODULE_ID, ITEM_CREATOR_ID].includes(namespace)) continue;
    nextFlags[namespace] = clone(value);
  }
  next.flags = nextFlags;
  return next;
}

function mergeProductPresentation(current, official, previousBaseline, entry) {
  const next = preserveExternalFlags(current, clone(official));
  const currentEditable = editableProductSnapshot(current);
  const baseline = extractLegacyBaselineProduct(previousBaseline);
  const paths = ["name", "img", "description", "weight", "price", "rarity"];

  if (baseline) {
    for (const path of paths) {
      if (!sameValue(getPath(currentEditable, path), getPath(baseline, path))) {
        setPath(next, path === "name" || path === "img" ? path : `system.${path}`, getPath(currentEditable, path));
      }
    }
    return next;
  }

  // v0.2.0-v0.2.2 pre-baseline recovery. Preserve obvious GM customizations while
  // treating the shipped legacy values as replaceable defaults.
  if (currentEditable.name && currentEditable.name !== entry.name) next.name = currentEditable.name;
  if (currentEditable.img) next.img = currentEditable.img;
  const officialDescription = editableProductSnapshot(official).description;
  if (!sameValue(currentEditable.description, officialDescription)) next.system.description = clone(currentEditable.description);
  if (Number(currentEditable.weight?.value) !== 0) next.system.weight = clone(currentEditable.weight);
  const legacyPriceCp = entry.mealType === "complete" ? 100 : 50; // v0.2.0/v0.2.1 defaults.
  const currentPriceCp = priceToCopper(currentEditable.price);
  const officialPriceCp = priceToCopper(official.system?.price);
  const previousSingleOutputPriceCp = officialPriceCp * Math.max(1, Number(entry.yield) || 1); // v0.2.3/v0.2.4 meal economy.
  if (![legacyPriceCp, officialPriceCp, previousSingleOutputPriceCp].includes(currentPriceCp)) next.system.price = clone(currentEditable.price);
  if (currentEditable.rarity && currentEditable.rarity !== "common") next.system.rarity = currentEditable.rarity;
  return next;
}

function mergeRecipeDefinition(currentRecipe, officialRecipe, previousBaseline, entry, expectedIngredientNames) {
  if (!currentRecipe || typeof currentRecipe !== "object") return clone(officialRecipe);
  const current = normalizedRecipeBaseline(currentRecipe);
  const official = normalizedRecipeBaseline(officialRecipe);
  const baseline = previousBaseline && typeof previousBaseline === "object"
    ? normalizedRecipeBaseline(previousBaseline.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT] ?? previousBaseline.recipe ?? previousBaseline)
    : null;

  if (baseline) {
    const merge = (now, oldDefault, newDefault) => {
      if (oldDefault === undefined) return now === undefined ? clone(newDefault) : clone(now);
      if (newDefault === undefined) return clone(now);
      if (sameValue(now, oldDefault)) return clone(newDefault);
      const objects = [now, oldDefault, newDefault].every(value => value && typeof value === "object" && !Array.isArray(value));
      if (!objects) return clone(now);
      const result = clone(now);
      for (const key of Object.keys(newDefault)) result[key] = merge(now[key], oldDefault[key], newDefault[key]);
      return result;
    };
    const merged = merge(current, baseline, official);
    merged.id = official.id;
    merged.knowledge = clone(official.knowledge);
    return RecipeService.snapshot(merged);
  }

  // Recovery for the experimental v0.2.0-v0.2.2 line. Keep GM-authored rules,
  // visibility and prose, but repair fields that can be confidently recognized as
  // the old official defaults.
  const merged = clone(current);
  merged.id = official.id;
  merged.knowledge = clone(official.knowledge);
  if ([600, 1200, 10].includes(Number(merged.craftingTime))) merged.craftingTime = 10;

  const currentIngredientNames = (merged.ingredients ?? []).map(row => String(row?.name ?? ""));
  const currentQuantities = (merged.ingredients ?? []).map(row => Math.max(1, Number(row?.quantity) || 1));
  const officialQuantities = (official.ingredients ?? []).map(row => Math.max(1, Number(row?.quantity) || 1));
  if (sameValue(currentIngredientNames, expectedIngredientNames) && sameValue(currentQuantities, officialQuantities)) {
    merged.ingredients = clone(official.ingredients);
  }
  if (String(merged.result?.name ?? "") === entry.name) merged.result = clone(official.result);
  return RecipeService.snapshot(merged);
}

export class CuratedContentService {
  static PRODUCTS_PACK_NAME = "crafting-core-products";
  static PRODUCTS_PACK_LABEL = "Crafting Core — Products";
  static PRODUCTS_PACK_ID = `world.${this.PRODUCTS_PACK_NAME}`;
  static #managedDeletes = new Set();
  static #hooksInstalled = false;
  static #pendingConsumptions = new WeakMap();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE, {
      name: "Crafting Core Curated Content State",
      scope: "world",
      config: false,
      type: Object,
      default: {
        culinaryVersion: 0,
        suppressedProducts: [],
        suppressedRecipes: [],
        productIcons: {},
        productBaselines: {},
        recipeBaselines: {}
      }
    });
  }

  static state() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE);
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    return {
      culinaryVersion: Math.max(0, Number(source.culinaryVersion) || 0),
      suppressedProducts: [...new Set((source.suppressedProducts ?? []).map(String).filter(Boolean))],
      suppressedRecipes: [...new Set((source.suppressedRecipes ?? []).map(String).filter(Boolean))],
      productIcons: source.productIcons && typeof source.productIcons === "object" ? clone(source.productIcons) : {},
      productBaselines: source.productBaselines && typeof source.productBaselines === "object" ? clone(source.productBaselines) : {},
      recipeBaselines: source.recipeBaselines && typeof source.recipeBaselines === "object" ? clone(source.recipeBaselines) : {}
    };
  }

  static async #saveState(state) {
    await game.settings.set(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE, clone(state));
  }

  static installHooks() {
    if (this.#hooksInstalled) return;
    this.#hooksInstalled = true;

    // Products do not have a separate lifecycle service, so direct deletion from the
    // Products Compendium is the explicit signal that the GM wants that official Product
    // suppressed until Restore Curated Product Defaults is used.
    Hooks.on("deleteItem", item => {
      if (!game.user?.isGM || !item?.pack) return;
      const token = `${item.pack}:${item.id}`;
      if (this.#managedDeletes.has(token)) return;
      if (item.pack === this.PRODUCTS_PACK_ID && item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED)) {
        const productId = String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
        if (productId) void this.#suppress("product", productId);
      }
    });

    // Curated Learn Sources are governed by the same authoritative Knowledge lifecycle as
    // every other Recipe. Suppression is recorded only when that lifecycle confirms a real
    // Unpublish/direct Compendium deletion. Deleting a Builder Draft must never suppress or
    // remove its published Curated source.
    Hooks.on(`${MODULE_ID}.knowledgeUnpublished`, recipeId => {
      const id = String(recipeId ?? "");
      if (!CURATED_BY_RECIPE_ID.has(id)) return;
      void this.#suppress("recipe", id);
    });
    Hooks.on(`${MODULE_ID}.knowledgePublished`, recipeId => {
      const id = String(recipeId ?? "");
      if (!CURATED_BY_RECIPE_ID.has(id)) return;
      // Republishing an intentionally/unintentionally missing official source makes it live
      // again. Clear stale suppression so a later GM startup cannot treat it as absent by design.
      // Then repair its official metadata/folder after the normal publish transaction finishes.
      void this.#unsuppress("recipe", id);
      setTimeout(() => {
        if (!game.user?.isGM || !this.itemCreatorCompatible()) return;
        void this.sync({ restore: false }).catch(error => {
          console.warn(`${MODULE_ID} | Could not post-repair Curated Recipe ${id} after publication.`, error);
        });
      }, 0);
    });

    // Track Curated Food temporary HP around native D&D5e consumption. Persistent Food and
    // Alcohol effects themselves remain Item Creator effects; Crafting Core only adds the
    // missing "6 hours OR any Rest" boundary and safe ownership tracking for Food Temp HP.
    Hooks.on("dnd5e.activityConsumption", activity => {
      try {
        const item = itemFromActivity(activity);
        const actor = actorFromItem(item);
        const productId = String(item?.getFlag?.(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
        const entry = CURATED_BY_PRODUCT_ID.get(productId);
        if (!actor || !entry) return;
        this.#pendingConsumptions.set(activity, {
          actor,
          entry,
          preTempHp: Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0)
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Could not snapshot Curated consumable use.`, error);
      }
    });

    Hooks.on("dnd5e.postUseActivity", async activity => {
      try {
        const snapshot = this.#pendingConsumptions.get(activity) ?? null;
        this.#pendingConsumptions.delete(activity);
        const item = itemFromActivity(activity);
        const actor = snapshot?.actor ?? actorFromItem(item);
        const productId = String(item?.getFlag?.(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
        const entry = snapshot?.entry ?? CURATED_BY_PRODUCT_ID.get(productId);
        if (!actor || !entry || entry.effectFamily !== "food") return;
        await this.#removeRuntimeFamilyEffects(actor, [LEGACY_FOOD_RUNTIME_KEY]);
        await this.#recordFoodUse(actor, entry, snapshot?.preTempHp ?? Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0));
        setTimeout(() => void this.#capCurrentHp(actor), 0);
      } catch (error) {
        console.error(`${MODULE_ID} | Curated Food post-use tracking failed.`, error);
      }
    });

    Hooks.on("dnd5e.restCompleted", async (actor, result) => {
      try {
        const restType = String(result?.type ?? result?.restType ?? "").toLowerCase();
        if (!restType.includes("short") && !restType.includes("long")) return;
        await this.#clearFoodState(actor, { reason: restType || "rest" });
        await this.#removeRuntimeFamilyEffects(actor, [FOOD_RUNTIME_KEY, LEGACY_FOOD_RUNTIME_KEY, ALCOHOL_RUNTIME_KEY]);
        await this.#capCurrentHp(actor);
      } catch (error) {
        console.error(`${MODULE_ID} | Curated Food/Alcohol rest cleanup failed.`, error);
      }
    });

    Hooks.on("updateWorldTime", async worldTimeValue => {
      try { await this.#expireFoodStates(Number(worldTimeValue) || currentWorldTime()); }
      catch (error) { console.error(`${MODULE_ID} | Curated Food world-time cleanup failed.`, error); }
    });

    Hooks.on("updateActor", (actor, changes, options) => {
      try { void this.#observeFoodTempHp(actor, changes, options); }
      catch (error) { console.warn(`${MODULE_ID} | Curated Food Temp HP ownership tracking failed.`, error); }
    });

    Hooks.once("ready", () => {
      if (!game.user?.isGM) return;
      setTimeout(() => void this.#cleanupLegacyFoodRuntimeWorld(), 0);
    });
  }

  static async #cleanupLegacyFoodRuntimeWorld() {
    if (!game.user?.isGM) return 0;
    let removed = 0;
    for (const actor of game.actors ?? []) removed += await this.#removeRuntimeFamilyEffects(actor, [LEGACY_FOOD_RUNTIME_KEY]);
    return removed;
  }

  static async #recordFoodUse(actor, entry, preTempHp=0) {
    const previous = actor.getFlag?.(MODULE_ID, FLAGS.CURATED_FOOD_STATE) ?? null;
    const currentTempHp = Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0);

    // A new Food replaces the previous Food family. If the previous meal still owns
    // remaining Temp HP and the new meal does not grant Temp HP, remove only that
    // owned remainder. External Temp HP is left untouched.
    if (!(Number(entry.tempHp) > 0) && previous?.tempHpOwned) {
      const granted = Math.max(0, Number(previous.grantedTempHp) || 0);
      if (currentTempHp > 0 && currentTempHp <= granted) {
        await actor.update({ "system.attributes.hp.temp": 0 }, { craftingCoreCuratedFood: true, render: true });
      }
    }

    const postTempHp = Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0);
    const grantedTempHp = Math.max(0, Number(entry.tempHp) || 0);
    const previousOwned = Boolean(previous?.tempHpOwned);
    const tempHpOwned = grantedTempHp > 0 && postTempHp <= grantedTempHp && (
      postTempHp > Math.max(0, Number(preTempHp) || 0) || previousOwned
    );

    await actor.setFlag(MODULE_ID, FLAGS.CURATED_FOOD_STATE, {
      productId: entry.productId,
      appliedAtWorldTime: currentWorldTime(),
      expiresAtWorldTime: currentWorldTime() + SIX_HOURS_SECONDS,
      tempHpOwned,
      grantedTempHp,
      lastObservedTempHp: postTempHp
    });
  }

  static async #clearFoodState(actor, { reason="cleanup" }={}) {
    if (!actor) return false;
    const state = actor.getFlag?.(MODULE_ID, FLAGS.CURATED_FOOD_STATE) ?? null;
    if (!state) return false;
    const currentTempHp = Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0);
    const granted = Math.max(0, Number(state.grantedTempHp) || 0);
    if (state.tempHpOwned && currentTempHp > 0 && currentTempHp <= granted) {
      await actor.update({ "system.attributes.hp.temp": 0 }, { craftingCoreCuratedFood: true, render: true, reason });
    }
    await actor.unsetFlag(MODULE_ID, FLAGS.CURATED_FOOD_STATE);
    return true;
  }

  static async #removeRuntimeFamilyEffects(actor, keys) {
    if (!actor) return 0;
    const wanted = new Set((keys ?? []).map(String));
    const ids = [...(actor.effects ?? [])].filter(effect => {
      const flags = effect.flags?.[ITEM_CREATOR_ID] ?? {};
      return flags.consumableApplied === true && wanted.has(String(flags.consumableSourceKey ?? ""));
    }).map(effect => effect.id).filter(Boolean);
    if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids, { craftingCoreCuratedCleanup: true, render: true });
    return ids.length;
  }

  static async #capCurrentHp(actor) {
    if (!actor) return false;
    const current = Math.max(0, Number(actor.system?.attributes?.hp?.value) || 0);
    const maximum = Math.max(0, Number(actor.system?.attributes?.hp?.max) || 0);
    if (!maximum || current <= maximum) return false;
    await actor.update({ "system.attributes.hp.value": maximum }, { craftingCoreCuratedCleanup: true, render: true });
    return true;
  }

  static async #expireFoodStates(now=currentWorldTime()) {
    if (!game.user?.isGM) return 0;
    let expired = 0;
    for (const actor of game.actors ?? []) {
      const state = actor.getFlag?.(MODULE_ID, FLAGS.CURATED_FOOD_STATE) ?? null;
      const expires = Number(state?.expiresAtWorldTime);
      if (!Number.isFinite(expires) || expires <= 0 || expires > now) continue;
      await this.#clearFoodState(actor, { reason: "6-hours" });
      await this.#removeRuntimeFamilyEffects(actor, [FOOD_RUNTIME_KEY]);
      await this.#capCurrentHp(actor);
      expired += 1;
    }
    return expired;
  }

  static async #observeFoodTempHp(actor, changes, options={}) {
    if (!actor || options?.craftingCoreCuratedFood) return;
    if (!foundry.utils.hasProperty(changes ?? {}, "system.attributes.hp.temp")) return;
    const state = actor.getFlag?.(MODULE_ID, FLAGS.CURATED_FOOD_STATE) ?? null;
    if (!state?.tempHpOwned) return;
    const current = Math.max(0, Number(actor.system?.attributes?.hp?.temp) || 0);
    const previous = Math.max(0, Number(state.lastObservedTempHp) || 0);
    const next = clone(state);
    // Damage consumes owned Temp HP and therefore keeps ownership. A later increase from
    // another source means the meal no longer owns the current Temp HP and must not erase it.
    if (current > previous) next.tempHpOwned = false;
    next.lastObservedTempHp = current;
    await actor.setFlag(MODULE_ID, FLAGS.CURATED_FOOD_STATE, next);
  }

  static async #suppress(kind, id) {
    const state = this.state();
    const key = kind === "product" ? "suppressedProducts" : "suppressedRecipes";
    if (!state[key].includes(id)) state[key].push(id);
    await this.#saveState(state);
  }

  static async #unsuppress(kind, id) {
    const state = this.state();
    const key = kind === "product" ? "suppressedProducts" : "suppressedRecipes";
    const next = state[key].filter(value => value !== String(id));
    if (next.length === state[key].length) return false;
    state[key] = next;
    await this.#saveState(state);
    return true;
  }

  static itemCreatorActive() {
    return Boolean(game.modules?.get?.(ITEM_CREATOR_ID)?.active);
  }

  static itemCreatorVersion() {
    return String(game.modules?.get?.(ITEM_CREATOR_ID)?.version ?? "");
  }

  static itemCreatorCompatible() {
    return this.itemCreatorActive() && versionAtLeast(this.itemCreatorVersion(), ITEM_CREATOR_MIN_VERSION);
  }

  static productsPack() {
    return CompendiumService.findWorldPack(this.PRODUCTS_PACK_NAME);
  }

  static async ensureProductsPack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: this.PRODUCTS_PACK_NAME, label: this.PRODUCTS_PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, this.#productFolders());
    return pack;
  }

  static openProductsPack() {
    const pack = this.productsPack();
    if (!pack) return false;
    pack.render?.(true);
    return true;
  }

  static #productFolders() {
    return [
      { key: "culinary", name: "Culinary" },
      { key: "culinary:meals", name: "Meals", parent: "culinary" },
      { key: "culinary:meals:dwarven", name: "Dwarven Cuisine", parent: "culinary:meals" },
      { key: "culinary:meals:elven", name: "Elven Cuisine", parent: "culinary:meals" },
      { key: "culinary:meals:common", name: "Common Cuisine", parent: "culinary:meals" },
      { key: "culinary:alcohol", name: "Alcoholic Drinks", parent: "culinary" },
      { key: "culinary:alcohol:mundane", name: "Mundane", parent: "culinary:alcohol" },
      { key: "culinary:alcohol:dwarven", name: "Dwarven", parent: "culinary:alcohol" },
      { key: "culinary:alcohol:elven", name: "Elven", parent: "culinary:alcohol" },
      { key: "culinary:alcohol:cane-spirit", name: "Cane Spirits", parent: "culinary:alcohol" },
      { key: "culinary:nonalcohol", name: "Non-Alcoholic Drinks", parent: "culinary" },
      { key: "culinary:nonalcohol:mundane", name: "Mundane", parent: "culinary:nonalcohol" },
      { key: "culinary:nonalcohol:dwarven", name: "Dwarven", parent: "culinary:nonalcohol" },
      { key: "culinary:nonalcohol:elven", name: "Elven", parent: "culinary:nonalcohol" }
    ];
  }

  static #productFolderKey(entry) {
    if (entry.subcategory === "meal") return `culinary:meals:${entry.culture}`;
    if (entry.subcategory === "alcoholic-drink") return `culinary:alcohol:${entry.culture}`;
    if (entry.subcategory === "non-alcoholic-drink") return `culinary:nonalcohol:${entry.culture}`;
    return "culinary";
  }

  static #knowledgeFolders() {
    // Foundry Compendium folder nesting is finite, so Curated knowledge uses three levels:
    // Crafting Core Curated -> Product Family -> Culture.
    return [
      { key: "curated", name: "Crafting Core Curated" },
      { key: "curated:meals", name: "Culinary Meals", parent: "curated" },
      { key: "curated:meals:dwarven", name: "Dwarven Cuisine", parent: "curated:meals" },
      { key: "curated:meals:elven", name: "Elven Cuisine", parent: "curated:meals" },
      { key: "curated:meals:common", name: "Common Cuisine", parent: "curated:meals" },
      { key: "curated:alcohol", name: "Alcoholic Drinks", parent: "curated" },
      { key: "curated:alcohol:mundane", name: "Mundane", parent: "curated:alcohol" },
      { key: "curated:alcohol:dwarven", name: "Dwarven", parent: "curated:alcohol" },
      { key: "curated:alcohol:elven", name: "Elven", parent: "curated:alcohol" },
      { key: "curated:alcohol:cane-spirit", name: "Cane Spirits", parent: "curated:alcohol" },
      { key: "curated:nonalcohol", name: "Non-Alcoholic Drinks", parent: "curated" },
      { key: "curated:nonalcohol:mundane", name: "Mundane", parent: "curated:nonalcohol" },
      { key: "curated:nonalcohol:dwarven", name: "Dwarven", parent: "curated:nonalcohol" },
      { key: "curated:nonalcohol:elven", name: "Elven", parent: "curated:nonalcohol" }
    ];
  }

  static #knowledgeFolderKey(entry) {
    if (entry.subcategory === "meal") return `curated:meals:${entry.culture}`;
    if (entry.subcategory === "alcoholic-drink") return `curated:alcohol:${entry.culture}`;
    if (entry.subcategory === "non-alcoholic-drink") return `curated:nonalcohol:${entry.culture}`;
    return "curated";
  }

  static async syncIfNeeded() {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };
    if (!this.itemCreatorCompatible()) return { skipped: true, reason: "item-creator" };

    const state = this.state();
    const products = this.productsPack();
    const learn = KnowledgeItemService.pack();
    const productDocs = products ? await products.getDocuments() : [];
    const recipeDocs = learn ? await learn.getDocuments() : [];

    const presentProductIds = new Set(productDocs
      .map(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""))
      .filter(Boolean));
    const presentRecipeIds = new Set(recipeDocs
      .map(item => String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""))
      .filter(Boolean));

    // A source that exists cannot simultaneously be "suppressed". This can happen after a GM
    // republishes a source that had previously been deleted. Repair that stale state before
    // deciding whether startup synchronization can be skipped.
    const repairedState = clone(state);
    // v0.2.0-v0.2.3 were development candidates and could leave Curated Recipe suppression
    // state out of sync with the actual Learn Sources pack. On the first v0.2.4 migration,
    // restore the official Recipe set once; after that, explicit Unpublish is respected again.
    if (repairedState.culinaryVersion < 4) repairedState.suppressedRecipes = [];
    repairedState.suppressedProducts = repairedState.suppressedProducts.filter(id => !presentProductIds.has(id));
    repairedState.suppressedRecipes = repairedState.suppressedRecipes.filter(id => !presentRecipeIds.has(id));
    if (!sameValue(repairedState.suppressedProducts, state.suppressedProducts)
      || !sameValue(repairedState.suppressedRecipes, state.suppressedRecipes)) {
      await this.#saveState(repairedState);
    }

    const expectedProducts = CURATED_RECIPES
      .filter(entry => !repairedState.suppressedProducts.includes(entry.productId))
      .map(entry => entry.productId);
    const expectedRecipes = CURATED_RECIPES
      .filter(entry => !repairedState.suppressedRecipes.includes(entry.recipeId))
      .map(entry => entry.recipeId);

    const productsComplete = expectedProducts.every(id => presentProductIds.has(id));
    const recipesComplete = expectedRecipes.every(id => presentRecipeIds.has(id));
    if (repairedState.culinaryVersion >= CURATED_CONTENT_VERSION && productsComplete && recipesComplete) {
      return { skipped: true, reason: "current", products: expectedProducts.length, recipes: expectedRecipes.length };
    }
    return this.sync({ restore: false });
  }

  static async restoreAll() {
    if (!game.user?.isGM) throw new Error("Only a GM can restore Crafting Core Curated content.");
    if (!this.itemCreatorCompatible()) throw new Error(`Persistent Curated Food and Alcohol Products require active DnD 5e Item Creator ${ITEM_CREATOR_MIN_VERSION} or newer.`);
    const state = this.state();
    state.suppressedProducts = [];
    state.suppressedRecipes = [];
    await this.#saveState(state);
    return this.sync({ restore: true });
  }

  static async sync({ restore=false }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can synchronize Crafting Core Curated content.");
    if (!this.itemCreatorCompatible()) throw new Error(`Persistent Curated Food and Alcohol Products require active DnD 5e Item Creator ${ITEM_CREATOR_MIN_VERSION} or newer.`);

    const state = this.state();
    if (restore) {
      state.suppressedProducts = [];
      state.suppressedRecipes = [];
    }
    const materialDocs = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const products = await this.#syncProducts(state, materialDocs);
    const recipes = await this.#syncRecipes(state, materialDocs, products.documentsByProductId);
    state.culinaryVersion = CURATED_CONTENT_VERSION;
    state.productBaselines = products.baselines;
    state.recipeBaselines = recipes.baselines;
    await this.#saveState(state);
    await KnowledgeItemService.reconcilePublishedKnowledge();
    return { products, recipes };
  }

  static async saveProductIconChoice(productId, path) {
    if (!game.user?.isGM) throw new Error("Only a GM can change Curated Product presentation.");
    const entry = CURATED_BY_PRODUCT_ID.get(String(productId));
    if (!entry) throw new Error("Unknown Curated Product.");
    const state = this.state();
    const pack = this.productsPack();
    const docs = pack ? await pack.getDocuments() : [];
    const existing = docs.find(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "") === entry.productId) ?? null;
    const allowed = new Set(entry.icons.map(String));
    if (existing?.img) allowed.add(String(existing.img));
    if (state.productIcons?.[entry.productId]) allowed.add(String(state.productIcons[entry.productId]));
    if (!allowed.has(String(path))) throw new Error("Choose one of the curated icon options.");
    state.productIcons[entry.productId] = String(path);
    await this.#saveState(state);
    await this.sync({ restore: false });
    const refreshed = this.productsPack();
    const refreshedDocs = refreshed ? await refreshed.getDocuments() : [];
    return refreshedDocs.find(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "") === entry.productId) ?? null;
  }

  static async culinaryCatalogContext() {
    const state = this.state();
    const materials = await MaterialCatalogService.allEntries();
    const materialMap = new Map(materials.map(row => [row.id, row]));
    const pack = this.productsPack();
    const docs = pack ? await pack.getDocuments() : [];
    const byId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));

    const benefitLabel = entry => {
      if (entry.subcategory === "meal") {
        if (entry.mealType === "complete") return "+5 Max HP + 5 ft Speed";
        if (entry.mealType === "hearty") return "5 Temp HP";
        return "+5 ft Speed";
      }
      if (entry.subcategory === "alcoholic-drink") {
        return Object.entries(entry.abilityModifiers ?? {}).map(([ability, value]) => `${ability.toUpperCase()} ${signed(value)}`).join(" / ");
      }
      if (entry.subcategory === "non-alcoholic-drink") return `Restore ${Number(entry.healing) || 0} HP`;
      return "—";
    };

    const products = CURATED_RECIPES.map(entry => {
      const item = byId.get(entry.productId) ?? null;
      const ingredientCostCopper = entry.ingredients.reduce((total, row) => {
        const material = materialMap.get(row.materialId);
        const price = material ? { value: material.price, denomination: material.denomination } : { value: 0, denomination: "gp" };
        return total + priceToCopper(price) * row.quantity;
      }, 0);
      const yieldCount = Math.max(1, Number(entry.yield) || 1);
      const buyPrice = priceFromCopper(Math.round((ingredientCostCopper * entry.priceMultiplier) / yieldCount));
      const selectedIcon = String(state.productIcons?.[entry.productId] || item?.img || entry.icons[0]);
      const iconPaths = entry.icons.includes(selectedIcon)
        ? entry.icons.slice(0, 3)
        : [selectedIcon, ...entry.icons.filter(icon => icon !== selectedIcon)].slice(0, 3);
      return {
        ...clone(entry),
        exists: Boolean(item),
        selectedIcon,
        ingredientCostLabel: formatPrice(priceFromCopper(ingredientCostCopper)),
        priceLabel: formatPrice(item?.system?.price ?? buyPrice),
        benefitLabel: benefitLabel(entry),
        yieldLabel: `${yieldCount} serving${yieldCount === 1 ? "" : "s"}`,
        iconCandidates: iconPaths.map((icon, index) => ({ path: icon, index: index + 1, selected: icon === selectedIcon }))
      };
    });

    const cultureLabel = culture => ({
      common: "Common Cuisine",
      mundane: "Mundane",
      dwarven: "Dwarven",
      elven: "Elven",
      "cane-spirit": "Cane Spirits"
    })[culture] ?? titleCase(culture);

    const sectionSpecs = [
      { key: "meals", label: "Meals", subcategory: "meal", cultures: ["dwarven", "elven", "common"] },
      { key: "alcohol", label: "Alcoholic Drinks", subcategory: "alcoholic-drink", cultures: ["mundane", "dwarven", "elven", "cane-spirit"] },
      { key: "nonalcohol", label: "Non-Alcoholic Drinks", subcategory: "non-alcoholic-drink", cultures: ["mundane", "dwarven", "elven"] }
    ];
    const sections = sectionSpecs.map(section => {
      const sectionProducts = products.filter(row => row.subcategory === section.subcategory);
      return {
        ...section,
        count: sectionProducts.length,
        groups: section.cultures.map(culture => {
          const rows = sectionProducts.filter(row => row.culture === culture);
          return { culture, label: cultureLabel(culture), products: rows, count: rows.length };
        }).filter(group => group.count > 0)
      };
    });

    return {
      compatible: this.itemCreatorCompatible(),
      itemCreatorVersion: this.itemCreatorVersion(),
      requiredVersion: ITEM_CREATOR_MIN_VERSION,
      packExists: Boolean(pack),
      count: products.filter(row => row.exists).length,
      total: products.length,
      sections
    };
  }

  static #ingredientCost(entry, materialDocs) {
    let copper = 0;
    for (const row of entry.ingredients) {
      const item = materialDocs.get(row.materialId);
      if (!item) throw new Error(`Curated Recipe ${entry.name} is missing Material ${row.materialId}.`);
      copper += priceToCopper(item.system?.price) * row.quantity;
    }
    return copper;
  }

  static #selectedIcon(entry, state, existing=null) {
    const stored = String(state.productIcons?.[entry.productId] ?? "");
    if (entry.icons.includes(stored)) return stored;
    const current = String(existing?.img ?? "");
    if (current) return current;
    return entry.icons[0];
  }

  static #productDescription(entry) {
    const yieldCount = Math.max(1, Number(entry.yield) || 1);
    const batch = `<p><strong>Official Recipe Yield:</strong> ${yieldCount} serving${yieldCount === 1 ? "" : "s"} per craft. This Item represents one serving.</p>`;
    if (entry.subcategory === "meal") {
      const benefit = entry.mealType === "complete"
        ? "<strong>+5 Maximum Hit Points</strong> and <strong>+5 ft Walking Speed</strong>"
        : entry.mealType === "hearty"
          ? "<strong>5 Temporary Hit Points</strong>"
          : "<strong>+5 ft Walking Speed</strong>";
      return `<p>${entry.description}</p><p><strong>Meal Benefit:</strong> ${benefit}.</p><p><strong>Duration:</strong> Up to 6 hours or until the next Short Rest, whichever happens first. A Long Rest also removes the effect.</p>${batch}<p><em>Curated Food effects do not stack with another Curated Food; the newest meal replaces the previous Food family. Food and Alcohol may coexist.</em></p>`;
    }
    if (entry.subcategory === "alcoholic-drink") {
      const modifiers = Object.entries(entry.abilityModifiers ?? {}).map(([ability, value]) => `<strong>${ability.toUpperCase()} ${signed(value)}</strong>`).join(" / ");
      return `<p>${entry.description}</p><p><strong>Alcohol Effect:</strong> ${modifiers}.</p><p><strong>Duration:</strong> Up to 6 hours or until the next Short Rest, whichever happens first. A Long Rest also removes the effect.</p><p><strong>Limits:</strong> Alcohol cannot raise an Ability Score above 20 or reduce one below 1.</p>${batch}<p><em>Curated Alcohol effects do not stack with another Curated Alcohol; the newest drink replaces the previous Alcohol family. Alcohol and Food may coexist.</em></p>`;
    }
    return `<p>${entry.description}</p><p><strong>Refreshment:</strong> Restore <strong>${Math.max(0, Number(entry.healing) || 0)} Hit Points</strong> immediately, never above maximum HP.</p><p><strong>Duration:</strong> Instantaneous; no persistent effect.</p>${batch}<p><em>Official Crafting Core Curated Non-Alcoholic Drink.</em></p>`;
  }

  static #baseProductData(entry, state, existing, materialDocs, folderId) {
    const yieldCount = Math.max(1, Number(entry.yield) || 1);
    const price = priceFromCopper(Math.round((this.#ingredientCost(entry, materialDocs) * entry.priceMultiplier) / yieldCount));
    return {
      name: entry.name,
      type: "consumable",
      img: this.#selectedIcon(entry, state, existing),
      folder: folderId,
      system: {
        description: { value: this.#productDescription(entry), chat: "" },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price,
        rarity: entry.rarity,
        identified: true,
        unidentified: { description: "" },
        container: null,
        properties: [],
        type: { value: "food", subtype: "" },
        identifier: `cc-product-${entry.id}`,
        uses: { max: "1", spent: 0, recovery: [], autoDestroy: true },
        source: { revision: 1, rules: "2024" },
        activities: {}
      },
      effects: [],
      flags: {
        [MODULE_ID]: {
          [FLAGS.CURATED]: true,
          [FLAGS.CURATED_ID]: entry.id,
          [FLAGS.CURATED_KIND]: "culinary-product",
          [FLAGS.CURATED_VERSION]: CURATED_CONTENT_VERSION,
          [FLAGS.PRODUCT]: true,
          [FLAGS.PRODUCT_ID]: entry.productId,
          [FLAGS.PRODUCT_CATEGORY]: entry.category,
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.subcategory,
          [FLAGS.PRODUCT_CULTURE]: entry.culture,
          [FLAGS.PRODUCT_RARITY]: entry.rarity,
          [FLAGS.PRODUCT_MEAL_TYPE]: entry.mealType ?? "",
          [FLAGS.PRODUCT_TIER]: entry.tier ?? "",
          [FLAGS.PRODUCT_DRINK_TYPE]: entry.drinkType ?? "",
          [FLAGS.PRODUCT_EFFECT_FAMILY]: entry.effectFamily ?? "",
          [FLAGS.PRODUCT_YIELD]: yieldCount,
          [FLAGS.PRODUCT_ICON_CANDIDATES]: clone(entry.icons),
          [FLAGS.PRODUCT_MANAGED]: true
        }
      },
      ownership: { default: 0 }
    };
  }

  static #managedActivity(entry, itemData) {
    const healingAmount = Math.max(0, Number(entry.tempHp) || Number(entry.healing) || 0);
    const isHeal = healingAmount > 0;
    const ActivityClass = isHeal
      ? CONFIG.DND5E.activityTypes?.heal?.documentClass
      : CONFIG.DND5E.activityTypes?.utility?.documentClass;
    if (!ActivityClass) throw new Error(`D&D5e ${isHeal ? "Heal" : "Utility"} Activity support is unavailable.`);
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const provisional = new ItemClass(clone(itemData), { temporary: true });
    const document = new ActivityClass({}, { parent: provisional });
    const activity = cleanDocumentSource(document.toObject?.(false) ?? document);
    activity._id = stableId(`culinary-activity:${entry.productId}`);
    activity.type = isHeal ? "heal" : "utility";
    activity.name = "Consume";
    activity.activation ??= {};
    activity.activation.type = "action";
    activity.activation.value = null;
    activity.activation.override = false;
    activity.activation.condition = "";
    activity.consumption ??= {};
    activity.consumption.targets = [{ type: "itemUses", target: "", value: "1", scaling: {} }];
    activity.consumption.scaling = { allowed: false };
    activity.consumption.spellSlot = false;
    activity.target ??= {};
    activity.target.prompt = false;
    activity.target.override = false;
    activity.target.affects ??= {};
    activity.target.affects.choice = false;
    activity.target.affects.count = "1";
    activity.target.affects.type = "self";
    activity.range ??= {};
    activity.range.override = false;
    activity.range.units = "self";
    activity.flags ??= {};
    if (entry.effectFamily) activity.flags[ITEM_CREATOR_ID] = { ...(activity.flags[ITEM_CREATOR_ID] ?? {}), consumableUse: true };
    if (isHeal) {
      activity.healing ??= {};
      activity.healing.number = 0;
      activity.healing.denomination = 0;
      activity.healing.bonus = String(healingAmount);
      activity.healing.types = [Number(entry.tempHp) > 0 ? "temphp" : "healing"];
      activity.healing.custom = { enabled: false };
      activity.healing.scaling = { number: 1 };
    }
    return activity;
  }

  static #persistentBlueprint(entry) {
    if (!entry.effectFamily) return null;
    const changes = [];
    const add = CONST.ACTIVE_EFFECT_MODES.ADD;
    const downgrade = CONST.ACTIVE_EFFECT_MODES.DOWNGRADE ?? 3;
    const upgrade = CONST.ACTIVE_EFFECT_MODES.UPGRADE ?? 4;

    if (entry.effectFamily === "food") {
      if (Number(entry.maximumHpBonus) > 0) changes.push({
        key: "system.attributes.hp.bonuses.overall", mode: add, value: String(entry.maximumHpBonus), priority: 20
      });
      if (Number(entry.movementBonus) > 0) changes.push({
        key: "system.attributes.movement.walk", mode: add, value: String(entry.movementBonus), priority: 20
      });
    } else if (entry.effectFamily === "alcohol") {
      for (const [ability, raw] of Object.entries(entry.abilityModifiers ?? {})) {
        const value = Number(raw) || 0;
        if (!value) continue;
        changes.push({ key: `system.abilities.${ability}.value`, mode: add, value: String(value), priority: 20 });
        if (value > 0) changes.push({ key: `system.abilities.${ability}.value`, mode: downgrade, value: "20", priority: 30 });
        if (value < 0) changes.push({ key: `system.abilities.${ability}.value`, mode: upgrade, value: "1", priority: 40 });
      }
    }

    return {
      _id: stableId(`culinary-effect:${entry.productId}`),
      type: "base",
      name: entry.effectFamily === "food" ? "Item Creator — Food Benefit" : "Item Creator — Alcohol Effect",
      img: ACTIVE_EFFECT_ICON,
      description: entry.effectFamily === "food"
        ? `Curated Food benefit from ${entry.name}.`
        : `Curated Alcohol modifiers from ${entry.name}.`,
      disabled: false,
      transfer: false,
      statuses: [],
      changes,
      flags: {
        [ITEM_CREATOR_ID]: {
          blueprint: true,
          key: entry.effectFamily === "food" ? "curatedFoodBenefit" : "curatedAlcoholEffect",
          availability: "consumableUse",
          unlockOnLevel: false,
          unlockLevel: 1,
          progressionGroupId: entry.effectFamily === "food" ? "effect:curatedFood" : "effect:curatedAlcohol",
          progressionTierId: "base",
          progressionTierOrder: 0,
          consumableBlueprint: true
        }
      }
    };
  }

  static #itemCreatorFlags(entry) {
    if (!entry.effectFamily) return null;
    const config = {
      activation: "action",
      reactionTrigger: "",
      durationMode: "hours",
      durationValue: 6,
      stacking: "replace",
      removeExhaustion: false,
      removeExhaustionAmount: "1"
    };
    const runtimeKey = entry.effectFamily === "food" ? FOOD_RUNTIME_KEY : ALCOHOL_RUNTIME_KEY;
    return {
      created: true,
      schemaVersion: ITEM_CREATOR_SCHEMA_VERSION,
      moduleVersion: ITEM_CREATOR_MIN_VERSION,
      itemType: "consumable",
      templateUuid: null,
      baseConsumableUuid: null,
      editedFromUuid: null,
      importedItem: false,
      runtime: {
        consumable: {
          key: runtimeKey,
          config: clone(config)
        }
      },
      draft: {
        customized: {},
        overrides: {},
        consumableConfig: clone(config),
        grantedEffects: {},
        grantedEffectValues: {},
        customImportedEffects: [],
        importedBaseSummary: [],
        descriptionCustomized: true
      }
    };
  }

  static #buildProductData(entry, state, existing, materialDocs, folderId) {
    const data = this.#baseProductData(entry, state, existing, materialDocs, folderId);
    const activity = this.#managedActivity(entry, data);
    data.system.activities = { [activity._id]: activity };
    const effect = this.#persistentBlueprint(entry);
    data.effects = effect ? [effect] : [];
    const itemCreatorFlags = this.#itemCreatorFlags(entry);
    if (itemCreatorFlags) data.flags[ITEM_CREATOR_ID] = itemCreatorFlags;
    this.#validateItemSource(data, `Curated Product ${entry.name}`);
    return data;
  }

  static #validateItemSource(data, label) {
    try {
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      const itemData = clone(data);
      const effects = clone(itemData.effects ?? []);
      itemData.effects = [];
      const provisional = new ItemClass(itemData, { temporary: true });
      const ActiveEffectClass = CONFIG.ActiveEffect?.documentClass ?? globalThis.ActiveEffect?.implementation ?? globalThis.ActiveEffect;
      if (ActiveEffectClass) {
        for (const effect of effects) new ActiveEffectClass(effect, { parent: provisional });
      }
      return true;
    } catch (error) {
      console.error(`${MODULE_ID} | ${label} failed D&D5e schema validation before persistence.`, error, data);
      throw new Error(`${label} failed D&D5e schema validation. See the console for details.`);
    }
  }

  static async #replaceActivities(item, activities) {
    const currentIds = valuesOf(item.system?.activities).map(activity => activity?.id ?? activity?._id).filter(Boolean);
    if (currentIds.length) {
      const deletions = {};
      for (const id of currentIds) deletions[`system.activities.-=${id}`] = null;
      await item.update(deletions, { render: false });
    }
    if (activities && Object.keys(activities).length) await item.update({ "system.activities": clone(activities) }, { render: false });
  }

  static async #replaceEffects(item, effects) {
    const ids = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
    if (ids.length) await item.deleteEmbeddedDocuments("ActiveEffect", ids, { render: false });
    if (effects?.length) await item.createEmbeddedDocuments("ActiveEffect", clone(effects), { keepId: true, render: false });
  }

  static async #createProductDocument(pack, source) {
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const core = clone(source);
    const effects = clone(core.effects ?? []);
    delete core.effects;
    const [created] = await ItemClass.createDocuments([core], { pack: pack.collection });
    if (!created) throw new Error(`D&D5e did not create Curated Product ${source.name}.`);
    if (effects.length) await created.createEmbeddedDocuments("ActiveEffect", effects, { keepId: true, render: false });
    return created;
  }

  static async #updateProductDocument(item, source) {
    const data = clone(source);
    const desiredEffects = clone(data.effects ?? []);
    const desiredActivities = clone(data.system?.activities ?? {});
    delete data.effects;
    if (data.system) delete data.system.activities;
    delete data._id;
    delete data.ownership;

    // Mirror Item Creator v0.7.1's safe update strategy: effects are replaced as
    // embedded documents instead of riding through the parent Item update. This
    // also repairs experimental v0.2.x Products whose serialized effect duration
    // contained a D&D5e-invalid null value.
    const existingEffectIds = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
    if (existingEffectIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", existingEffectIds, { render: false });
    await item.update(data, { render: false });
    await this.#replaceActivities(item, desiredActivities);
    if (desiredEffects.length) await item.createEmbeddedDocuments("ActiveEffect", desiredEffects, { keepId: true, render: false });
    return item;
  }

  static async #syncProducts(state, materialDocs) {
    const pack = await this.ensureProductsPack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#productFolders());
      let docs = await pack.getDocuments();
      const byId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      const suppressed = new Set(state.suppressedProducts);
      const baselines = {};
      let created = 0;
      let updated = 0;
      let repairedLegacyEffects = 0;

      for (const entry of CURATED_RECIPES) {
        if (suppressed.has(entry.productId)) continue;
        const existing = byId.get(entry.productId) ?? null;
        const folder = folders.get(this.#productFolderKey(entry)) ?? folders.get("culinary") ?? null;
        const official = this.#buildProductData(entry, state, existing, materialDocs, folder?.id ?? null);
        baselines[entry.productId] = editableProductSnapshot(official);
        if (!existing) {
          const item = await this.#createProductDocument(pack, official);
          byId.set(entry.productId, item);
          created += 1;
          continue;
        }

        const merged = mergeProductPresentation(existing.toObject(false), official, state.productBaselines?.[entry.productId], entry);
        merged.folder = folder?.id ?? null;
        this.#validateItemSource(merged, `Curated Product ${entry.name}`);
        const hadLegacyNullDuration = [...(existing.effects ?? [])].some(effect => effect.duration?.value === null);
        await this.#updateProductDocument(existing, merged);
        if (hadLegacyNullDuration) repairedLegacyEffects += 1;
        updated += 1;
      }

      docs = await pack.getDocuments();
      await pack.getIndex({ fields: ["name", "img", "type", "folder", "system.price", `flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`] });
      const documentsByProductId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      return {
        pack,
        created,
        updated,
        repairedLegacyEffects,
        foldersRepaired: 0,
        total: documentsByProductId.size,
        documentsByProductId,
        baselines
      };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static #recipeSnapshot(entry, materialDocs, product) {
    const ingredients = entry.ingredients.map(row => {
      const item = materialDocs.get(row.materialId);
      if (!item) throw new Error(`Curated Recipe ${entry.name} is missing Material ${row.materialId}.`);
      return {
        uuid: item.uuid,
        sourceUuid: item.uuid,
        name: item.name,
        img: item.img,
        type: item.type,
        identifier: String(item.system?.identifier ?? ""),
        quantity: row.quantity
      };
    });
    return RecipeService.snapshot({
      id: entry.recipeId,
      name: entry.name,
      img: product.img,
      description: entry.description,
      craftingMode: "timed",
      craftingTime: entry.craftingTime,
      craftingResolution: {
        proficiencies: [],
        proficiencyMatch: "any",
        attemptPolicy: "anyone",
        proficientPolicy: "rollNormally",
        check: { required: false, type: "skill", id: "", dc: 10 },
        failure: { mode: "failProject", regressBy: 1, loseMaterials: false, lossPercent: 0 }
      },
      learning: { access: "anyone" },
      ingredients,
      result: {
        uuid: product.uuid,
        sourceUuid: product.uuid,
        name: product.name,
        img: product.img,
        type: product.type,
        identifier: String(product.system?.identifier ?? ""),
        quantity: Math.max(1, Number(entry.yield) || 1),
        snapshot: product.toObject(false)
      },
      knowledge: {
        label: "Recipe",
        name: `Recipe — ${entry.name}`,
        img: KNOWLEDGE_ICONS.Recipe
      },
      publication: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  static async #updateKnowledgeDocument(item, source) {
    const data = clone(source);
    const desiredActivities = clone(data.system?.activities ?? {});
    if (data.system) delete data.system.activities;
    delete data._id;
    delete data.ownership;
    await item.update(data, { render: false });
    const currentIds = valuesOf(item.system?.activities).map(activity => activity?.id ?? activity?._id).filter(Boolean);
    if (currentIds.length) {
      const deletions = {};
      for (const id of currentIds) deletions[`system.activities.-=${id}`] = null;
      await item.update(deletions, { render: false });
    }
    if (Object.keys(desiredActivities).length) await item.update({ "system.activities": desiredActivities }, { render: false });
    return item;
  }

  static async #syncRecipes(state, materialDocs, productDocs) {
    const pack = await KnowledgeItemService.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#knowledgeFolders());
      let docs = await pack.getDocuments();
      const byRecipeId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item]).filter(([id]) => id));
      const suppressed = new Set(state.suppressedRecipes);
      const baselines = {};
      let created = 0;
      let updated = 0;
      const folderRepairIds = new Set();

      for (const entry of CURATED_RECIPES) {
        if (suppressed.has(entry.recipeId)) continue;
        const product = productDocs.get(entry.productId);
        if (!product) continue;
        const existing = byRecipeId.get(entry.recipeId) ?? null;
        const officialRecipe = this.#recipeSnapshot(entry, materialDocs, product);
        const expectedIngredientNames = entry.ingredients.map(row => materialDocs.get(row.materialId)?.name ?? "");
        const currentRecipe = existing?.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT) ?? null;
        const recipe = existing
          ? mergeRecipeDefinition(currentRecipe, officialRecipe, state.recipeBaselines?.[entry.recipeId], entry, expectedIngredientNames)
          : officialRecipe;
        if (existing) {
          recipe.publication = {
            uuid: existing.uuid,
            pack: pack.collection,
            sourceType: "Recipe",
            publishedAt: Number(existing.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(),
            updatedAt: Date.now()
          };
        }
        baselines[entry.recipeId] = normalizedRecipeBaseline(officialRecipe);
        const folder = folders.get(this.#knowledgeFolderKey(entry)) ?? folders.get("curated") ?? null;
        const targetFolderId = String(folder?.id ?? "");
        const currentFolderId = String(existing?.folder?.id ?? existing?.folder ?? "");
        if (existing && currentFolderId !== targetFolderId) folderRepairIds.add(entry.recipeId);
        const data = KnowledgeItemService.knowledgeItemData(recipe, { folderId: folder?.id ?? null, published: true });
        data.img = KNOWLEDGE_ICONS.Recipe;
        data.flags[MODULE_ID] = {
          ...(data.flags[MODULE_ID] ?? {}),
          [FLAGS.CURATED]: true,
          [FLAGS.CURATED_ID]: entry.id,
          [FLAGS.CURATED_KIND]: "culinary-recipe",
          [FLAGS.CURATED_VERSION]: CURATED_CONTENT_VERSION,
          [FLAGS.PRODUCT_ID]: entry.productId,
          [FLAGS.PRODUCT_CATEGORY]: entry.category,
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.subcategory,
          [FLAGS.PRODUCT_CULTURE]: entry.culture,
          [FLAGS.PRODUCT_RARITY]: entry.rarity,
          [FLAGS.PRODUCT_MEAL_TYPE]: entry.mealType ?? "",
          [FLAGS.PRODUCT_TIER]: entry.tier ?? "",
          [FLAGS.PRODUCT_DRINK_TYPE]: entry.drinkType ?? "",
          [FLAGS.PRODUCT_EFFECT_FAMILY]: entry.effectFamily ?? "",
          [FLAGS.PRODUCT_YIELD]: Math.max(1, Number(entry.yield) || 1)
        };
        preserveExternalFlags(existing?.toObject(false), data);
        this.#validateItemSource(data, `Curated Learn Source ${entry.name}`);
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        if (!existing) {
          const [createdItem] = await ItemClass.createDocuments([data], { pack: pack.collection });
          if (!createdItem) throw new Error(`D&D5e did not create Curated Learn Source ${entry.name}.`);
          byRecipeId.set(entry.recipeId, createdItem);
          created += 1;
        } else {
          await this.#updateKnowledgeDocument(existing, data);
          updated += 1;
        }
      }

      docs = await pack.getDocuments();
      let documentsByRecipeId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item]).filter(([id]) => id));

      // Verify the persisted post-condition from the Compendium itself. Draft state is never
      // authoritative for Curated publication, and folder placement is repaired even when the
      // documents already existed before this version.
      for (const entry of CURATED_RECIPES) {
        if (suppressed.has(entry.recipeId)) continue;
        const item = documentsByRecipeId.get(entry.recipeId);
        if (!item) throw new Error(`Curated Learn Source ${entry.name} was not persisted in Crafting Core — Learn Sources.`);
        const folder = folders.get(this.#knowledgeFolderKey(entry)) ?? folders.get("curated") ?? null;
        const targetFolderId = String(folder?.id ?? "");
        const persistedFolderId = String(item.folder?.id ?? item.folder ?? "");
        if (persistedFolderId !== targetFolderId) {
          await item.update({ folder: folder?.id ?? null }, { render: false });
          folderRepairIds.add(entry.recipeId);
        }
      }

      docs = await pack.getDocuments();
      documentsByRecipeId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item]).filter(([id]) => id));
      await pack.getIndex({ fields: ["name", "img", "type", "folder", `flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_ID}`] });
      return {
        pack,
        created,
        updated,
        foldersRepaired: folderRepairIds.size,
        total: documentsByRecipeId.size,
        documentsByRecipeId,
        baselines
      };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}
