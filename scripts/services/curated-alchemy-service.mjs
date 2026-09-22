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
import { primaryRarity, rarityArray } from "../utils/dnd5e-data.mjs";

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

    // Potion of Resistance is the one SRD template that must be materialized into a
    // fixed final product. The native SRD Utility Activity is preserved and linked to
    // one canonical ActiveEffect. Crafting Core applies that already-linked effect to
    // the user without changing the product's gameplay philosophy.
    Hooks.on("dnd5e.postUseActivity", async activity => {
      try {
        const item = activity?.item;
        if (!item?.getFlag?.(MODULE_ID, "autoApplyFixedResistance")) return;
        const damageType = String(item.getFlag(MODULE_ID, "fixedResistance") ?? "").trim().toLowerCase();
        if (!damageType) return;
        const actor = activity.actor ?? item.actor;
        if (!actor) return;

        const applicable = activity.getApplicableEffects instanceof Function
          ? await activity.getApplicableEffects()
          : null;
        const candidates = Array.isArray(applicable) && applicable.length
          ? applicable
          : [...(item.effects ?? [])];
        if (!candidates.length) throw new Error(`${item.name} has no linked resistance ActiveEffect at use time.`);

        const selected = candidates.length === 1 ? candidates[0] : this.#findDamageTypeEffect({ effects: candidates }, damageType);
        const existing = actor.effects?.find?.(effect => String(effect.getFlag?.(MODULE_ID, "appliedFixedResistance") ?? "") === damageType);
        if (existing) await existing.delete();

        const data = selected.toObject?.(true) ?? selected.toObject?.() ?? clone(selected);
        delete data._id;
        data.disabled = false;
        data.transfer = false;
        data.origin = item.uuid;
        data.flags ??= {};
        data.flags[MODULE_ID] ??= {};
        data.flags[MODULE_ID].appliedFixedResistance = damageType;
        await actor.createEmbeddedDocuments("ActiveEffect", [data]);
      } catch (error) {
        console.error(`${MODULE_ID} | Could not apply fixed Curated Resistance effect.`, error);
        ui.notifications?.error?.("Crafting Core could not apply the Resistance effect. Check the console for details.");
      }
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
        rarities: rarityArray(entry.rarity),
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
      [FLAGS.PRODUCT_RARITY]: String(primaryRarity(data.system) || entry.rarity || ""),
      [FLAGS.PRODUCT_TIER]: entry.tier ?? "",
      [FLAGS.PRODUCT_YIELD]: 1,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_CANONICAL_SOURCE]: base?.uuid ?? ""
    };
    return data;
  }

  static #activitySummary(item) {
    const raw = item?._source?.system?.activities ?? {};
    const rawEntries = valuesOf(raw);
    const preparedEntries = valuesOf(item?.system?.activities);
    const idOf = value => String(value?._id ?? value?.id ?? "");
    const typeOf = value => String(value?.type ?? value?.constructor?.type ?? value?.constructor?.metadata?.type ?? "");
    return {
      rawCount: rawEntries.length,
      preparedCount: preparedEntries.length,
      rawIds: rawEntries.map(idOf).filter(Boolean),
      preparedIds: preparedEntries.map(idOf).filter(Boolean),
      rawTypes: rawEntries.map(typeOf).filter(Boolean),
      preparedTypes: preparedEntries.map(typeOf).filter(Boolean)
    };
  }

  static #assertNativeActivities(source, product, label) {
    const expected = this.#activitySummary(source);
    const actual = this.#activitySummary(product);
    const expectedIds = new Set(expected.rawIds);
    const actualIds = new Set(actual.rawIds);
    const idsMatch = expectedIds.size === actualIds.size && [...expectedIds].every(id => actualIds.has(id));
    const expectedTypes = new Map(valuesOf(source?._source?.system?.activities).map(row => [String(row?._id ?? row?.id ?? ""), String(row?.type ?? "")]));
    const actualTypes = new Map(valuesOf(product?._source?.system?.activities).map(row => [String(row?._id ?? row?.id ?? ""), String(row?.type ?? "")]));
    const typesMatch = [...expectedTypes].every(([id, type]) => !type || actualTypes.get(id) === type);
    const countsMatch = expected.rawCount === actual.rawCount && expected.preparedCount === actual.preparedCount;
    if (!countsMatch || !idsMatch || !typesMatch) {
      throw new Error(`${label} did not preserve its native SRD Activities (${actual.rawCount}/${expected.rawCount} persisted, ${actual.preparedCount}/${expected.preparedCount} prepared).`);
    }
    return true;
  }

  static #effectData(effect) {
    const source = effect?._source ?? effect?.toObject?.(true) ?? {};
    return {
      id: String(effect?.id ?? source?._id ?? ""),
      name: String(effect?.name ?? source?.name ?? source?.label ?? ""),
      changes: Array.isArray(source?.changes) ? source.changes : [],
      source
    };
  }

  static #wordMatch(value, word) {
    const escaped = String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, "i").test(String(value ?? ""));
  }

  static #findDamageTypeEffect(item, damageType) {
    const effects = valuesOf(item?.effects);
    const scored = effects.map(effect => {
      const data = this.#effectData(effect);
      let score = 0;
      if (this.#wordMatch(data.name, damageType)) score += 100;
      for (const change of data.changes) {
        const key = String(change?.key ?? "");
        const value = String(change?.value ?? "");
        if (this.#wordMatch(value, damageType)) score += key.includes("traits") || key.includes("resist") ? 80 : 30;
      }
      return { effect, data, score };
    }).sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score <= 0) {
      throw new Error(`Potion of Resistance did not expose a ${damageType} ActiveEffect.`);
    }
    if (scored.length > 1 && scored[1].score === scored[0].score) {
      throw new Error(`Potion of Resistance exposed ambiguous ${damageType} ActiveEffects.`);
    }
    return scored[0].effect;
  }

  static #resistanceDescription(entry, { inscription=false }={}) {
    const key = String(entry?.variant?.key ?? "").toLowerCase();
    const label = String(entry?.variant?.label ?? titleCase(key));
    if (inscription) {
      return `<p><em>This magical inscription carries a ward against ${label.toLowerCase()} damage.</em></p><p>When you activate this inscription, you gain resistance to <strong>${label.toLowerCase()} damage</strong> for 1 hour.</p>`;
    }
    return `<p><em>Potion, Uncommon</em></p><p>When you drink this potion, you gain resistance to <strong>${label.toLowerCase()} damage</strong> for 1 hour.</p>`;
  }

  static #inscriptionDescription(entry, base) {
    if (entry?.variant?.type === "resistance") return this.#resistanceDescription(entry, { inscription: true });
    const existing = String(base?._source?.system?.description?.value ?? base?.system?.description?.value ?? "");
    return `<section class="crafting-core-inscription-flavor"><p><em>This written Inscription is a Crafting Core presentation variant of <strong>${base.name}</strong>. It preserves the canonical SRD Item's native Activities, effects, uses, and rules.</em></p></section>${existing}`;
  }

  static #nativeImportData(base, entry, folderId, existing=null) {
    // Use D&D5e's own Compendium conversion path and persist that entire source.
    // Never transplant system.activities.
    const data = game.items.fromCompendium(base, {
      keepId: false,
      clearSort: false,
      clearOwnership: true
    });
    delete data._id;
    data.folder = folderId;
    if (existing) {
      data._id = existing.id;
      data.sort = existing.sort;
      preserveExternalFlags(existing.toObject(true), data);
    }
    this.#applyManagedFlags(data, entry, base);
    return data;
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

  static async #retainOnlyDamageTypeEffect(item, damageType) {
    const selected = this.#findDamageTypeEffect(item, damageType);
    const deleteIds = valuesOf(item.effects)
      .filter(effect => effect.id !== selected.id)
      .map(effect => effect.id)
      .filter(Boolean);
    if (deleteIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", deleteIds, { render: false });
    const pack = game.packs.get(item.pack);
    const refreshed = pack ? await pack.getDocument(item.id) : item;
    const effects = valuesOf(refreshed?.effects);
    if (effects.length !== 1) throw new Error(`${item.name} retained ${effects.length} ActiveEffects; expected one ${damageType} effect.`);
    const finalEffect = effects[0];
    const evidence = `${this.#effectData(finalEffect).name} ${JSON.stringify(this.#effectData(finalEffect).changes)}`;
    if (!this.#wordMatch(evidence, damageType)) throw new Error(`${item.name} did not retain the expected ${damageType} ActiveEffect.`);
    return refreshed;
  }

  static async #materializeFixedResistance(item, entry) {
    const damageType = String(entry?.variant?.key ?? "").trim().toLowerCase();
    const label = String(entry?.variant?.label ?? titleCase(damageType));
    if (!damageType) throw new Error(`Invalid resistance variant for ${entry?.id ?? "Product"}.`);

    let refreshed = await this.#retainOnlyDamageTypeEffect(item, damageType);
    const effect = valuesOf(refreshed.effects)[0];
    const activity = valuesOf(refreshed.system?.activities)[0] ?? null;
    if (!activity) throw new Error(`${entry.name ?? label} has no native Potion of Resistance Activity.`);
    if (String(activity.type ?? "") !== "utility") throw new Error(`${entry.name ?? label} expected a native Utility Activity, found ${activity.type ?? "unknown"}.`);

    // Edit the existing native Activity through D&D5e's public Item API; do not
    // write the Activities MappingField directly.
    await refreshed.updateActivity(activity.id, {
      name: `Drink — ${label} Resistance`,
      "roll.formula": "",
      "roll.name": "",
      "roll.prompt": false,
      "roll.visible": false,
      effects: [{ _id: effect.id }],
      "target.affects.type": "self",
      "target.affects.count": "",
      "target.affects.choice": false,
      "target.prompt": false,
      "description.chatFlavor": `Gain resistance to ${damageType} damage for 1 hour.`
    });
    await refreshed.update({
      [`flags.${MODULE_ID}.fixedResistance`]: damageType,
      [`flags.${MODULE_ID}.autoApplyFixedResistance`]: true
    }, { render: false });

    const pack = game.packs.get(refreshed.pack);
    refreshed = pack ? await pack.getDocument(refreshed.id) : refreshed;
    const finalActivity = valuesOf(refreshed.system?.activities)[0] ?? null;
    const linkedIds = (finalActivity?.toObject?.().effects ?? []).map(row => String(row?._id ?? "")).filter(Boolean);
    if (!finalActivity || String(finalActivity.type ?? "") !== "utility" || finalActivity.roll?.formula || !linkedIds.includes(effect.id)) {
      throw new Error(`${entry.name ?? label} failed to materialize its fixed ${damageType} native Utility Activity.`);
    }
    return refreshed;
  }

  static async #applyPresentation(item, entry, base) {
    const update = {
      name: entry.kind === "inscription" ? entry.name : (entry.name ?? item.name),
      folder: item.folder?.id ?? item.folder ?? null
    };
    if (entry.kind === "inscription") {
      update.img = entry.icon;
      update["system.description.value"] = this.#inscriptionDescription(entry, base);
      update["system.description.chat"] = "";
    } else if (entry?.variant?.type === "resistance") {
      update["system.description.value"] = this.#resistanceDescription(entry, { inscription: false });
      update["system.description.chat"] = "";
    }
    await item.update(update, { render: false });
    const pack = game.packs.get(item.pack);
    return pack ? await pack.getDocument(item.id) : item;
  }

  static async #rebuildNativeProduct(pack, entry, base, folderId, existing=null) {
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const rollback = existing?.toObject?.(true) ?? null;
    const data = this.#nativeImportData(base, entry, folderId, existing);
    const keepId = Boolean(existing);

    if (existing) await this.#deleteManagedProduct(existing);
    let created = null;
    try {
      [created] = await ItemClass.createDocuments([data], {
        pack: pack.collection,
        fromCompendium: true,
        keepId
      });
      if (!created) throw new Error(`D&D5e did not create ${entry.name ?? base.name}.`);
    } catch (error) {
      if (rollback && existing) {
        try {
          rollback._id = existing.id;
          await ItemClass.createDocuments([rollback], { pack: pack.collection, keepId: true });
        } catch (rollbackError) {
          console.error(`${MODULE_ID} | Product rollback also failed for ${existing.name}.`, rollbackError);
        }
      }
      throw error;
    }

    let persisted = await pack.getDocument(created.id);
    if (!persisted) throw new Error(`${entry.name ?? base.name} could not be reloaded after native Compendium import.`);
    this.#assertNativeActivities(base, persisted, entry.name ?? base.name);

    if (entry?.variant?.type === "resistance") persisted = await this.#materializeFixedResistance(persisted, entry);
    persisted = await this.#applyPresentation(persisted, entry, base);
    this.#assertNativeActivities(base, persisted, entry.name ?? base.name);

    if (entry?.variant?.type === "resistance") {
      const effects = valuesOf(persisted.effects);
      if (effects.length !== 1) throw new Error(`${persisted.name} must retain exactly one resistance ActiveEffect.`);
      const key = String(entry.variant.key ?? "").toLowerCase();
      const evidence = `${this.#effectData(effects[0]).name} ${JSON.stringify(this.#effectData(effects[0]).changes)}`;
      if (!this.#wordMatch(evidence, key)) throw new Error(`${persisted.name} retained the wrong resistance ActiveEffect.`);
    }
    return persisted;
  }

  static async #syncInk(pack, entry, folderId, existing=null) {
    const source = this.#inkSource(entry, folderId);
    this.#applyManagedFlags(source, entry, null);
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    if (!existing) {
      const [created] = await ItemClass.createDocuments([source], { pack: pack.collection });
      if (!created) throw new Error(`D&D5e did not create ${entry.name}.`);
      return { item: created, created: true };
    }
    preserveExternalFlags(existing.toObject(true), source);
    const update = clone(source);
    delete update._id;
    delete update.ownership;
    await existing.update(update, { render: false });
    return { item: existing, created: false };
  }

  static async #syncProducts(state, { forceRebuild=false }={}) {
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
      let unchanged = 0;
      let retiredRemoved = 0;
      const failures = [];

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
        let existing = byId.get(entry.productId) ?? null;
        try {
          if (entry.kind === "ink") {
            const result = await this.#syncInk(pack, entry, folder?.id ?? null, existing);
            byId.set(entry.productId, result.item);
            result.created ? created += 1 : updated += 1;
            continue;
          }

          const base = await this.resolveSrdItem(entry.sourceKey);
          const version = Number(existing?.getFlag(MODULE_ID, FLAGS.CURATED_VERSION) ?? 0);
          const sourceUuid = String(existing?.getFlag(MODULE_ID, FLAGS.PRODUCT_CANONICAL_SOURCE) ?? "");
          const needsRebuild = forceRebuild || !existing || version < CURATED_ALCHEMY_VERSION || sourceUuid !== String(base.uuid);
          if (!needsRebuild) {
            const targetFolder = String(folder?.id ?? "");
            const currentFolder = String(existing.folder?.id ?? existing.folder ?? "");
            if (targetFolder !== currentFolder) {
              await existing.update({ folder: folder?.id ?? null }, { render: false });
              updated += 1;
            } else unchanged += 1;
            continue;
          }

          const item = await this.#rebuildNativeProduct(pack, entry, base, folder?.id ?? null, existing);
          byId.set(entry.productId, item);
          existing ? updated += 1 : created += 1;
        } catch (error) {
          failures.push({ productId: entry.productId, name: entry.name ?? entry.id, error: String(error?.message ?? error) });
          console.error(`${MODULE_ID} | Curated Alchemy Product failed: ${entry.name ?? entry.id}.`, error);
          const fallback = (await pack.getDocuments()).find(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "") === entry.productId) ?? null;
          if (fallback) byId.set(entry.productId, fallback);
        }
      }

      docs = await pack.getDocuments();
      const documentsByProductId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      await pack.getIndex({ fields: ["name", "img", "type", "folder", `flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`] });
      return { pack, created, updated, unchanged, retiredRemoved, failures, documentsByProductId };
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

  static async #createKnowledgeDocument(pack, source) {
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const [created] = await ItemClass.createDocuments([source], { pack: pack.collection });
    if (!created) throw new Error(`D&D5e did not create Curated Alchemy Learn Source ${source?.name ?? "Recipe"}.`);
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

    // Persist opt-in before resolving Materials so the 23 optional definitions become active.
    await this.#saveState(state);
    this.#sourceCache.clear();
    const materialDocs = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const products = await this.#syncProducts(state, { forceRebuild: restore });
    const recipes = await this.#syncRecipes(state, materialDocs, products.documentsByProductId);
    const complete = products.failures.length === 0 && recipes.skipped.length === 0;
    state.version = complete ? CURATED_ALCHEMY_VERSION : Math.min(state.version, CURATED_ALCHEMY_VERSION - 1);
    await this.#saveState(state);
    await KnowledgeItemService.reconcilePublishedKnowledge();
    return { products, recipes, enabled: true, version: state.version, currentVersion: CURATED_ALCHEMY_VERSION, complete };
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
        rarityLabel: titleCase(primaryRarity(item?.system) || entry.rarity || "—"),
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
