import { FLAGS, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { CURATED_CULINARY_RECIPES, CURATED_CULINARY_VERSION } from "../data/curated-culinary-catalog.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { RecipeService } from "./recipe-service.mjs";

const ITEM_CREATOR_ID = "dnd5e-item-creator";
const ITEM_CREATOR_SCHEMA_VERSION = 17;
const ITEM_CREATOR_CONTRACT_VERSION = "0.7.1";

function deepClone(value) {
  return foundry.utils.deepClone(value);
}

function stableDocumentId(seed) {
  const text = String(seed ?? "");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0").slice(0, 16);
}

function cleanDocumentSource(source) {
  const clone = deepClone(source ?? {});
  for (const key of ["_id", "folder", "sort", "ownership", "_stats", "pack"]) delete clone[key];
  return clone;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
}

function fingerprint(value) {
  return stableDocumentId(JSON.stringify(canonicalize(value)));
}

function productFingerprint(source) {
  const data = cleanDocumentSource(source);
  return fingerprint({
    name: data.name,
    type: data.type,
    img: data.img,
    system: data.system,
    effects: data.effects,
    itemCreator: data.flags?.[ITEM_CREATOR_ID] ?? null
  });
}

function knowledgeFingerprint(source) {
  const data = cleanDocumentSource(source);
  return fingerprint({
    name: data.name,
    type: data.type,
    img: data.img,
    system: data.system,
    recipeSnapshot: data.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT] ?? null
  });
}

