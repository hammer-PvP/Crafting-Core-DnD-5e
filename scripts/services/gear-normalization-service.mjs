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
  static CROSSBOW_TARGETS = Object.freeze([
    Object.freeze({ key: "hand-crossbow", label: "Hand Crossbow", aliases: Object.freeze(["hand-crossbow", "handcrossbow"]) }),
    Object.freeze({ key: "light-crossbow", label: "Light Crossbow", aliases: Object.freeze(["light-crossbow", "lightcrossbow"]) }),
    Object.freeze({ key: "heavy-crossbow", label: "Heavy Crossbow", aliases: Object.freeze(["heavy-crossbow", "heavycrossbow"]) })
  ]);
  static indexCache = new Map();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.GEAR_NORMALIZATION, {
      name: "Crafting Core Gear Normalization",
      scope: "world",
      config: false,
      type: Object,
      default: { mode: this.MODES.NORMALIZE, sources: [], homebrew: { firearmsToCrossbows: false } }
    });
  }

  static config() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.GEAR_NORMALIZATION) ?? {};
    const validModes = new Set(Object.values(this.MODES));
    const mode = validModes.has(String(raw.mode)) ? String(raw.mode) : this.MODES.NORMALIZE;
    const available = new Set(this.availableItemPacks().map(pack => pack.collection));
    const sources = [...new Set((Array.isArray(raw.sources) ? raw.sources : []).map(String).filter(id => available.has(id)))].slice(0, this.MAX_SOURCES);
    const homebrew = {
      // Accept the short-lived top-level shape as a defensive migration path.
      firearmsToCrossbows: Boolean(raw?.homebrew?.firearmsToCrossbows ?? raw?.firearmsToCrossbows ?? false)
    };
    return { mode, sources, homebrew };
  }

  static async saveConfig({ mode=this.MODES.NORMALIZE, sources=[], homebrew={} }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can configure loot normalization.");
    const validModes = new Set(Object.values(this.MODES));
    const normalizedMode = validModes.has(String(mode)) ? String(mode) : this.MODES.NORMALIZE;
    const available = new Set(this.availableItemPacks().map(pack => pack.collection));
    const normalizedSources = [...new Set((sources ?? []).map(String).filter(id => available.has(id)))].slice(0, this.MAX_SOURCES);
    const value = {
      mode: normalizedMode,
      sources: normalizedSources,
      homebrew: { firearmsToCrossbows: Boolean(homebrew?.firearmsToCrossbows) }
    };
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
      .map(pack => {
        const packageType = String(pack.metadata?.packageType ?? "world");
        const packageName = String(pack.metadata?.packageName ?? pack.metadata?.package ?? "");
        const packLabel = String(pack.title ?? pack.metadata?.label ?? pack.collection);
        return {
          collection: String(pack.collection),
          label: packLabel,
          packLabel,
          sourceLabel: this.sourceDisplayName(packageType, packageName),
          sourceKind: this.sourceKindLabel(packageType),
          packageType,
          packageName,
          locked: Boolean(pack.locked)
        };
      })
      .sort((a, b) => {
        const source = a.sourceLabel.localeCompare(b.sourceLabel, game.i18n.lang);
        return source || a.packLabel.localeCompare(b.packLabel, game.i18n.lang);
      });
  }


  static sourceDisplayName(packageType, packageName) {
    const type = String(packageType ?? "world");
    const name = String(packageName ?? "");
    if (type === "system") {
      if (name === "dnd5e" || name === String(game.system?.id ?? "")) return "Dungeons & Dragons 5e";
      return this.cleanSourceTitle(game.system?.title ?? name ?? "System");
    }
    if (type === "module") {
      const title = String(game.modules?.get?.(name)?.title ?? name ?? "Module");
      return this.cleanSourceTitle(title);
    }
    return "World";
  }

  static cleanSourceTitle(value) {
    const title = String(value ?? "").trim();
    if (!title) return "Unknown Source";
    return title
      .replace(/^Dungeons\s*&\s*Dragons\s+/i, "")
      .replace(/^Dungeons\s+and\s+Dragons\s+/i, "")
      .replace(/^D&D\s+/i, "")
      .trim() || title;
  }

  static sourceKindLabel(packageType) {
    const type = String(packageType ?? "world");
    if (type === "system") return "System";
    if (type === "module") return "Module";
    return "World";
  }

  static async buildPlan(actor, { sourceItems=null }={}) {
    const { mode, sources, homebrew } = this.config();
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
        homebrew,
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
      const firearmConversion = Boolean(homebrew?.firearmsToCrossbows) && this.isFirearm(item);
      const match = firearmConversion
        ? await this.resolveRandomCrossbow(sources)
        : await this.resolveBaseItem(item, sources);
      if (!match) {
        unmatched.push({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
          type: String(item.type ?? ""),
          reason: firearmConversion ? "firearm-crossbow-unavailable" : "no-safe-base-match"
        });
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
        normalizationSource: match.collection,
        homebrewFirearmConversion: firearmConversion,
        firearmConvertedTo: firearmConversion ? String(match.target?.label ?? match.document?.name ?? "Crossbow") : ""
      };
      normalized.push({
        item: data,
        quantity: this.quantityOf(item),
        sourceItemId: String(item.id ?? ""),
        sourceItemName: String(item.name ?? ""),
        collection: match.collection,
        homebrewFirearmConversion: firearmConversion,
        convertedTo: firearmConversion ? String(match.target?.label ?? match.document?.name ?? "Crossbow") : ""
      });
    }

    return {
      mode,
      sources,
      homebrew,
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

  /**
   * Optional table homebrew: treat D&D5e Firearm weapons as abstract salvage
   * and replace the whole stack with one randomly selected official crossbow.
   * The Firearm property (`fir`) is the primary structured signal in D&D5e.
   */
  static isFirearm(item) {
    if (String(item?.type ?? "").toLowerCase() !== "weapon") return false;

    const rawProperties = foundry.utils.getProperty(item, "system.properties");
    const properties = rawProperties instanceof Set
      ? [...rawProperties]
      : Array.isArray(rawProperties)
        ? rawProperties
        : (rawProperties && typeof rawProperties === "object" ? Object.keys(rawProperties).filter(key => rawProperties[key]) : []);
    if (properties.map(value => String(value).toLowerCase()).includes("fir")) return true;

    const typeValue = String(foundry.utils.getProperty(item, "system.type.value") ?? "");
    const mappedType = String(globalThis.CONFIG?.DND5E?.weaponTypeMap?.[typeValue] ?? "").toLowerCase();
    const typeLabel = String(globalThis.CONFIG?.DND5E?.weaponTypes?.[typeValue] ?? "").toLowerCase();
    if (mappedType === "firearm" || typeLabel.includes("firearm") || this.normalizeKey(typeValue).includes("firearm")) return true;

    const identity = [
      foundry.utils.getProperty(item, "system.identifier"),
      foundry.utils.getProperty(item, "system.type.baseItem"),
      item?.name
    ].map(value => this.normalizeKey(value)).filter(Boolean).join(" ");
    return /(?:^|[- ])(?:firearm|pistol|musket|revolver|rifle|shotgun|blunderbuss)(?:$|[- ])/.test(identity);
  }

  static async resolveRandomCrossbow(sources=this.config().sources) {
    const targets = [...this.CROSSBOW_TARGETS];
    // Fisher-Yates gives each configured crossbow an equal first-choice chance.
    for (let i = targets.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [targets[i], targets[j]] = [targets[j], targets[i]];
    }
    for (const target of targets) {
      const match = await this.resolveSpecificWeapon(target, sources);
      if (match) return { ...match, target };
    }
    return null;
  }

  static async resolveSpecificWeapon(target, sources=this.config().sources) {
    const aliases = new Set((target?.aliases ?? []).map(value => this.normalizeKey(value)).filter(Boolean));
    if (!aliases.size) return null;
    for (const collection of (sources ?? []).slice(0, this.MAX_SOURCES)) {
      const pack = game.packs.get(collection);
      if (!pack || String(pack.documentName ?? pack.metadata?.type ?? "") !== "Item") continue;
      const index = await this.indexForPack(pack);
      const entry = index.find(row => row.type === "weapon" && (
        aliases.has(row.identifier) || aliases.has(row.baseItem) || aliases.has(row.name)
      ));
      if (!entry) continue;
      const document = await pack.getDocument(entry.id);
      if (!document || this.isNaturalWeapon(document)) continue;
      return { collection: String(collection), document, entry };
    }
    return null;
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
