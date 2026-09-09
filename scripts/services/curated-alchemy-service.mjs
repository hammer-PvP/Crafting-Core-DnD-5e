import { FLAGS, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";
import {
  CURATED_ALCHEMY_MATERIAL_IDS,
  CURATED_ALCHEMY_PRODUCTS,
  CURATED_ALCHEMY_PRODUCTS_BY_ID,
  CURATED_ALCHEMY_RECIPES,
  CURATED_ALCHEMY_RECIPES_BY_ID,
  CURATED_ALCHEMY_VERSION,
  SRD_ITEM_SOURCES
} from "../data/curated-alchemy-catalog.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { RecipeService } from "./recipe-service.mjs";

const ALLOWED_SRD_PACKS = new Set(["dnd5e.equipment24", "dnd5e.items"]);
const REQUIRED_LICENSE = "CC-BY-4.0";
const RETIRED_PRODUCT_IDS = new Set(["crafting-core-alchemy-product-potion-resistance"]);

function clone(value) { return foundry.utils.deepClone(value); }
function valuesOf(value) {
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return [...value];
  if (value?.values instanceof Function) { try { return [...value.values()]; } catch (_) { /* noop */ } }
  return value && typeof value === "object" ? Object.values(value) : [];
}
function cleanDocumentSource(source) {
  const data = clone(source ?? {});
  for (const key of ["_id", "folder", "sort", "ownership", "_stats", "pack"]) delete data[key];
  return data;
}
function preserveExternalFlags(current, next) {
  const currentFlags = clone(current?.flags ?? {});
  next.flags ??= {};
  for (const [namespace, value] of Object.entries(currentFlags)) {
    if (namespace === MODULE_ID) continue;
    next.flags[namespace] = clone(value);
  }
  return next;
}
function titleCase(value) {
  return String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * D&D5e SRD packs can expose an indefinite ActiveEffect duration as the prepared
 * value `Infinity` even though Foundry v14 persists the same duration as `null`.
 * Passing the prepared value back through createEmbeddedDocuments trips the v14
 * integer validator. Normalize only the persisted duration scalar and otherwise
 * leave the SRD ActiveEffect source untouched.
 */
function normalizeActiveEffectSource(source) {
  const data = clone(source ?? {});
  if (!data.duration || typeof data.duration !== "object") return data;
  const value = data.duration.value;
  if (value === null || value === undefined || Number.isInteger(value)) return data;
  const numeric = Number(value);
  data.duration.value = Number.isFinite(numeric) ? Math.trunc(numeric) : null;
  return data;
}
function normalizeActiveEffectSources(effects) {
  return (effects ?? []).map(effect => normalizeActiveEffectSource(effect));
}

export class CuratedAlchemyService {
  static PRODUCTS_PACK_NAME = "crafting-core-products";
  static PRODUCTS_PACK_LABEL = "Crafting Core — Products";
  static PRODUCTS_PACK_ID = `world.${this.PRODUCTS_PACK_NAME}`;
  static #hooksInstalled = false;
  static #managedDeletes = new Set();
  static #sourceCache = new Map();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CURATED_ALCHEMY_STATE, {
      name: "Crafting Core Curated Alchemy & Inscription State",
      scope: "world",
      config: false,
      type: Object,
      default: { enabled: false, version: 0, suppressedProducts: [], suppressedRecipes: [] }
    });
  }

  static state() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.CURATED_ALCHEMY_STATE);
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    return {
      enabled: Boolean(source.enabled),
      version: Math.max(0, Number(source.version) || 0),
      suppressedProducts: [...new Set((source.suppressedProducts ?? []).map(String).filter(Boolean))],
      suppressedRecipes: [...new Set((source.suppressedRecipes ?? []).map(String).filter(Boolean))]
    };
  }

  static async #saveState(state) { await game.settings.set(MODULE_ID, SETTINGS.CURATED_ALCHEMY_STATE, clone(state)); }

  static installHooks() {
    if (this.#hooksInstalled) return;
    this.#hooksInstalled = true;

    Hooks.on("deleteItem", item => {
      if (!game.user?.isGM || !item?.pack) return;
      const token = `${item.pack}:${item.id}`;
      if (this.#managedDeletes.has(token)) return;
      if (item.pack !== this.PRODUCTS_PACK_ID || !item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED)) return;
      const productId = String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
      if (!CURATED_ALCHEMY_PRODUCTS_BY_ID.has(productId)) return;
      void this.#suppress("product", productId);
    });

    Hooks.on(`${MODULE_ID}.knowledgeUnpublished`, recipeId => {
      const id = String(recipeId ?? "");
      if (CURATED_ALCHEMY_RECIPES_BY_ID.has(id)) void this.#suppress("recipe", id);
    });
    Hooks.on(`${MODULE_ID}.knowledgePublished`, recipeId => {
      const id = String(recipeId ?? "");
      if (!CURATED_ALCHEMY_RECIPES_BY_ID.has(id)) return;
      void this.#unsuppress("recipe", id);
      setTimeout(() => {
        if (!game.user?.isGM || !this.state().enabled) return;
        void this.sync({ restore: false }).catch(error => console.warn(`${MODULE_ID} | Could not post-repair Curated Alchemy Recipe ${id}.`, error));
      }, 0);
    });
  }

  static async #suppress(kind, id) {
    const state = this.state();
    const key = kind === "product" ? "suppressedProducts" : "suppressedRecipes";
    if (state[key].includes(String(id))) return false;
    state[key].push(String(id));
    await this.#saveState(state);
    return true;
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

  static productsPack() { return CompendiumService.findWorldPack(this.PRODUCTS_PACK_NAME); }
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
      { key: "alchemy", name: "Alchemy" },
      { key: "alchemy:healing", name: "Healing", parent: "alchemy" },
      { key: "alchemy:basic", name: "Basic Consumables", parent: "alchemy" },
      { key: "alchemy:utility", name: "Utility", parent: "alchemy" },
      { key: "alchemy:resistance", name: "Resistance", parent: "alchemy" },
      { key: "alchemy:giant", name: "Giant Strength", parent: "alchemy" },
      { key: "alchemy:advanced", name: "Advanced Alchemy", parent: "alchemy" },
      { key: "inscription", name: "Inscription" },
      { key: "inscription:inks", name: "Inscription Inks", parent: "inscription" },
      { key: "inscription:basic", name: "Basic", parent: "inscription" },
      { key: "inscription:elaborate", name: "Elaborate", parent: "inscription" },
      { key: "inscription:elite", name: "Elite", parent: "inscription" }
    ];
  }

  static #knowledgeFolders() {
    return [
      { key: "curated", name: "Crafting Core Curated" },
      { key: "curated:alchemy", name: "Alchemy", parent: "curated" },
      { key: "curated:alchemy:healing", name: "Healing", parent: "curated:alchemy" },
      { key: "curated:alchemy:basic", name: "Basic Consumables", parent: "curated:alchemy" },
      { key: "curated:alchemy:utility", name: "Utility", parent: "curated:alchemy" },
      { key: "curated:alchemy:resistance", name: "Resistance", parent: "curated:alchemy" },
      { key: "curated:alchemy:giant", name: "Giant Strength", parent: "curated:alchemy" },
      { key: "curated:alchemy:advanced", name: "Advanced Alchemy", parent: "curated:alchemy" },
      { key: "curated:inscription", name: "Inscription", parent: "curated" },
      { key: "curated:inscription:inks", name: "Inks", parent: "curated:inscription" },
      { key: "curated:inscription:basic", name: "Basic", parent: "curated:inscription" },
      { key: "curated:inscription:elaborate", name: "Elaborate", parent: "curated:inscription" },
      { key: "curated:inscription:elite", name: "Elite", parent: "curated:inscription" }
    ];
  }

  static #knowledgeFolderKey(entry) {
    if (String(entry.group).startsWith("inscription:")) return `curated:${entry.group}`;
    return `curated:${entry.group}`;
  }

  static #isRedistributableSrdItem(item) {
    if (!item || String(item.documentName ?? item.constructor?.documentName ?? "") !== "Item") return false;
    if (!ALLOWED_SRD_PACKS.has(String(item.pack ?? ""))) return false;
    const license = String(item.system?.source?.license ?? "");
    return license.includes(REQUIRED_LICENSE);
  }

  static async resolveSrdItem(sourceKey, { fresh=false }={}) {
    const key = String(sourceKey ?? "");
    if (!key || !SRD_ITEM_SOURCES[key]) throw new Error(`Unknown SRD source key: ${key || "(blank)"}.`);
    if (!fresh && this.#sourceCache.has(key)) return this.#sourceCache.get(key);
    const spec = SRD_ITEM_SOURCES[key];

    for (const candidate of spec.preferred ?? []) {
      if (!ALLOWED_SRD_PACKS.has(candidate.pack)) continue;
      const pack = game.packs?.get(candidate.pack);
      if (!pack) continue;
      let item = null;
      try { item = await pack.getDocument(candidate.id); } catch (_) { /* fallback by name below */ }
      if (this.#isRedistributableSrdItem(item)) {
        this.#sourceCache.set(key, item);
        return item;
      }
    }

    const wantedNames = new Set((spec.names ?? []).map(name => String(name).trim().toLocaleLowerCase()));
    for (const packId of spec.packs ?? []) {
      if (!ALLOWED_SRD_PACKS.has(packId)) continue;
      const pack = game.packs?.get(packId);
      if (!pack) continue;
      const index = await pack.getIndex({ fields: ["name"] });
      const rows = [...index].filter(row => wantedNames.has(String(row.name ?? "").trim().toLocaleLowerCase()));
      for (const row of rows) {
        const item = await pack.getDocument(row._id ?? row.id);
        if (!this.#isRedistributableSrdItem(item)) continue;
        this.#sourceCache.set(key, item);
        return item;
      }
    }
    throw new Error(`SRD Item "${spec.names?.[0] ?? key}" was not found in D&D5e SRD 5.2/5.1 with ${REQUIRED_LICENSE} licensing.`);
  }

  static async auditSrdSources() {
    this.#sourceCache.clear();
    const resolved = [];
    const missing = [];
    for (const key of Object.keys(SRD_ITEM_SOURCES)) {
      try {
        const item = await this.resolveSrdItem(key, { fresh: true });
        resolved.push({ key, uuid: item.uuid, name: item.name, pack: item.pack });
      } catch (error) {
        missing.push({ key, error: String(error?.message ?? error) });
      }
    }
    return { resolved, missing, ok: missing.length === 0 };
  }

  static #inkSource(entry, folderId) {
    return {
      name: entry.name,
      type: "loot",
      img: entry.icon,
      folder: folderId,
      system: {
        description: { value: `<p><strong>${entry.name}</strong> is a curated writing medium used to bind magical effects into Crafting Core Inscriptions.</p>`, chat: "" },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price: { value: Number(entry.priceGp) || 0, denomination: "gp" },
        rarity: entry.rarity,
        identified: true,
        unidentified: { description: "" },
        container: null,
        properties: [],
        type: { value: "trade", subtype: "" },
        identifier: `cc-${entry.id}`,
        source: { custom: "Crafting Core — Curated Inscription", book: "", page: "", license: "", rules: "2024", revision: 1 }
      },
      flags: { [MODULE_ID]: {} },
      ownership: { default: 0 }
    };
  }

  static #applyVariant(data, entry) {
    const variant = entry?.variant ?? null;
    if (!variant) return data;

    if (variant.type === "resistance") {
      const key = String(variant.key ?? "").trim().toLocaleLowerCase();
      const label = String(variant.label ?? key).trim();
      if (!key || !label) throw new Error(`Invalid resistance variant definition for ${entry?.id ?? "unknown Product"}.`);

      const effects = Array.isArray(data.effects) ? data.effects : [];
      const matching = effects.filter(effect => {
        const name = String(effect?.name ?? "").trim().toLocaleLowerCase();
        const changes = effect?.system?.changes ?? effect?.changes ?? [];
        const byName = name === `${label.toLocaleLowerCase()} resistance`;
        const byChange = Array.isArray(changes) && changes.some(change =>
          String(change?.key ?? "") === "system.traits.dr.value"
          && String(change?.value ?? "").trim().toLocaleLowerCase() === key
        );
        return byName || byChange;
      });
      if (matching.length !== 1) {
        throw new Error(`SRD Potion of Resistance did not expose exactly one ${label} Resistance Active Effect (found ${matching.length}).`);
      }

      const chosen = matching[0];
      const chosenId = String(chosen?._id ?? chosen?.id ?? "");
      if (!chosenId) throw new Error(`SRD ${label} Resistance Active Effect has no persistent ID.`);
      data.effects = [chosen];

      const activities = data.system?.activities ?? {};
      for (const activity of Object.values(activities)) {
        if (!activity || typeof activity !== "object" || !Array.isArray(activity.effects)) continue;
        activity.effects = activity.effects.filter(ref => String(ref?._id ?? ref?.id ?? "") === chosenId);
      }

      data.name = entry.name ?? `Potion of ${label} Resistance`;
      data.system ??= {};
      data.system.identifier = `cc-${entry.id}`;
      data.system.description ??= { value: "", chat: "" };
      const rarity = titleCase(data.system.rarity ?? "Uncommon");
      data.system.description.value = `<p><em>Potion, ${rarity}</em></p><p>When you use this consumable, you gain resistance to <strong>${label.toLowerCase()} damage</strong> for 1 hour.</p>`;
    }

    return data;
  }

  static #canonicalSource(entry, base, folderId) {
    const data = cleanDocumentSource(base.toObject(true));
    this.#applyVariant(data, entry);
    data.folder = folderId;
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    if (entry.kind === "inscription") {
      data.name = entry.name;
      data.img = entry.icon;
      data.system ??= {};
      data.system.description ??= { value: "", chat: "" };
      const original = String(data.system.description.value ?? "");
      const canonicalLabel = entry.variant?.type === "resistance" ? `Potion of ${entry.variant.label} Resistance` : base.name;
      data.system.description.value = `<section class="crafting-core-inscription-flavor"><p><em>This written Inscription is a Crafting Core presentation variant of <strong>${canonicalLabel}</strong>. It intentionally preserves the canonical SRD Item's native Activities, effects, uses, and rules.</em></p></section>${original}`;
      if (data.system.identifier) data.system.identifier = `cc-${entry.id}`;
    }
    data.effects = normalizeActiveEffectSources(data.effects);
    return data;
  }

  static #applyManagedFlags(data, entry, base=null) {
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      [FLAGS.CURATED]: true,
      [FLAGS.CURATED_ID]: entry.id,
      [FLAGS.CURATED_KIND]: entry.kind === "inscription" ? "inscription-product" : entry.kind === "ink" ? "inscription-ink" : "alchemy-product",
      [FLAGS.CURATED_VERSION]: CURATED_ALCHEMY_VERSION,
      [FLAGS.PRODUCT]: true,
      [FLAGS.PRODUCT_ID]: entry.productId,
      [FLAGS.PRODUCT_CATEGORY]: entry.category,
      [FLAGS.PRODUCT_SUBCATEGORY]: entry.subcategory,
      [FLAGS.PRODUCT_RARITY]: String(data.system?.rarity ?? entry.rarity ?? ""),
      [FLAGS.PRODUCT_TIER]: entry.tier ?? "",
      [FLAGS.PRODUCT_YIELD]: 1,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_CANONICAL_SOURCE]: base?.uuid ?? ""
    };
    return data;
  }

  static #activitySourceMap(activities) {
    const mapped = {};
    if (!activities) return mapped;

    // Persistent D&D5e activity data is stored as an id-keyed MappingField.  At runtime
    // the prepared value becomes an ActivityCollection, so normalize either shape back
    // into the persistent mapping before writing it to another Item.
    if (activities instanceof Map || activities?.values instanceof Function) {
      for (const activity of valuesOf(activities)) {
        const data = activity?.toObject instanceof Function ? activity.toObject(true) : clone(activity);
        const id = String(data?._id ?? activity?.id ?? activity?._id ?? "").trim();
        if (!id || !data || typeof data !== "object") continue;
        data._id = id;
        mapped[id] = data;
      }
      return mapped;
    }

    if (Array.isArray(activities)) {
      for (const activity of activities) {
        const data = activity?.toObject instanceof Function ? activity.toObject(true) : clone(activity);
        const id = String(data?._id ?? activity?.id ?? activity?._id ?? "").trim();
        if (!id || !data || typeof data !== "object") continue;
        data._id = id;
        mapped[id] = data;
      }
      return mapped;
    }

    if (typeof activities === "object") {
      for (const [key, activity] of Object.entries(activities)) {
        const data = activity?.toObject instanceof Function ? activity.toObject(true) : clone(activity);
        const id = String(data?._id ?? key ?? "").trim();
        if (!id || !data || typeof data !== "object") continue;
        data._id = id;
        mapped[id] = data;
      }
    }
    return mapped;
  }

  static #sourceActivityCount(source) {
    return Object.keys(this.#activitySourceMap(source?.system?.activities)).length;
  }

  static #documentActivityCount(item) {
    return valuesOf(item?.system?.activities).length;
  }

  static #assertActivities(item, source) {
    const expectedMap = this.#activitySourceMap(source?.system?.activities);
    const expectedIds = Object.keys(expectedMap);
    const actualActivities = valuesOf(item?.system?.activities);
    const actualIds = new Set(actualActivities.map(activity => String(activity?.id ?? activity?._id ?? "")).filter(Boolean));
    const missingIds = expectedIds.filter(id => !actualIds.has(id));
    const wrongTypes = expectedIds.filter(id => {
      const expectedType = String(expectedMap[id]?.type ?? "");
      const actual = item?.system?.activities?.get instanceof Function
        ? item.system.activities.get(id)
        : actualActivities.find(activity => String(activity?.id ?? activity?._id ?? "") === id);
      return expectedType && String(actual?.type ?? "") !== expectedType;
    });

    if (expectedIds.length > 0 && (actualActivities.length !== expectedIds.length || missingIds.length || wrongTypes.length)) {
      const details = [
        `${actualActivities.length}/${expectedIds.length} SRD Activities`,
        missingIds.length ? `missing IDs: ${missingIds.join(", ")}` : "",
        wrongTypes.length ? `type mismatch: ${wrongTypes.join(", ")}` : ""
      ].filter(Boolean).join("; ");
      throw new Error(`Curated Item ${item?.name ?? source?.name ?? "Item"} persisted ${details}.`);
    }
  }

  static async #replaceActivities(item, activities) {
    const desired = this.#activitySourceMap(activities);

    // D&D5e 5.3.x ActivitiesField is a MappingField backed by pseudo-documents.  Replacing
    // `system.activities` wholesale is cleaned as a normal object update by Foundry v14 and
    // can result in an empty ActivityCollection.  Use the system's own per-activity write
    // path instead (the same dotted path used by Item5e#createActivity/updateActivity).
    const currentIds = valuesOf(item.system?.activities)
      .map(activity => String(activity?.id ?? activity?._id ?? ""))
      .filter(Boolean);
    for (const id of currentIds) {
      if (item.deleteActivity instanceof Function) await item.deleteActivity(id);
      else await item.update({ [`system.activities.-=${id}`]: null }, { render: false });
    }

    for (const [id, activity] of Object.entries(desired)) {
      await item.update({ [`system.activities.${id}`]: clone(activity) }, { render: false });
    }
  }

  static async #createEffects(item, effects) {
    const normalized = normalizeActiveEffectSources(effects);
    if (!normalized.length) return [];
    const created = await item.createEmbeddedDocuments("ActiveEffect", normalized, { keepId: true, render: false });
    if ((created?.length ?? 0) !== normalized.length) {
      throw new Error(`D&D5e created ${created?.length ?? 0}/${normalized.length} Active Effects for ${item.name}.`);
    }
    return created;
  }

  static async #createProductDocument(pack, source) {
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const core = clone(source);
    const effects = normalizeActiveEffectSources(core.effects ?? []);
    const activities = this.#activitySourceMap(core.system?.activities);
    delete core.effects;
    if (core.system) delete core.system.activities;

    // Create the shell first, then persist Activities through D&D5e's native MappingField
    // update path.  This mirrors how Item5e#createActivity writes an Activity in v5.3.x.
    const [created] = await ItemClass.createDocuments([core], { pack: pack.collection });
    if (!created) throw new Error(`D&D5e did not create Curated Product ${source.name}.`);
    await this.#replaceActivities(created, activities);
    if (effects.length) await this.#createEffects(created, effects);
    this.#assertActivities(created, source);
    return created;
  }

  static async #updateProductDocument(item, source) {
    const data = clone(source);
    const desiredEffects = normalizeActiveEffectSources(data.effects ?? []);
    const desiredActivities = clone(data.system?.activities ?? {});
    delete data.effects;
    if (data.system) delete data.system.activities;
    delete data._id;
    delete data.ownership;

    // Keep a rollback copy so a failed embedded-effect replacement never leaves
    // an otherwise valid Product silently stripped of its SRD effects.
    const previousEffects = normalizeActiveEffectSources([...(item.effects ?? [])].map(effect => effect.toObject(true)));
    const existingEffectIds = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
    if (existingEffectIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", existingEffectIds, { render: false });
    await item.update(data, { render: false });
    await this.#replaceActivities(item, desiredActivities);
    try {
      if (desiredEffects.length) await this.#createEffects(item, desiredEffects);
    } catch (error) {
      console.error(`${MODULE_ID} | Could not replace SRD Active Effects for ${item.name}; attempting rollback.`, error);
      const partialIds = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
      if (partialIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", partialIds, { render: false });
      if (previousEffects.length) {
        try { await this.#createEffects(item, previousEffects); }
        catch (rollbackError) { console.error(`${MODULE_ID} | Active Effect rollback also failed for ${item.name}.`, rollbackError); }
      }
      throw error;
    }
    this.#assertActivities(item, source);
    return item;
  }

  static async #deleteManagedProduct(item) {
    if (!item) return false;
    const token = `${item.pack}:${item.id}`;
    this.#managedDeletes.add(token);
    try {
      await item.delete({ render: false });
      return true;
    } finally {
      this.#managedDeletes.delete(token);
    }
  }

  static async #syncProducts(state) {
    const pack = await this.ensureProductsPack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#productFolders());
      let docs = await pack.getDocuments();
      const byId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      const suppressed = new Set(state.suppressedProducts);
      let created = 0;
      let updated = 0;
      let retiredRemoved = 0;
      const missingSources = [];

      for (const retiredId of RETIRED_PRODUCT_IDS) {
        const retired = byId.get(retiredId) ?? null;
        if (!retired || !retired.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED)) continue;
        if (await this.#deleteManagedProduct(retired)) {
          byId.delete(retiredId);
          retiredRemoved += 1;
        }
      }

      for (const entry of CURATED_ALCHEMY_PRODUCTS) {
        if (suppressed.has(entry.productId)) continue;
        const folder = folders.get(entry.folderKey) ?? null;
        let base = null;
        let source = null;
        try {
          if (entry.kind === "ink") source = this.#inkSource(entry, folder?.id ?? null);
          else {
            base = await this.resolveSrdItem(entry.sourceKey);
            source = this.#canonicalSource(entry, base, folder?.id ?? null);
          }
        } catch (error) {
          missingSources.push({ productId: entry.productId, name: entry.name ?? entry.id, error: String(error?.message ?? error) });
          continue;
        }
        this.#applyManagedFlags(source, entry, base);
        const existing = byId.get(entry.productId) ?? null;
        if (!existing) {
          const item = await this.#createProductDocument(pack, source);
          byId.set(entry.productId, item);
          created += 1;
        } else {
          preserveExternalFlags(existing.toObject(true), source);
          await this.#updateProductDocument(existing, source);
          updated += 1;
        }
      }
      docs = await pack.getDocuments();
      const documentsByProductId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      await pack.getIndex({ fields: ["name", "img", "type", "folder", `flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`] });
      return { pack, created, updated, retiredRemoved, missingSources, documentsByProductId };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #ingredientReference(row, materialDocs, productDocs) {
    let item = null;
    if (row.kind === "material") item = materialDocs.get(row.id) ?? null;
    else if (row.kind === "product") item = productDocs.get(`crafting-core-alchemy-product-${row.id}`) ?? null;
    else if (row.kind === "srd") item = await this.resolveSrdItem(row.key);
    if (!item) throw new Error(`Ingredient could not be resolved: ${row.kind}:${row.id ?? row.key}.`);
    return RecipeService.itemReference(item, row.quantity, { ingredient: true });
  }

  static async #recipeSnapshot(entry, materialDocs, productDocs) {
    const product = productDocs.get(entry.productId);
    if (!product) throw new Error(`Result Product is unavailable for ${entry.name}.`);
    const ingredients = [];
    for (const row of entry.ingredients) ingredients.push(await this.#ingredientReference(row, materialDocs, productDocs));
    return RecipeService.snapshot({
      id: entry.recipeId,
      name: entry.name,
      img: product.img,
      description: entry.description,
      craftingMode: entry.craftingMode,
      craftingTime: entry.craftingTime ?? 0,
      project: entry.project,
      craftingResolution: entry.craftingResolution,
      learning: { access: "anyone" },
      ingredients,
      result: {
        ...RecipeService.itemReference(product, entry.resultQuantity, { snapshot: true }),
        sourceUuid: product.uuid
      },
      knowledge: { label: "Recipe", name: `Recipe — ${entry.name}`, img: KNOWLEDGE_ICONS.Recipe },
      publication: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }

  static async #updateKnowledgeDocument(item, source) {
    const data = clone(source);
    const desiredActivities = this.#activitySourceMap(data.system?.activities);
    if (data.system) delete data.system.activities;
    delete data._id;
    delete data.ownership;
    await item.update(data, { render: false });
    await this.#replaceActivities(item, desiredActivities);
    this.#assertActivities(item, source);
    return item;
  }

  static async #createKnowledgeDocument(pack, source) {
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const data = clone(source);
    const desiredActivities = this.#activitySourceMap(data.system?.activities);
    if (data.system) delete data.system.activities;
    const [created] = await ItemClass.createDocuments([data], { pack: pack.collection });
    if (!created) throw new Error(`D&D5e did not create Curated Alchemy Learn Source ${source?.name ?? "Recipe"}.`);
    await this.#replaceActivities(created, desiredActivities);
    this.#assertActivities(created, source);
    return created;
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
      let created = 0;
      let updated = 0;
      let foldersRepaired = 0;
      const skipped = [];

      for (const entry of CURATED_ALCHEMY_RECIPES) {
        if (suppressed.has(entry.recipeId)) continue;
        if (!productDocs.has(entry.productId)) {
          skipped.push({ recipeId: entry.recipeId, name: entry.name, reason: "missing-result-product" });
          continue;
        }
        let recipe;
        try { recipe = await this.#recipeSnapshot(entry, materialDocs, productDocs); }
        catch (error) {
          skipped.push({ recipeId: entry.recipeId, name: entry.name, reason: String(error?.message ?? error) });
          continue;
        }
        const existing = byRecipeId.get(entry.recipeId) ?? null;
        if (existing) recipe.publication = {
          uuid: existing.uuid,
          pack: pack.collection,
          sourceType: "Recipe",
          publishedAt: Number(existing.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(),
          updatedAt: Date.now()
        };
        const folder = folders.get(this.#knowledgeFolderKey(entry)) ?? folders.get("curated") ?? null;
        const data = KnowledgeItemService.knowledgeItemData(recipe, { folderId: folder?.id ?? null, published: true });
        data.img = KNOWLEDGE_ICONS.Recipe;
        data.flags[MODULE_ID] = {
          ...(data.flags[MODULE_ID] ?? {}),
          [FLAGS.CURATED]: true,
          [FLAGS.CURATED_ID]: entry.id,
          [FLAGS.CURATED_KIND]: "alchemy-recipe",
          [FLAGS.CURATED_VERSION]: CURATED_ALCHEMY_VERSION,
          [FLAGS.PRODUCT_ID]: entry.productId,
          [FLAGS.PRODUCT_CATEGORY]: String(entry.group).startsWith("inscription:") ? "inscription" : "alchemy",
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.group,
          [FLAGS.PRODUCT_TIER]: entry.tier ?? "",
          [FLAGS.PRODUCT_YIELD]: Math.max(1, Number(entry.resultQuantity) || 1)
        };
        if (existing) preserveExternalFlags(existing.toObject(true), data);
        if (!existing) {
          const createdItem = await this.#createKnowledgeDocument(pack, data);
          byRecipeId.set(entry.recipeId, createdItem);
          created += 1;
        } else {
          const oldFolder = String(existing.folder?.id ?? existing.folder ?? "");
          const newFolder = String(folder?.id ?? "");
          await this.#updateKnowledgeDocument(existing, data);
          if (oldFolder !== newFolder) foldersRepaired += 1;
          updated += 1;
        }
      }
      docs = await pack.getDocuments();
      const documentsByRecipeId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item]).filter(([id]) => id));
      await pack.getIndex({ fields: ["name", "img", "type", "folder", `flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_ID}`] });
      return { pack, created, updated, foldersRepaired, skipped, documentsByRecipeId };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async syncIfNeeded() {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };
    const state = this.state();
    if (!state.enabled) return { skipped: true, reason: "disabled" };
    const products = this.productsPack();
    const learn = KnowledgeItemService.pack();
    const productDocs = products ? await products.getDocuments() : [];
    const recipeDocs = learn ? await learn.getDocuments() : [];
    const presentProductIds = new Set(productDocs.map(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "")).filter(Boolean));
    const presentRecipeIds = new Set(recipeDocs.map(item => String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "")).filter(Boolean));
    const repaired = clone(state);
    repaired.suppressedProducts = repaired.suppressedProducts.filter(id => !presentProductIds.has(id));
    repaired.suppressedRecipes = repaired.suppressedRecipes.filter(id => !presentRecipeIds.has(id));
    if (JSON.stringify(repaired) !== JSON.stringify(state)) await this.#saveState(repaired);
    const expectedProducts = CURATED_ALCHEMY_PRODUCTS.filter(row => !repaired.suppressedProducts.includes(row.productId)).map(row => row.productId);
    const expectedRecipes = CURATED_ALCHEMY_RECIPES.filter(row => !repaired.suppressedRecipes.includes(row.recipeId)).map(row => row.recipeId);
    if (repaired.version >= CURATED_ALCHEMY_VERSION
      && expectedProducts.every(id => presentProductIds.has(id))
      && expectedRecipes.every(id => presentRecipeIds.has(id))) {
      return { skipped: true, reason: "current", products: expectedProducts.length, recipes: expectedRecipes.length };
    }
    return this.sync({ restore: false });
  }

  static async restoreAll() {
    if (!game.user?.isGM) throw new Error("Only a GM can restore Curated Alchemy & Inscription content.");
    const state = this.state();
    state.enabled = true;
    state.suppressedProducts = [];
    state.suppressedRecipes = [];
    await this.#saveState(state);
    return this.sync({ restore: true });
  }

  static async sync({ restore=false }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can synchronize Curated Alchemy & Inscription content.");
    const state = this.state();
    state.enabled = true;
    state.suppressedProducts = state.suppressedProducts.filter(id => !RETIRED_PRODUCT_IDS.has(id));
    if (restore) {
      state.suppressedProducts = [];
      state.suppressedRecipes = [];
    }
    // Persist the opt-in before asking MaterialCatalogService for its active definitions.
    // This makes direct API sync just as safe as the UI restore/install path.
    await this.#saveState(state);
    this.#sourceCache.clear();
    const materialDocs = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const products = await this.#syncProducts(state);
    const recipes = await this.#syncRecipes(state, materialDocs, products.documentsByProductId);
    state.version = CURATED_ALCHEMY_VERSION;
    await this.#saveState(state);
    await KnowledgeItemService.reconcilePublishedKnowledge();
    return { products, recipes, enabled: true, version: CURATED_ALCHEMY_VERSION };
  }

  static async catalogContext() {
    const state = this.state();
    const pack = this.productsPack();
    const learn = KnowledgeItemService.pack();
    const products = pack ? await pack.getDocuments() : [];
    const recipes = learn ? await learn.getDocuments() : [];
    const productDocs = new Map(products.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
    const productIds = new Set(productDocs.keys());
    const recipeIds = new Set(recipes.map(item => String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "")).filter(Boolean));
    const expectedProducts = CURATED_ALCHEMY_PRODUCTS.filter(row => !state.suppressedProducts.includes(row.productId));
    const expectedRecipes = CURATED_ALCHEMY_RECIPES.filter(row => !state.suppressedRecipes.includes(row.recipeId));
    const inscriptionCount = CURATED_ALCHEMY_PRODUCTS.filter(row => row.kind === "inscription").length;
    const inkCount = CURATED_ALCHEMY_PRODUCTS.filter(row => row.kind === "ink").length;
    const canonicalCount = CURATED_ALCHEMY_PRODUCTS.filter(row => row.kind === "canonical").length;

    const groups = [
      ["alchemy:healing", "Healing"], ["alchemy:basic", "Basic Consumables"], ["alchemy:utility", "Utility"],
      ["alchemy:resistance", "Resistance"], ["alchemy:giant", "Giant Strength"], ["alchemy:advanced", "Advanced Alchemy"],
      ["inscription:inks", "Inscription Inks"], ["inscription:basic", "Basic"],
      ["inscription:elaborate", "Elaborate"], ["inscription:elite", "Elite"]
    ];
    const rows = expectedProducts.map(entry => {
      const item = productDocs.get(entry.productId) ?? null;
      const sourceName = entry.sourceKey ? (SRD_ITEM_SOURCES[entry.sourceKey]?.names?.[0] ?? titleCase(entry.sourceKey)) : "Crafting Core";
      return {
        productId: entry.productId,
        folderKey: entry.folderKey,
        exists: Boolean(item),
        name: item?.name ?? entry.name ?? sourceName,
        img: item?.img ?? entry.icon ?? "icons/svg/item-bag.svg",
        typeLabel: entry.kind === "canonical" ? "SRD Product" : entry.kind === "inscription" ? "Inscription" : "Inscription Ink",
        rarityLabel: titleCase(item?.system?.rarity ?? entry.rarity ?? "—"),
        tierLabel: entry.tier ? titleCase(entry.tier) : "—",
        sourceLabel: entry.kind === "inscription" ? sourceName : (entry.kind === "canonical" ? "SRD 5.2 / 5.1" : "Crafting Core")
      };
    });
    const buildGroups = keys => groups.filter(([key]) => keys.includes(key)).map(([key, label]) => {
      const products = rows.filter(row => row.folderKey === key);
      return { key, label, count: products.length, products };
    }).filter(group => group.count);
    const sections = [
      { key: "alchemy", label: "Alchemy", groups: buildGroups(["alchemy:healing", "alchemy:basic", "alchemy:utility", "alchemy:resistance", "alchemy:giant", "alchemy:advanced"]) },
      { key: "inscription", label: "Inscription", groups: buildGroups(["inscription:inks", "inscription:basic", "inscription:elaborate", "inscription:elite"]) }
    ];
    for (const section of sections) section.count = section.groups.reduce((sum, group) => sum + group.count, 0);

    return {
      enabled: state.enabled,
      version: state.version,
      currentVersion: CURATED_ALCHEMY_VERSION,
      packExists: Boolean(pack),
      productCount: expectedProducts.filter(row => productIds.has(row.productId)).length,
      productTotal: expectedProducts.length,
      recipeCount: expectedRecipes.filter(row => recipeIds.has(row.recipeId)).length,
      recipeTotal: expectedRecipes.length,
      canonicalCount,
      inscriptionCount,
      inkCount,
      materialCount: CURATED_ALCHEMY_MATERIAL_IDS.size,
      sections,
      sourcePolicy: "D&D5e SRD 5.2 → SRD 5.1 · CC-BY-4.0 only",
      excluded: ["Potion of Comprehension", "Potion of Fire Breath"],
      statusLabel: !state.enabled ? "Optional library not installed" : (state.version >= CURATED_ALCHEMY_VERSION ? "Installed" : "Update available")
    };
  }
}
