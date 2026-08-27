import { MODULE_ID, SETTINGS } from "../constants.mjs";

/**
 * Build the physical NPC gear payload that a corpse Item Pile should receive.
 *
 * The source Actor is always read-only. Token Harvest resolves the final payload
 * before any canvas document is changed, so normalization never needs to empty
 * and repopulate an already-created Item Pile.
 */
export class GearNormalizationService {
  static MAX_SOURCES = 4;
  static MODES = Object.freeze({
    NORMALIZE: "normalize",
    REMOVE_ALL: "remove-all",
    FILTER: "filter",
    KEEP_ALL: "keep-all"
  });
  static PHYSICAL_ITEM_TYPES = new Set(["weapon", "equipment", "consumable", "tool", "loot", "container"]);
  static indexCache = new Map();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.GEAR_NORMALIZATION, {
      name: "Crafting Core Gear Normalization",
      scope: "world",
      config: false,
      type: Object,
      default: { mode: this.MODES.NORMALIZE, sources: [] }
    });
  }

  static config() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.GEAR_NORMALIZATION) ?? {};
    const validModes = new Set(Object.values(this.MODES));
    const mode = validModes.has(String(raw.mode)) ? String(raw.mode) : this.MODES.NORMALIZE;
    const available = new Set(this.availableItemPacks().map(pack => pack.collection));
    const sources = [...new Set((Array.isArray(raw.sources) ? raw.sources : []).map(String).filter(id => available.has(id)))].slice(0, this.MAX_SOURCES);
    return { mode, sources };
  }

  static async saveConfig({ mode=this.MODES.NORMALIZE, sources=[] }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can configure loot normalization.");
    const validModes = new Set(Object.values(this.MODES));
    const normalizedMode = validModes.has(String(mode)) ? String(mode) : this.MODES.NORMALIZE;
    const available = new Set(this.availableItemPacks().map(pack => pack.collection));
    const normalizedSources = [...new Set((sources ?? []).map(String).filter(id => available.has(id)))].slice(0, this.MAX_SOURCES);
    const value = { mode: normalizedMode, sources: normalizedSources };
    await game.settings.set(MODULE_ID, SETTINGS.GEAR_NORMALIZATION, value);
    this.indexCache.clear();
    Hooks.callAll(`${MODULE_ID}.gearNormalizationChanged`, foundry.utils.deepClone(value));
    return value;
  }

  static availableItemPacks() {
    const packs = Array.isArray(game.packs?.contents)
      ? game.packs.contents
      : (typeof game.packs?.values === "function" ? [...game.packs.values()] : [...(game.packs ?? [])]);
    return packs
      .filter(pack => {
        const documentName = String(pack.documentName ?? pack.metadata?.type ?? "");
        if (documentName !== "Item") return false;
        const system = String(pack.metadata?.system ?? "");
        return !system || system === game.system?.id;
      })
      .map(pack => ({
        collection: String(pack.collection),
        label: String(pack.title ?? pack.metadata?.label ?? pack.collection),
        packageType: String(pack.metadata?.packageType ?? "world"),
        packageName: String(pack.metadata?.packageName ?? pack.metadata?.package ?? ""),
        locked: Boolean(pack.locked)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  static async buildPlan(actor, { sourceItems=null }={}) {
    const { mode, sources } = this.config();
    const actorItems = [...(actor?.items?.contents ?? actor?.items ?? [])].filter(Boolean);
    const suppliedItems = Array.isArray(sourceItems)
      ? sourceItems.map(row => row?.item ?? row).filter(Boolean)
      : null;
    // When Token Harvest is creating an Item Pile, Item Piles' own
    // getActorItems() result is the authority for what the corpse can
    // actually transfer. Falling back to actor.items keeps this service
    // useful outside that pipeline.
    sourceItems = suppliedItems ?? actorItems;
    const retained = sourceItems.filter(item => this.isPhysicalCandidate(item) && !this.isNaturalWeapon(item));
    const removedByFilter = sourceItems.filter(item => !retained.includes(item));

    if (mode !== this.MODES.NORMALIZE) {
      const output = mode === this.MODES.KEEP_ALL
        ? this.payloadFromItems(sourceItems)
        : mode === this.MODES.FILTER
          ? this.payloadFromItems(retained)
          : [];
      return {
        mode,
        sources,
        sourceItemCount: sourceItems.length,
        retainedItemCount: retained.length,
        removedItemCount: removedByFilter.length,
        normalized: [],
        unmatched: [],
        output
      };
    }

    const normalized = [];
    const unmatched = [];
    for (const item of retained) {
      const match = await this.resolveBaseItem(item, sources);
      if (!match) {
        unmatched.push({ id: String(item.id ?? ""), name: String(item.name ?? ""), type: String(item.type ?? "") });
        continue;
      }
      const data = match.document.toObject();
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      data.system ??= {};
      data.system.quantity = 1;
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        normalizedLoot: true,
        normalizedAt: Date.now(),
        normalizedFromName: String(item.name ?? ""),
        normalizedFromType: String(item.type ?? ""),
        normalizationSource: match.collection
      };
      normalized.push({
        item: data,
        quantity: this.quantityOf(item),
        sourceItemId: String(item.id ?? ""),
        sourceItemName: String(item.name ?? ""),
        collection: match.collection
      });
    }

    return {
      mode,
      sources,
      sourceItemCount: sourceItems.length,
      retainedItemCount: retained.length,
      removedItemCount: removedByFilter.length,
      normalized,
      unmatched,
      output: normalized.map(row => ({ item: foundry.utils.deepClone(row.item), quantity: row.quantity }))
    };
  }

  static hasOutput(plan) {
    return Array.isArray(plan?.output) && plan.output.length > 0;
  }

  static outputPayload(plan) {
    return Array.isArray(plan?.output)
      ? plan.output.map(row => ({ item: foundry.utils.deepClone(row.item), quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)) }))
      : [];
  }

  static payloadFromItems(items=[]) {
    return (items ?? []).map(item => {
      const data = item?.toObject ? item.toObject() : foundry.utils.deepClone(item);
      if (!data) return null;
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      data.system ??= {};
      const quantity = this.quantityOf(item);
      data.system.quantity = 1;
      return { item: data, quantity };
    }).filter(Boolean);
  }

  static isPhysicalCandidate(item) {
    return this.PHYSICAL_ITEM_TYPES.has(String(item?.type ?? "").toLowerCase());
  }

  static isNaturalWeapon(item) {
    if (String(item?.type ?? "").toLowerCase() !== "weapon") return false;
    const values = [
      foundry.utils.getProperty(item, "system.type.value"),
      foundry.utils.getProperty(item, "system.type.baseItem"),
      foundry.utils.getProperty(item, "system.type.subtype")
    ].map(value => String(value ?? "").trim().toLowerCase());
    return values.includes("natural") || values.includes("naturalweapon") || values.includes("natural-weapon");
  }

  static quantityOf(item) {
    const quantity = Number(foundry.utils.getProperty(item, "system.quantity"));
    return Number.isFinite(quantity) && quantity > 0 ? Math.max(1, Math.floor(quantity)) : 1;
  }

  static async resolveBaseItem(item, sources=this.config().sources) {
    if (!item || !sources?.length) return null;
    const sourceType = String(item.type ?? "").toLowerCase();
    const identifier = this.normalizeKey(foundry.utils.getProperty(item, "system.identifier"));
    const baseItem = this.normalizeKey(foundry.utils.getProperty(item, "system.type.baseItem"));
    const name = this.normalizeKey(item.name);

    for (const collection of sources.slice(0, this.MAX_SOURCES)) {
      const pack = game.packs.get(collection);
      if (!pack || String(pack.documentName ?? pack.metadata?.type ?? "") !== "Item") continue;
      const index = await this.indexForPack(pack);
      let entry = null;

      if (identifier) entry = index.find(row => row.type === sourceType && row.identifier === identifier);
      if (!entry && baseItem) {
        entry = index.find(row => row.type === sourceType && (row.identifier === baseItem || row.baseItem === baseItem || row.name === baseItem));
      }
      if (!entry && name) entry = index.find(row => row.type === sourceType && row.name === name);
      if (!entry) continue;

      const document = await pack.getDocument(entry.id);
      if (!document) continue;
      if (this.isNaturalWeapon(document)) continue;
      return { collection: String(collection), document, entry };
    }
    return null;
  }

  static async indexForPack(pack) {
    const collection = String(pack.collection);
    const cached = this.indexCache.get(collection);
    if (cached) return cached;
    const raw = await pack.getIndex({ fields: ["type", "system.identifier", "system.type.value", "system.type.baseItem", "system.type.subtype"] });
    const rows = [...raw].map(entry => ({
      id: String(entry._id ?? entry.id ?? ""),
      type: String(entry.type ?? "").toLowerCase(),
      name: this.normalizeKey(entry.name),
      identifier: this.normalizeKey(foundry.utils.getProperty(entry, "system.identifier")),
      baseItem: this.normalizeKey(foundry.utils.getProperty(entry, "system.type.baseItem"))
    }));
    this.indexCache.set(collection, rows);
    return rows;
  }

  static normalizeKey(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