export class CuratedContentService {
  static PRODUCTS_PACK_NAME = "crafting-core-products";
  static PRODUCTS_PACK_LABEL = "Crafting Core — Products";
  static PRODUCTS_PACK_ID = `world.${this.PRODUCTS_PACK_NAME}`;

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE, {
      name: "Crafting Core Curated Content State",
      scope: "world",
      config: false,
      type: Object,
      default: {
        culinaryVersion: 0,
        suppressedProducts: [],
        suppressedRecipes: []
      }
    });
  }

  static state() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE);
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    return {
      culinaryVersion: Math.max(0, Number(source.culinaryVersion) || 0),
      suppressedProducts: [...new Set((source.suppressedProducts ?? []).map(String).filter(Boolean))],
      suppressedRecipes: [...new Set((source.suppressedRecipes ?? []).map(String).filter(Boolean))]
    };
  }

  static async #saveState(state) {
    await game.settings.set(MODULE_ID, SETTINGS.CURATED_CONTENT_STATE, {
      culinaryVersion: Math.max(0, Number(state.culinaryVersion) || 0),
      suppressedProducts: [...new Set((state.suppressedProducts ?? []).map(String).filter(Boolean))],
      suppressedRecipes: [...new Set((state.suppressedRecipes ?? []).map(String).filter(Boolean))]
    });
  }

  static itemCreatorActive() {
    return Boolean(game.modules?.get?.(ITEM_CREATOR_ID)?.active);
  }

  static itemCreatorVersion() {
    return String(game.modules?.get?.(ITEM_CREATOR_ID)?.version ?? "");
  }

  static itemCreatorCompatible() {
    if (!this.itemCreatorActive()) return false;
    const current = this.itemCreatorVersion();
    const parse = value => String(value ?? "").split(/[+-]/)[0].split(".").map(part => Number.parseInt(part, 10) || 0);
    const left = parse(current);
    const right = parse(ITEM_CREATOR_CONTRACT_VERSION);
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      const a = left[i] ?? 0;
      const b = right[i] ?? 0;
      if (a !== b) return a > b;
    }
    return true;
  }

  static productsPack() {
    return CompendiumService.findWorldPack(this.PRODUCTS_PACK_NAME);
  }

  static async ensureProductsPack() {
    const pack = await CompendiumService.ensureWorldItemPack({
      name: this.PRODUCTS_PACK_NAME,
      label: this.PRODUCTS_PACK_LABEL
    });
    await CompendiumService.ensurePackFolders(pack, this.#productFolderDefinitions());
    return pack;
  }

  static #productFolderDefinitions() {
    return [
      { key: "culinary", name: "Culinary" },
      { key: "culinary:dwarven", name: "Dwarven Cuisine", parent: "culinary" },
      { key: "culinary:elven", name: "Elven Cuisine", parent: "culinary" },
      { key: "culinary:common", name: "Common Cuisine", parent: "culinary" }
    ];
  }

  static #knowledgeFolderDefinitions() {
    return [
      { key: "Recipe", name: "Recipe" },
      { key: "Recipe:curated", name: "Crafting Core Curated", parent: "Recipe" },
      { key: "Recipe:curated:culinary", name: "Culinary", parent: "Recipe:curated" },
      { key: "Recipe:curated:culinary:dwarven", name: "Dwarven Cuisine", parent: "Recipe:curated:culinary" },
      { key: "Recipe:curated:culinary:elven", name: "Elven Cuisine", parent: "Recipe:curated:culinary" },
      { key: "Recipe:curated:culinary:common", name: "Common Cuisine", parent: "Recipe:curated:culinary" }
    ];
  }

  static async syncIfNeeded() {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };
    if (!this.itemCreatorActive()) return { skipped: true, reason: "item-creator-inactive" };
    if (!this.itemCreatorCompatible()) return { skipped: true, reason: "item-creator-too-old", version: this.itemCreatorVersion() };
    const state = this.state();
    const productsMissing = !this.productsPack();
    const learnSourcesMissing = !KnowledgeItemService.pack();
    if (state.culinaryVersion >= CURATED_CULINARY_VERSION && !productsMissing && !learnSourcesMissing) {
      return { skipped: true, reason: "current" };
    }
    return this.sync();
  }

  static async sync({ restoreProducts=[], restoreRecipes=[] }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can synchronize Crafting Core Curated content.");
    if (!this.itemCreatorActive()) throw new Error("DnD 5e Item Creator must be active to install the Curated Culinary library.");
    if (!this.itemCreatorCompatible()) throw new Error(`DnD 5e Item Creator ${ITEM_CREATOR_CONTRACT_VERSION} or newer is required for the Curated Culinary library.`);

    const state = this.state();
    const restoreProductSet = new Set(restoreProducts.map(String));
    const restoreRecipeSet = new Set(restoreRecipes.map(String));
    state.suppressedProducts = state.suppressedProducts.filter(id => !restoreProductSet.has(id));
    state.suppressedRecipes = state.suppressedRecipes.filter(id => !restoreRecipeSet.has(id));

    const materialDocs = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const missingMaterials = [...new Set(CURATED_CULINARY_RECIPES.flatMap(entry => entry.ingredients.map(i => i.materialId)))]
      .filter(id => !materialDocs.has(id));
    if (missingMaterials.length) throw new Error(`Curated Culinary materials are missing: ${missingMaterials.join(", ")}`);

    const productResult = await this.#syncProducts(state);
    const recipeResult = await this.#syncRecipes(state, materialDocs, productResult.documentsByProductId);
    state.culinaryVersion = CURATED_CULINARY_VERSION;
    await this.#saveState(state);

    const reconciliation = await KnowledgeItemService.reconcilePublishedKnowledge();
    Hooks.callAll(`${MODULE_ID}.curatedContentChanged`, {
      culinaryVersion: CURATED_CULINARY_VERSION,
      products: productResult,
      recipes: recipeResult
    });
    return { products: productResult, recipes: recipeResult, reconciliation, state };
  }

  static async restoreAll() {
    const state = this.state();
    return this.sync({
      restoreProducts: [...state.suppressedProducts],
      restoreRecipes: [...state.suppressedRecipes]
    });
  }

  static async restoreProduct(productId) {
    return this.sync({ restoreProducts: [String(productId)] });
  }

  static async restoreRecipe(recipeId) {
    return this.sync({ restoreRecipes: [String(recipeId)] });
  }

  static async #syncProducts(state) {
    const pack = await this.ensureProductsPack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#productFolderDefinitions());
      const docs = await pack.getDocuments();
      const byProductId = new Map(docs
        .filter(item => item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED))
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item])
        .filter(([id]) => id));
      const suppressed = new Set(state.suppressedProducts);
      const creates = [];
      const updates = [];
      const touchedProductIds = new Set();
      for (const entry of CURATED_CULINARY_RECIPES) {
        if (suppressed.has(entry.productId)) continue;
        const folder = folders.get(`culinary:${entry.culture}`) ?? folders.get("culinary") ?? null;
        const data = this.#productItemData(entry, folder?.id ?? null);
        const existing = byProductId.get(entry.productId);
        if (!existing) {
          creates.push(data);
          touchedProductIds.add(entry.productId);
        } else {
          const baseline = String(existing.getFlag(MODULE_ID, FLAGS.CURATED_BASELINE_FINGERPRINT) ?? "");
          const currentFingerprint = productFingerprint(existing.toObject?.(false) ?? existing);
          if (baseline && currentFingerprint !== baseline) continue; // Preserve explicit GM customization.
          updates.push({ _id: existing.id, ...data });
          touchedProductIds.add(entry.productId);
        }
      }

      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      if (creates.length) await ItemClass.createDocuments(creates, { pack: pack.collection });
      if (updates.length) await ItemClass.updateDocuments(updates, { pack: pack.collection });
      const refreshed = await pack.getDocuments();
      const documentsByProductId = new Map(refreshed
        .filter(item => item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED))
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item])
        .filter(([id]) => id));
      const baselineUpdates = [...touchedProductIds].map(productId => {
        const item = documentsByProductId.get(productId);
        if (!item) return null;
        return { _id: item.id, [`flags.${MODULE_ID}.${FLAGS.CURATED_BASELINE_FINGERPRINT}`]: productFingerprint(item.toObject?.(false) ?? item) };
      }).filter(Boolean);
      if (baselineUpdates.length) await ItemClass.updateDocuments(baselineUpdates, { pack: pack.collection });
      await pack.getIndex({ fields: ["name", "img", "type", "folder", "system.rarity", `flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`] });
      return { pack, created: creates.length, updated: updates.length, total: documentsByProductId.size, documentsByProductId };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #syncRecipes(state, materialDocs, productDocs) {
    const pack = await KnowledgeItemService.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#knowledgeFolderDefinitions());
      const docs = await pack.getDocuments();
      const byRecipeId = new Map(docs
        .filter(item => item.getFlag(MODULE_ID, FLAGS.CURATED) && item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "culinary-recipe")
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item])
        .filter(([id]) => id));
      const suppressed = new Set(state.suppressedRecipes);
      const creates = [];
      const updates = [];
      const touchedRecipeIds = new Set();
      for (const entry of CURATED_CULINARY_RECIPES) {
        if (suppressed.has(entry.recipeId)) continue;
        const product = productDocs.get(entry.productId);
        if (!product) continue; // Without a materialized Product, do not create/update the official Recipe artifact.
        const recipe = this.#recipeSnapshot(entry, materialDocs, product);
        const folder = folders.get(`Recipe:curated:culinary:${entry.culture}`) ?? folders.get("Recipe") ?? null;
        const data = KnowledgeItemService.knowledgeItemData(recipe, { folderId: folder?.id ?? null, published: true });
        data.img = KNOWLEDGE_ICONS.Recipe;
        data.flags[MODULE_ID] = {
          ...(data.flags[MODULE_ID] ?? {}),
          [FLAGS.CURATED]: true,
          [FLAGS.CURATED_ID]: entry.id,
          [FLAGS.CURATED_KIND]: "culinary-recipe",
          [FLAGS.CURATED_VERSION]: CURATED_CULINARY_VERSION,
          [FLAGS.PRODUCT_ID]: entry.productId,
          [FLAGS.PRODUCT_CATEGORY]: entry.category,
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.subcategory,
          [FLAGS.PRODUCT_CULTURE]: entry.culture,
          [FLAGS.PRODUCT_RARITY]: entry.rarity,
          [FLAGS.PRODUCT_MEAL_TYPE]: entry.mealType
        };
        const existing = byRecipeId.get(entry.recipeId);
        if (!existing) {
          creates.push(data);
          touchedRecipeIds.add(entry.recipeId);
        } else {
          const baseline = String(existing.getFlag(MODULE_ID, FLAGS.CURATED_BASELINE_FINGERPRINT) ?? "");
          const currentFingerprint = knowledgeFingerprint(existing.toObject?.(false) ?? existing);
          if (baseline && currentFingerprint !== baseline) continue; // Preserve explicit GM customization.
          updates.push({ _id: existing.id, ...data });
          touchedRecipeIds.add(entry.recipeId);
        }
      }
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      if (creates.length) await ItemClass.createDocuments(creates, { pack: pack.collection });
      if (updates.length) await ItemClass.updateDocuments(updates, { pack: pack.collection });
      const refreshed = await pack.getDocuments();
      const refreshedByRecipeId = new Map(refreshed
        .filter(item => item.getFlag(MODULE_ID, FLAGS.CURATED) && item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "culinary-recipe")
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item])
        .filter(([id]) => id));
      const baselineUpdates = [...touchedRecipeIds].map(recipeId => {
        const item = refreshedByRecipeId.get(recipeId);
        if (!item) return null;
        return { _id: item.id, [`flags.${MODULE_ID}.${FLAGS.CURATED_BASELINE_FINGERPRINT}`]: knowledgeFingerprint(item.toObject?.(false) ?? item) };
      }).filter(Boolean);
      if (baselineUpdates.length) await ItemClass.updateDocuments(baselineUpdates, { pack: pack.collection });
      await pack.getIndex({ fields: ["name", "img", "type", "folder", "system.rarity", `flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_ID}`] });
      return { pack, created: creates.length, updated: updates.length, total: refreshedByRecipeId.size };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static #recipeSnapshot(entry, materialDocs, product) {
    const ingredients = entry.ingredients.map(row => {
      const item = materialDocs.get(row.materialId);
      return RecipeService.itemReference(item, row.quantity);
    });
    const result = RecipeService.itemReference(product, 1, { snapshot: true });
    return RecipeService.normalize({
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
      result,
      knowledge: { label: "Recipe", name: `Recipe — ${entry.name}`, img: KNOWLEDGE_ICONS.Recipe },
      publication: null,
      playerVisibility: {}
    });
  }

  static #productItemData(entry, folderId=null) {
    const activityId = stableDocumentId(`activity:${entry.productId}`);
    const effectId = stableDocumentId(`effect:${entry.productId}:movement`);
    const itemData = {
      name: entry.name,
      type: "consumable",
      img: entry.icons[0],
      folder: folderId,
      system: {
        description: {
          value: this.#productDescription(entry),
          chat: ""
        },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price: deepClone(entry.price),
        rarity: entry.rarity,
        identified: true,
        unidentified: { description: "" },
        container: null,
        properties: [],
        type: { value: "food", subtype: "" },
        identifier: `cc-product-${entry.id}`,
        uses: { max: "1", spent: 0, recovery: [], autoDestroy: true },
        attunement: "",
        attuned: false,
        equipped: false,
        activities: {}
      },
      effects: [],
      flags: {
        [MODULE_ID]: {
          [FLAGS.CURATED]: true,
          [FLAGS.CURATED_ID]: entry.id,
          [FLAGS.CURATED_KIND]: "culinary-product",
          [FLAGS.CURATED_VERSION]: CURATED_CULINARY_VERSION,
          [FLAGS.PRODUCT]: true,
          [FLAGS.PRODUCT_ID]: entry.productId,
          [FLAGS.PRODUCT_CATEGORY]: entry.category,
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.subcategory,
          [FLAGS.PRODUCT_CULTURE]: entry.culture,
          [FLAGS.PRODUCT_RARITY]: entry.rarity,
          [FLAGS.PRODUCT_MEAL_TYPE]: entry.mealType,
          [FLAGS.PRODUCT_ICON_CANDIDATES]: entry.icons,
          [FLAGS.PRODUCT_MANAGED]: true
        }
      },
      ownership: { default: 0 }
    };

    itemData.system.activities[activityId] = this.#consumeActivityData(itemData, entry, activityId);
    if (entry.movementBonus) itemData.effects.push(this.#movementBlueprint(entry, effectId));

    const movementEnabled = Boolean(entry.movementBonus);
    const runtimeKey = movementEnabled ? "crafting-core:culinary:movement-benefit" : `crafting-core:culinary:${entry.id}`;
    const consumableConfig = {
      activation: "action",
      reactionTrigger: "",
      durationMode: "longRest",
      durationValue: 1,
      stacking: "replace",
      removeExhaustion: false,
      removeExhaustionAmount: "1"
    };
    itemData.flags[ITEM_CREATOR_ID] = {
      created: true,
      schemaVersion: ITEM_CREATOR_SCHEMA_VERSION,
      moduleVersion: ITEM_CREATOR_CONTRACT_VERSION,
      itemType: "consumable",
      templateUuid: null,
      baseConsumableUuid: null,
      editedFromUuid: null,
      importedItem: false,
      runtime: {
        consumable: {
          key: runtimeKey,
          config: consumableConfig
        }
      },
      draft: {
        customized: {},
        overrides: {},
        consumableConfig,
        grantedEffects: movementEnabled ? { movementBonus: true } : {},
        grantedEffectValues: movementEnabled ? {
          movementBonus: {
            entries: [{ type: "walk", bonus: entry.movementBonus, units: "ft" }],
            availability: "consumableUse",
            unlockOnLevel: false,
            unlockLevel: 1,
            progressionGroupId: "effect:movementBonus"
          }
        } : {},
        customImportedEffects: [],
        customImportedActivities: [],
        importedBaseSummary: [],
        descriptionCustomized: true
      }
    };
    return itemData;
  }

  static #consumeActivityData(itemData, entry, activityId) {
    const ItemClass = Item.implementation ?? CONFIG.Item.documentClass;
    const ActivityClass = entry.tempHp
      ? CONFIG.DND5E.activityTypes?.heal?.documentClass
      : CONFIG.DND5E.activityTypes?.utility?.documentClass;
    if (!ItemClass || !ActivityClass) throw new Error("D&D5e activity support is unavailable for Curated Culinary Products.");
    const provisionalSource = cleanDocumentSource(itemData);
    const provisionalItem = new ItemClass(provisionalSource, { temporary: true });
    const activityDocument = new ActivityClass({}, { parent: provisionalItem });
    const activity = cleanDocumentSource(activityDocument.toObject?.() ?? activityDocument);
    activity._id = activityId;
    activity.type = entry.tempHp ? "heal" : "utility";
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
    if (entry.tempHp) {
      // Keep the D&D5e 5.3.3 Heal Activity's native source shape and only
      // change the fields that define this meal's deterministic Temp HP heal.
      activity.healing ??= {};
      activity.healing.number = 0;
      activity.healing.denomination = 0;
      activity.healing.bonus = String(entry.tempHp);
      activity.healing.types = ["temp"];
    } else {
      activity.roll ??= { formula: "", name: "", prompt: false, visible: false };
    }
    activity.flags ??= {};
    activity.flags[ITEM_CREATOR_ID] = {
      ...(activity.flags[ITEM_CREATOR_ID] ?? {}),
      consumableUse: true
    };
    return activity;
  }

  static #movementBlueprint(entry, effectId) {
    const addMode = CONST.ACTIVE_EFFECT_MODES?.ADD ?? 2;
    return {
      _id: effectId,
      type: "base",
      name: "Item Creator — Movement Bonus",
      img: "systems/dnd5e/icons/svg/documents/active-effect.svg",
      description: `Culinary movement benefit from ${entry.name}.`,
      disabled: false,
      transfer: false,
      statuses: [],
      changes: [{ key: "system.attributes.movement.walk", mode: addMode, value: String(entry.movementBonus) }],
      flags: {
        [ITEM_CREATOR_ID]: {
          blueprint: true,
          key: "movementBonus",
          availability: "consumableUse",
          unlockOnLevel: false,
          unlockLevel: 1,
          progressionGroupId: "effect:movementBonus",
          progressionTierId: "base",
          progressionTierOrder: 0,
          consumableBlueprint: true
        }
      }
    };
  }

  static #productDescription(entry) {
    const benefits = [];
    if (entry.tempHp) benefits.push(`<strong>${entry.tempHp} Temporary Hit Points</strong>`);
    if (entry.movementBonus) benefits.push(`<strong>+${entry.movementBonus} ft Walking Speed</strong>`);
    return [
      `<p>${foundry.utils.escapeHTML(entry.description)}</p>`,
      `<p><strong>Meal Benefit:</strong> ${benefits.join(" and ")}.</p>`,
      `<p><strong>Duration:</strong> Until the next Long Rest.</p>`,
      `<p><em>Official Crafting Core Curated Culinary Product. Automated persistent meal effects are managed by DnD 5e Item Creator.</em></p>`
    ].join("");
  }

  static installHooks() {
    Hooks.on("deleteItem", item => {
      if (!game.user?.isGM || !item?.getFlag?.(MODULE_ID, FLAGS.CURATED)) return;
      const state = this.state();
      let changed = false;
      if (item.pack === this.PRODUCTS_PACK_ID && item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "culinary-product") {
        const id = String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
        if (id && !state.suppressedProducts.includes(id)) {
          state.suppressedProducts.push(id);
          changed = true;
        }
      }
      if (item.pack === KnowledgeItemService.PACK_ID && item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "culinary-recipe") {
        const id = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
        if (id && !state.suppressedRecipes.includes(id)) {
          state.suppressedRecipes.push(id);
          changed = true;
        }
      }
      if (changed) void this.#saveState(state).catch(error => console.warn(`${MODULE_ID} | Could not remember Curated content removal.`, error));
    });
  }

  static supplierCatalog() {
    return CURATED_CULINARY_RECIPES.map(entry => ({
      productId: entry.productId,
      recipeId: entry.recipeId,
      name: entry.name,
      category: entry.category,
      subcategory: entry.subcategory,
      culture: entry.culture,
      rarity: entry.rarity,
      mealType: entry.mealType,
      tempHp: entry.tempHp,
      movementBonus: entry.movementBonus,
      durationMode: entry.durationMode,
      price: deepClone(entry.price),
      ingredients: deepClone(entry.ingredients),
      iconCandidates: deepClone(entry.icons)
    }));
  }
}
