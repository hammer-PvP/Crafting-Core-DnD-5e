import { MODULE_ID, SETTINGS } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";

/**
 * Builds and stores non-destructive per-Actor harvest metadata.
 * Source Actors and source Compendiums are read-only; Crafting Core stores its
 * analysis in one hidden world setting keyed by a stable profile id.
 */
export class HarvestProfileService {
  static SCAN_BATCH_SIZE = 8;
  static PHYSICAL_TAGS = Object.freeze([
    "flesh", "blood", "bone", "hide", "claw", "fang", "beak", "feather",
    "scale", "horn", "venom", "wing", "shell", "eye", "tentacle"
  ]);
  static ESSENCE_DAMAGE_TYPES = Object.freeze([
    "acid", "cold", "fire", "force", "lightning", "necrotic", "poison", "psychic", "radiant", "thunder"
  ]);
  static HARVEST_POOL_SPECS = Object.freeze([
    Object.freeze({ id: "common", position: 1, label: "Common", rarities: Object.freeze(["common"]) }),
    Object.freeze({ id: "uncommon", position: 2, label: "Uncommon", rarities: Object.freeze(["uncommon"]) }),
    Object.freeze({ id: "rare", position: 3, label: "Rare", rarities: Object.freeze(["rare"]) }),
    Object.freeze({ id: "high", position: 4, label: "Very Rare / Legendary", rarities: Object.freeze(["veryRare", "legendary"]) })
  ]);
  static MAX_AUTO_POOL_CANDIDATES = 5;

  static BASE_ANATOMY = Object.freeze({
    aberration: ["flesh", "blood", "bone", "eye"],
    beast: ["flesh", "blood", "bone", "hide", "eye"],
    celestial: ["flesh", "blood", "bone", "eye"],
    dragon: ["flesh", "blood", "bone", "hide", "scale", "claw", "eye", "wing"],
    fey: ["flesh", "blood", "bone", "eye"],
    fiend: ["flesh", "blood", "bone", "eye"],
    giant: ["flesh", "blood", "bone", "hide", "eye"],
    humanoid: ["flesh", "blood", "bone", "hide", "eye"],
    monstrosity: ["flesh", "blood", "bone", "hide", "eye"],
    ooze: ["amorphous"],
    plant: ["plant"],
    elemental: [],
    construct: [],
    undead: []
  });

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.HARVEST_PROFILES, {
      name: "Crafting Core Harvest Profiles",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
    game.settings.register(MODULE_ID, SETTINGS.SCANNER_SOURCES, {
      name: "Crafting Core Creature Scanner Sources",
      scope: "world",
      config: false,
      type: Object,
      default: { selected: [] }
    });
  }

  static raw() {
    const value = game.settings.get(MODULE_ID, SETTINGS.HARVEST_PROFILES);
    return value && typeof value === "object" && !Array.isArray(value)
      ? foundry.utils.deepClone(value)
      : {};
  }

  static list() {
    return Object.values(this.raw())
      .map(profile => this.#normalizeProfile(profile))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));
  }

  static get(id) {
    const profile = this.raw()[String(id)];
    return profile ? this.#normalizeProfile(profile) : null;
  }

  static getBySourceUuid(uuid) {
    return this.list().find(profile => profile.sourceUuid === String(uuid)) ?? null;
  }

  /** Resolve the last scanned Harvest Profile for a live/world/synthetic Actor. */
  static getForActor(actor) {
    if (!actor) return null;
    const profiles = this.list();
    const candidates = new Set();
    const add = value => {
      const text = String(value ?? "").trim();
      if (text) candidates.add(text);
    };

    add(actor.uuid);
    add(actor._stats?.compendiumSource);
    add(actor._source?._stats?.compendiumSource);
    add(actor.flags?.core?.sourceId);
    try { add(actor.getFlag?.("core", "sourceId")); } catch (_) {}

    for (const uuid of candidates) {
      const direct = profiles.find(profile => profile.sourceUuid === uuid);
      if (direct) return direct;
    }

    // Compendium imports commonly preserve the original document id even when
    // their runtime UUID becomes Actor.<id>. Only accept a unique source-id hit.
    const actorId = String(actor.id ?? "");
    if (actorId) {
      const byId = profiles.filter(profile => String(profile.sourceId ?? "") === actorId);
      if (byId.length === 1) return byId[0];
    }

    // Conservative last resort for imported copies whose source metadata was
    // stripped: same name + D&D5e creature type + CR, and only when unique.
    const name = String(actor.name ?? "").trim().toLowerCase();
    const creatureType = String(foundry.utils.getProperty(actor, "system.details.type.value") ?? "").toLowerCase();
    const cr = Number(foundry.utils.getProperty(actor, "system.details.cr") ?? 0) || 0;
    const identity = profiles.filter(profile =>
      String(profile.name ?? "").trim().toLowerCase() === name
      && String(profile.creatureType ?? "").toLowerCase() === creatureType
      && Number(profile.cr ?? 0) === cr
    );
    return identity.length === 1 ? identity[0] : null;
  }

  static isActorHarvestEligible(actor) {
    return Boolean(this.getForActor(actor));
  }

  static async save(profile) {
    if (!game.user?.isGM) throw new Error("Only a GM can edit Harvest Profiles.");
    const normalized = this.#normalizeProfile(profile);
    const all = this.raw();
    all[normalized.id] = normalized;
    await game.settings.set(MODULE_ID, SETTINGS.HARVEST_PROFILES, all);
    Hooks.callAll(`${MODULE_ID}.harvestProfilesChanged`, normalized.id);
    return normalized;
  }

  static async delete(id) {
    if (!game.user?.isGM) throw new Error("Only a GM can delete Harvest Profiles.");
    const all = this.raw();
    delete all[String(id)];
    await game.settings.set(MODULE_ID, SETTINGS.HARVEST_PROFILES, all);
    Hooks.callAll(`${MODULE_ID}.harvestProfilesChanged`, String(id));
  }

  static async migrateStoredProfilesToPools() {
    if (!game.user?.isGM) return { migrated: 0 };
    const all = this.raw();
    let migrated = 0;
    for (const [id, profile] of Object.entries(all)) {
      const legacy = Array.isArray(profile?.slots) && profile.slots.some(slot => slot?.materialId && !Array.isArray(slot?.materialIds));
      if (!legacy) continue;
      all[id] = this.#normalizeProfile(profile);
      migrated += 1;
    }
    if (migrated) {
      await game.settings.set(MODULE_ID, SETTINGS.HARVEST_PROFILES, all);
      Hooks.callAll(`${MODULE_ID}.harvestProfilesChanged`, null);
    }
    return { migrated };
  }

  /** Return Actor Compendiums which are compatible or not explicitly system-bound elsewhere. */
  static availableActorPacks() {
    const packs = Array.isArray(game.packs?.contents)
      ? game.packs.contents
      : (typeof game.packs?.values === "function" ? [...game.packs.values()] : [...(game.packs ?? [])]);
    return packs
      .filter(pack => {
        const documentName = String(pack.documentName ?? pack.metadata?.type ?? "");
        if (documentName !== "Actor") return false;
        const system = String(pack.metadata?.system ?? "");
        return !system || system === game.system?.id;
      })
      .map(pack => {
        const collection = String(pack.collection);
        const prefix = collection.split(".")[0] ?? "";
        let packageType = String(pack.metadata?.packageType ?? "");
        let packageName = String(pack.metadata?.packageName ?? pack.metadata?.package ?? "");
        if (!packageType) {
          if (prefix && prefix === String(game.system?.id ?? "")) packageType = "system";
          else if (prefix && game.modules?.has?.(prefix)) packageType = "module";
          else packageType = "world";
        }
        if (!packageName && packageType !== "world") packageName = prefix;
        return {
          collection,
          label: String(pack.title ?? pack.metadata?.label ?? collection),
          packageType,
          packageName,
          locked: Boolean(pack.locked)
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  /** Group compatible Actor Compendiums by their owning content source.
   * Module/system sources are selected once; world Actor Compendiums remain individual sources.
   */
  static availableScannerSources() {
    const groups = new Map();
    for (const pack of this.availableActorPacks()) {
      const packageType = String(pack.packageType || "world");
      const packageName = String(pack.packageName || "");
      const worldLike = packageType === "world" || !packageName;
      const id = worldLike ? `world:${pack.collection}` : `${packageType}:${packageName}`;
      const source = groups.get(id) ?? {
        id,
        packageType: worldLike ? "world" : packageType,
        packageName: worldLike ? "" : packageName,
        label: worldLike ? pack.label : this.#packageLabel(packageType, packageName),
        detail: worldLike ? "World Actor Compendium" : this.title(packageType),
        collections: [],
        packLabels: []
      };
      source.collections.push(pack.collection);
      source.packLabels.push(pack.label);
      groups.set(id, source);
    }
    return [...groups.values()]
      .map(source => ({ ...source, collections: [...new Set(source.collections)], packLabels: [...new Set(source.packLabels)] }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  static scannerSourceConfig() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.SCANNER_SOURCES);
    const selected = Array.isArray(raw?.selected) ? raw.selected.map(String).filter(Boolean) : [];
    return { selected: [...new Set(selected)] };
  }

  static async saveScannerSourceConfig(selected=[]) {
    if (!game.user?.isGM) throw new Error("Only a GM can configure Creature Scanner sources.");
    const available = new Set(this.availableScannerSources().map(source => source.id));
    const normalized = [...new Set((selected ?? []).map(String).filter(id => available.has(id)))];
    await game.settings.set(MODULE_ID, SETTINGS.SCANNER_SOURCES, { selected: normalized });
    Hooks.callAll(`${MODULE_ID}.scannerSourcesChanged`, normalized);
    return { selected: normalized };
  }

  static configuredScannerSources() {
    const sources = new Map(this.availableScannerSources().map(source => [source.id, source]));
    return this.scannerSourceConfig().selected.map(id => sources.get(id)).filter(Boolean);
  }

  static configuredActorPacks() {
    const available = new Map(this.availableActorPacks().map(pack => [pack.collection, pack]));
    const result = [];
    const used = new Set();
    const sources = this.configuredScannerSources();
    for (let sourcePriority = 0; sourcePriority < sources.length; sourcePriority += 1) {
      const source = sources[sourcePriority];
      for (let packPriority = 0; packPriority < source.collections.length; packPriority += 1) {
        const collection = source.collections[packPriority];
        if (used.has(collection)) continue;
        const pack = available.get(collection);
        if (!pack) continue;
        used.add(collection);
        result.push({ ...pack, sourceId: source.id, sourceLabel: source.label, sourcePriority, packPriority });
      }
    }
    return result;
  }

  static scannerSourceSummary() {
    const sources = this.configuredScannerSources();
    const packs = this.configuredActorPacks();
    return {
      sourceCount: sources.length,
      packCount: packs.length,
      labels: sources.map(source => source.label)
    };
  }

  static #packageLabel(packageType, packageName) {
    if (packageType === "module") return String(game.modules?.get?.(packageName)?.title ?? packageName);
    if (packageType === "system") {
      if (String(game.system?.id ?? "") === packageName) return String(game.system?.title ?? packageName);
      return packageName;
    }
    return packageName || this.title(packageType);
  }

  /**
   * Scan selected Actor Compendiums. Index data pre-filters NPCs before the
   * detailed pass loads full documents in small batches for embedded attacks/features.
   */
  static async scanPacks(collections=[], { onProgress=null }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can scan creature Compendiums.");
    const requested = [...new Set((collections ?? []).map(String).filter(Boolean))];
    if (!requested.length) throw new Error("Choose at least one Actor Compendium to scan.");

    const materials = await MaterialCatalogService.allEntries();
    const creatureNatures = new Set(materials.filter(m => m.family === "creature").map(m => m.nature));
    const existing = this.raw();
    const existingByUuid = new Map(Object.values(existing).map(profile => [String(profile.sourceUuid), profile]));
    const configuredPackMeta = new Map(this.configuredActorPacks().map(pack => [pack.collection, pack]));
    const candidates = [];
    const skippedPacks = [];

    for (const collection of requested) {
      const pack = game.packs.get(collection);
      if (!pack || String(pack.documentName ?? pack.metadata?.type ?? "") !== "Actor") {
        skippedPacks.push(collection);
        continue;
      }
      const fields = [
        "type", "img", "system.details.type.value", "system.details.type.subtype",
        "system.details.type.custom", "system.details.cr", "system.details.type.swarm",
        "system.attributes.movement", "system.traits.size"
      ];
      const index = await pack.getIndex({ fields });
      for (const entry of index) {
        const actorType = String(entry.type ?? "");
        const creatureType = String(foundry.utils.getProperty(entry, "system.details.type.value") ?? "");
        if (actorType && actorType !== "npc") continue;
        if (creatureType && !creatureNatures.has(creatureType)) continue;
        candidates.push({ pack, id: entry._id ?? entry.id, entry });
      }
    }

    let completed = 0;
    let scanned = 0;
    let skipped = 0;
    let failed = 0;
    const failures = [];
    const total = candidates.length;
    onProgress?.({ completed, total, phase: "index", scanned, skipped, failed });

    for (let offset = 0; offset < candidates.length; offset += this.SCAN_BATCH_SIZE) {
      const batch = candidates.slice(offset, offset + this.SCAN_BATCH_SIZE);
      const results = await Promise.all(batch.map(async candidate => {
        try {
          const actor = await candidate.pack.getDocument(candidate.id);
          if (!actor || String(actor.type) !== "npc") return { status: "skipped" };
          const creatureType = String(actor.system?.details?.type?.value ?? "");
          if (!creatureNatures.has(creatureType)) return { status: "skipped" };
          const previous = existingByUuid.get(String(actor.uuid));
          const profile = await this.analyzeActor(actor, { materials, previous });
          profile.sourcePack = candidate.pack.collection;
          profile.sourcePackLabel = String(candidate.pack.title ?? candidate.pack.metadata?.label ?? candidate.pack.collection);
          const sourceMeta = configuredPackMeta.get(candidate.pack.collection);
          profile.sourceId = String(sourceMeta?.sourceId ?? "");
          profile.sourceLabel = String(sourceMeta?.sourceLabel ?? profile.sourcePackLabel);
          profile.sourcePriority = Number(sourceMeta?.sourcePriority ?? 9999);
          return { status: "scanned", profile };
        } catch (error) {
          return { status: "failed", error, candidate };
        }
      }));

      for (const result of results) {
        completed += 1;
        if (result.status === "scanned") {
          existing[result.profile.id] = result.profile;
          existingByUuid.set(result.profile.sourceUuid, result.profile);
          scanned += 1;
        } else if (result.status === "failed") {
          failed += 1;
          const label = result.candidate?.entry?.name ?? result.candidate?.id ?? "Actor";
          failures.push(`${label}: ${result.error?.message ?? result.error}`);
          console.warn(`${MODULE_ID} | Creature scan failed for ${label}.`, result.error);
        } else skipped += 1;
      }
      onProgress?.({ completed, total, phase: "documents", scanned, skipped, failed });
    }

    await game.settings.set(MODULE_ID, SETTINGS.HARVEST_PROFILES, existing);
    Hooks.callAll(`${MODULE_ID}.harvestProfilesChanged`, null);
    return { packs: requested.length, skippedPacks, total, scanned, skipped, failed, failures };
  }

  static async reanalyze(id) {
    if (!game.user?.isGM) throw new Error("Only a GM can reanalyze Harvest Profiles.");
    const current = this.get(id);
    if (!current) throw new Error("Harvest Profile could not be resolved.");
    const resolver = globalThis.fromUuid ?? foundry.utils?.fromUuid;
    if (typeof resolver !== "function") throw new Error("Foundry UUID resolver is unavailable.");
    const actor = await resolver(current.sourceUuid);
    if (!actor) throw new Error("The source Actor is no longer available.");
    const profile = await this.analyzeActor(actor, { previous: current });
    profile.sourcePack = current.sourcePack;
    profile.sourcePackLabel = current.sourcePackLabel;
    profile.sourceId = current.sourceId;
    profile.sourceLabel = current.sourceLabel;
    profile.sourcePriority = current.sourcePriority;
    return this.save(profile);
  }

  /** Analyze one D&D5e NPC into deterministic anatomy, four rarity pools, and one separate Essence slot. */
  static async analyzeActor(actor, { materials=null, previous=null }={}) {
    const entries = materials ?? await MaterialCatalogService.allEntries();
    const nature = String(actor.system?.details?.type?.value ?? "").toLowerCase();
    const available = entries.filter(entry => entry.family === "creature" && entry.nature === nature);
    if (!available.length) throw new Error(`No curated Creature Harvest materials exist for type "${nature || "unknown"}".`);

    const analysis = this.#inferAnatomy(actor, nature);
    const essenceAnalysis = this.#inferEssenceAffinities(actor);
    analysis.essenceAffinities = essenceAnalysis.affinities;
    analysis.essenceReasons = essenceAnalysis.reasons;
    const cr = Number(actor.system?.details?.cr ?? 0) || 0;
    const legendarySource = cr >= 17
      || Number(actor.system?.resources?.legact?.max ?? 0) > 0
      || Number(actor.system?.resources?.legres?.max ?? 0) > 0
      || Boolean(actor.system?.resources?.lair?.value);
    if (legendarySource) analysis.reasons.push("High-tier source detected from CR, Legendary Actions/Resistance, or Lair data; Legendary materials may enter the Very Rare / Legendary pool.");
    analysis.legendarySource = legendarySource;
    analysis.harvestSignals = this.#inferHarvestSignals(actor, essenceAnalysis.affinities);
    const slots = this.#buildAutomaticPools(available, analysis, legendarySource);
    const essenceSlot = this.#buildEssenceSlot(analysis.essenceAffinities);
    const oldPinpoint = Array.isArray(previous?.pinpointOverrides) ? previous.pinpointOverrides : [];

    return this.#normalizeProfile({
      id: previous?.id ?? foundry.utils.randomID(20),
      sourceUuid: String(actor.uuid),
      sourcePack: previous?.sourcePack ?? String(actor.pack ?? ""),
      sourcePackLabel: previous?.sourcePackLabel ?? "",
      sourceId: previous?.sourceId ?? "",
      sourceLabel: previous?.sourceLabel ?? "",
      sourcePriority: previous?.sourcePriority ?? 9999,
      name: String(actor.name ?? "Creature"),
      img: String(actor.img ?? "icons/svg/mystery-man.svg"),
      actorType: String(actor.type ?? "npc"),
      creatureType: nature,
      creatureTypeLabel: this.creatureTypeLabel(nature),
      subtype: String(actor.system?.details?.type?.subtype ?? actor.system?.details?.type?.custom ?? ""),
      cr,
      size: String(actor.system?.traits?.size ?? ""),
      analysis,
      slots,
      essenceSlot,
      pinpointOverrides: oldPinpoint,
      analyzedAt: Date.now()
    });
  }

  static creatureTypeLabel(value) {
    const key = String(value ?? "");
    const config = CONFIG.DND5E?.creatureTypes?.[key];
    if (!config) return this.title(key);
    const label = typeof config.label === "string" ? config.label : key;
    return game.i18n?.localize?.(label) ?? label;
  }

  static damageTypeLabel(value) {
    const key = String(value ?? "").toLowerCase();
    const config = CONFIG.DND5E?.damageTypes?.[key];
    if (!config) return this.title(key);
    const label = typeof config.label === "string" ? config.label : key;
    return game.i18n?.localize?.(label) ?? label;
  }

  static async materialOptions({ nature=null, includeAll=false }={}) {
    const entries = await MaterialCatalogService.allEntries();
    return entries
      .filter(entry => includeAll || (entry.family === "creature" && (!nature || entry.nature === nature)))
      .sort((a, b) => {
        const ar = MaterialCatalogService.RARITIES.indexOf(a.rarity);
        const br = MaterialCatalogService.RARITIES.indexOf(b.rarity);
        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name, game.i18n.lang);
      })
      .map(entry => ({
        value: entry.id,
        label: `[${entry.rarityLabel}] ${entry.name}`,
        name: entry.name,
        rarity: entry.rarity,
        rarityLabel: entry.rarityLabel,
        chance: entry.chance,
        quantity: entry.quantity,
        img: entry.img
      }));
  }

  static async hydrateProfile(profile) {
    const normalized = this.#normalizeProfile(profile);
    const materials = await MaterialCatalogService.allEntries();
    const map = new Map(materials.map(entry => [entry.id, entry]));
    normalized.slots = normalized.slots.map((slot, index) => ({
      ...slot,
      index: index + 1,
      selectedMaterials: slot.materialIds.map(materialId => {
        const material = map.get(String(materialId));
        return {
          materialId: String(materialId),
          name: material?.name ?? "Missing Material",
          img: material?.img ?? "icons/svg/item-bag.svg",
          rarity: material?.rarity ?? "common",
          rarityLabel: material?.rarityLabel ?? "Missing",
          missing: !material
        };
      })
    }));
    normalized.essenceSlot = {
      ...normalized.essenceSlot,
      affinities: normalized.essenceSlot.affinities.map(row => ({ ...row, label: this.damageTypeLabel(row.type) }))
    };
    normalized.pinpointOverrides = normalized.pinpointOverrides.map((row, index) => this.#hydrateRow(row, map, index + 1, true));
    return normalized;
  }

  static title(value) {
    return String(value ?? "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  static #hydrateRow(row, map, index, pinpoint=false) {
    const material = map.get(String(row.materialId));
    return {
      ...row,
      index,
      pinpoint,
      name: material?.name ?? row.name ?? "Missing Material",
      img: material?.img ?? row.img ?? "icons/svg/item-bag.svg",
      rarity: material?.rarity ?? row.rarity ?? "common",
      rarityLabel: material?.rarityLabel ?? MaterialCatalogService.rarityLabel(row.rarity),
      missing: !material
    };
  }

  static #buildAutomaticPools(materials, analysis, legendarySource=false) {
    const anatomySet = new Set(analysis?.anatomy ?? []);
    const signalSet = new Set(analysis?.harvestSignals ?? []);

    return this.HARVEST_POOL_SPECS.map(spec => {
      const allowedRarities = spec.id === "high" && !legendarySource ? ["veryRare"] : [...spec.rarities];
      const candidates = materials
        .filter(material => allowedRarities.includes(material.rarity))
        .filter(material => this.#requirementsSatisfied(material.requires, anatomySet))
        .filter(material => this.#specialtySatisfied(material, signalSet))
        .sort((a, b) => this.#materialScore(b, anatomySet, signalSet, allowedRarities) - this.#materialScore(a, anatomySet, signalSet, allowedRarities)
          || a.id.localeCompare(b.id))
        .slice(0, this.MAX_AUTO_POOL_CANDIDATES);
      const chance = candidates.length ? Math.max(...candidates.map(material => Number(material.chance ?? 0) || 0)) : 0;
      return {
        id: spec.id,
        position: spec.position,
        label: spec.label,
        rarities: [...spec.rarities],
        materialIds: candidates.map(material => material.id),
        materialId: candidates[0]?.id ?? "",
        chance,
        quantityOverrides: {},
        generated: true
      };
    });
  }

  static #specialtySatisfied(material, signalSet) {
    const tags = new Set((material?.tags ?? []).map(value => String(value).toLowerCase()));
    // Specialty organ materials should require evidence; generic anatomical materials remain broadly eligible.
    if (tags.has("psionic") && !signalSet.has("psionic")) return false;
    if (material?.id === "monstrosity-arcane-organ" && !signalSet.has("arcane")) return false;
    return true;
  }

  static #requirementsSatisfied(requires, anatomySet) {
    const list = (requires ?? []).map(value => String(value).toLowerCase()).filter(Boolean);
    return !list.length || list.every(requirement => anatomySet.has(requirement));
  }

  static #materialScore(material, anatomySet, signalSet, rarityOrder) {
    const requires = material.requires ?? [];
    const tags = material.tags ?? [];
    const rarityPriority = Math.max(0, rarityOrder.length - rarityOrder.indexOf(material.rarity));
    const requirementScore = requires.reduce((score, requirement) => score + (anatomySet.has(requirement) ? 30 : 0), 0);
    const signalScore = tags.reduce((score, tag) => score + (signalSet.has(String(tag).toLowerCase()) ? 12 : 0), 0);
    return requirementScore + requires.length * 12 + signalScore + rarityPriority;
  }

  static #buildEssenceSlot(affinities=[]) {
    const rows = (affinities ?? []).map(row => ({
      type: String(row?.type ?? "").toLowerCase(),
      weight: Math.max(1, Number(row?.weight ?? row?.score ?? 1) || 1),
      score: Math.max(1, Number(row?.score ?? row?.weight ?? 1) || 1),
      reasons: [...new Set((row?.reasons ?? []).map(String).filter(Boolean))]
    })).filter(row => this.ESSENCE_DAMAGE_TYPES.includes(row.type));
    const hasSpecific = rows.length > 0;
    return {
      enabled: true,
      position: 5,
      label: "Essence",
      quantity: "1",
      arcaneChance: hasSpecific ? 45 : 50,
      specificChance: hasSpecific ? 55 : 0,
      emptyChance: hasSpecific ? 0 : 50,
      affinities: rows
    };
  }

  /**
   * Infer magical/elemental harvesting affinities from structured D&D5e mechanics.
   * Non-spell attacks/features are strong evidence; resistance and immunity are also
   * valid affinity signals. Physical damage types are deliberately ignored.
   */
  static #inferEssenceAffinities(actor) {
    const allowed = new Set(this.ESSENCE_DAMAGE_TYPES);
    const scores = new Map();
    const reasons = new Map();
    const add = (type, weight, reason) => {
      const key = String(type ?? "").toLowerCase();
      if (!allowed.has(key)) return;
      scores.set(key, (scores.get(key) ?? 0) + Math.max(0, Number(weight) || 0));
      const list = reasons.get(key) ?? [];
      if (reason && !list.includes(reason)) list.push(reason);
      reasons.set(key, list);
    };

    for (const type of this.#collectionValues(actor.system?.traits?.dr?.value)) {
      add(type, 2, `${this.damageTypeLabel(type)} resistance detected.`);
    }
    for (const type of this.#collectionValues(actor.system?.traits?.di?.value)) {
      add(type, 3, `${this.damageTypeLabel(type)} immunity detected.`);
    }

    for (const item of actor.items ?? []) {
      const itemType = String(item.type ?? "").toLowerCase();
      // A prepared spell alone does not define what the creature can be harvested for.
      if (itemType === "spell") continue;
      let foundActivityDamage = false;
      const activities = item.system?.activities;
      if (activities) {
        for (const activity of activities) {
          const activityType = String(activity?.type ?? "").toLowerCase();
          if (!["attack", "save", "damage"].includes(activityType)) continue;
          const source = activity?.toObject?.() ?? activity;
          const damage = source?.damage ?? activity?.damage;
          const types = this.#damageTypesFromData(damage);
          if (!types.length) continue;
          foundActivityDamage = true;
          for (const type of types) {
            add(type, 4, `${this.damageTypeLabel(type)} damage detected in ${String(activity?.name ?? item.name ?? "a non-spell activity")}.`);
          }
        }
      }

      // Older or item-level D&D5e damage data remains a fallback when no structured
      // activity on this Item exposed a damage type.
      if (!foundActivityDamage) {
        const itemSource = item.toObject?.() ?? item;
        for (const type of this.#damageTypesFromData(itemSource?.system?.damage ?? item.system?.damage)) {
          add(type, 3, `${this.damageTypeLabel(type)} damage detected on ${String(item.name ?? "an Actor Item")}.`);
        }
      }
    }

    const affinities = [...scores.entries()]
      .filter(([, score]) => score > 0)
      .map(([type, score]) => ({ type, score, weight: score, reasons: reasons.get(type) ?? [] }))
      .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type));

    const summary = affinities.length
      ? affinities.map(row => `${this.damageTypeLabel(row.type)} (${row.score})`).join(", ")
      : "No non-physical damage affinity was found in non-spell attacks, resistances, or immunities; Arcane Essence fallback will be used.";
    return { affinities, reasons: [summary] };
  }

  static #damageTypesFromData(data) {
    const allowed = new Set(this.ESSENCE_DAMAGE_TYPES);
    const found = new Set();
    const addValue = value => {
      for (const raw of this.#collectionValues(value)) {
        const type = String(raw ?? "").toLowerCase();
        if (allowed.has(type)) found.add(type);
      }
    };
    const visit = (value, key="") => {
      if (value == null) return;
      if (Array.isArray(value)) {
        // Legacy damage parts can be [formula, type].
        if (value.length === 2 && typeof value[1] === "string") addValue(value[1]);
        for (const child of value) visit(child, key);
        return;
      }
      if (value instanceof Set) {
        addValue(value);
        return;
      }
      if (typeof value !== "object") {
        if (["type", "types"].includes(key)) addValue(value);
        return;
      }
      for (const [childKey, child] of Object.entries(value)) {
        const normalizedKey = String(childKey).toLowerCase();
        if (["type", "types"].includes(normalizedKey)) addValue(child);
        if (["parts", "base", "damage", "bonus", "critical", "scaling", "type", "types"].includes(normalizedKey)) visit(child, normalizedKey);
      }
    };
    visit(data);
    return [...found];
  }

  static #collectionValues(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap(entry => this.#collectionValues(entry));
    if (value instanceof Set) return [...value];
    if (typeof value === "string" || typeof value === "number") return [value];
    if (typeof value?.values === "function") {
      try { return [...value.values()]; } catch (_) { /* fall through */ }
    }
    if (typeof value === "object") {
      return Object.entries(value)
        .filter(([, enabled]) => enabled === true || enabled === 1)
        .map(([key]) => key);
    }
    return [];
  }

  static #inferHarvestSignals(actor, essenceAffinities=[]) {
    const signals = new Set();
    const corpus = this.#actorCorpus(actor);
    const all = `${corpus.identity} | ${corpus.structural} | ${corpus.attacks}`;
    const addIf = (signal, terms) => { if (terms.some(term => all.includes(term))) signals.add(signal); };
    addIf("psionic", ["psionic", "psychic", "telepathy", "telepathic", "mind blast", "mind", "psi"]);
    addIf("arcane", ["arcane", "magic resistance", "magic weapon", "spellcasting", "innate spellcasting", "rune", "runic"]);
    addIf("elemental", ["elemental", "flame", "fire", "frost", "lightning", "thunder", "acid"]);
    for (const row of essenceAffinities ?? []) {
      const type = String(row?.type ?? "").toLowerCase();
      if (type === "psychic") signals.add("psionic");
      if (["acid","cold","fire","lightning","thunder"].includes(type)) signals.add("elemental");
    }
    // Native spell activities are strong enough evidence that a creature is magically active,
    // but do not by themselves invent a physical organ. They only unlock specialty candidates
    // whose anatomical requirement is independently satisfied.
    if ((actor.items ?? []).some(item => String(item.type ?? "").toLowerCase() === "spell")) signals.add("arcane");
    return [...signals].sort();
  }

  static #inferAnatomy(actor, nature) {
    const anatomy = new Set(this.BASE_ANATOMY[nature] ?? []);
    const reasons = [];
    const add = (tag, reason) => {
      if (!anatomy.has(tag) && reason) reasons.push(reason);
      anatomy.add(tag);
    };
    const remove = (...tags) => tags.forEach(tag => anatomy.delete(tag));

    if (anatomy.size) reasons.push(`${this.creatureTypeLabel(nature)} family baseline anatomy.`);
    if (nature === "ooze") reasons.push("Ooze creature type provides a strong amorphous baseline.");
    if (nature === "plant") reasons.push("Plant creature type provides a strong plant-body baseline.");

    const corpus = this.#actorCorpus(actor);
    const contains = (text, patterns) => patterns.some(pattern => text.includes(pattern));
    const identityHas = patterns => contains(corpus.identity, patterns);
    const structuralHas = patterns => contains(corpus.structural, patterns);
    const attackHas = patterns => contains(corpus.attacks, patterns);
    const bodyHas = patterns => identityHas(patterns) || structuralHas(patterns) || attackHas(patterns);

    // Anatomy signals only use identity, structural features, and actual attack/activity data.
    // Spell names and other incidental text live in corpus.weak and never establish anatomy by themselves.
    const signals = [
      ["claw", ["claw", "talon", "garra", "garras"]],
      ["fang", ["fang", "bite", "teeth", "jaws", "mordida", "presa", "presas", "mandibula", "mandibulas"]],
      ["beak", ["beak", "bico"]],
      ["feather", ["feather", "feathers", "plumage", "pena", "penas", "plumagem"]],
      ["scale", ["scale", "scales", "scaled", "escama", "escamas"]],
      ["horn", ["horn", "horns", "gore", "antler", "antlers", "chifre", "chifres", "galhada"]],
      ["wing", ["wing", "wings", "asa", "asas"]],
      ["shell", ["shell", "carapace", "exoskeleton", "casco", "carapaca"]],
      ["eye", ["eye", "eyes", "eyestalk", "olho", "olhos"]],
      ["tentacle", ["tentacle", "tentacles", "tentaculo", "tentaculos"]]
    ];
    for (const [tag, patterns] of signals) {
      // NPC natural attacks are sometimes stored as Weapon Items whose names carry the only
      // anatomical clue (Beak, Claw, Bite, Talon). Use equipment text only for these explicit
      // anatomy patterns; it is not added to the general body corpus.
      if (bodyHas(patterns) || contains(corpus.equipment, patterns)) add(tag, `${this.title(tag)} anatomy detected from identity, structural features, or natural-attack data.`);
    }

    if (attackHas(["venom", "poison", "sting", "stinger", "veneno", "venenoso", "ferrao"])
      || contains(corpus.equipment, ["venom", "poison", "sting", "stinger", "veneno", "venenoso", "ferrao"])) {
      add("venom", "Venom/poison delivery detected in an attack or activity.");
    }

    const hardIncorporealIdentity = identityHas([
      "ghost", "specter", "spectre", "wraith", "banshee", "phantom", "apparition",
      "fantasma", "espectro", "aparicao", "espirito desencarnado"
    ]);
    const hardIncorporealFeature = structuralHas([
      "incorporeal movement", "incorporeal form", "incorporeal", "movimento incorporeo", "forma incorporea"
    ]);
    const hardIncorporeal = hardIncorporealIdentity || hardIncorporealFeature;
    const physicalEquipment = corpus.equipment.length > 0;
    if (physicalEquipment) reasons.push("Physical weapon/equipment data supports a corporeal interaction model, but does not define anatomy by itself.");

    // Apply a structural incorporeal classification across creature families only when evidence is strong.
    // Weak words in spells such as spirit/spectral/phantom never trigger this branch.
    if (hardIncorporeal) {
      remove(...this.PHYSICAL_TAGS, "mechanical", "metal", "mineral", "crystal", "plant", "amorphous");
      add("incorporeal", hardIncorporealFeature
        ? "A structural incorporeal feature was detected."
        : "The Actor identity explicitly describes an incorporeal creature.");
    }

    if (nature === "undead" && !hardIncorporeal) {
      const skeletalIdentity = identityHas([
        "skeleton", "skeletal", "bone", "bones", "skull", "demilich", "demi-lich",
        "esqueleto", "esqueletico", "osseo", "cranio"
      ]);
      const physicalUndeadIdentity = identityHas([
        "zombie", "ghoul", "ghast", "mummy", "mummy lord", "lich", "death knight", "undead knight",
        "vampire", "wight", "revenant", "deathlock", "zumbi", "carnical", "mumia", "vampiro", "cavaleiro morto"
      ]);

      if (skeletalIdentity) {
        remove("flesh", "blood", "hide", "venom");
        add("bone", "Skeletal identity detected; flesh and blood were excluded.");
      } else {
        // Corporeal undead fallback is intentional: if an undead is not strongly identified as incorporeal
        // or skeletal, a physical remains model is safer than treating incidental spell language as morphology.
        add("flesh", physicalUndeadIdentity ? "Corporeal undead identity supports preserved/decayed flesh." : "Corporeal undead family fallback.");
        add("blood", physicalUndeadIdentity ? "Corporeal undead identity supports physical remains." : "Corporeal undead family fallback.");
        add("bone", physicalUndeadIdentity ? "Corporeal undead identity supports a skeletal structure." : "Corporeal undead family fallback.");
      }
    }

    if (nature === "construct" && !hardIncorporeal) {
      const fleshConstruct = identityHas(["flesh golem", "flesh construct", "golem de carne"])
        || structuralHas(["flesh construct", "flesh body"]);
      const stoneConstruct = bodyHas(["stone golem", "stone", "rock", "granite", "pedra", "rocha"]);
      const crystalConstruct = bodyHas(["crystal", "crystalline", "cristal"]);
      const metalConstruct = bodyHas(["iron golem", "iron", "steel", "metal", "clockwork", "automaton", "mechanical", "animated armor", "armadura animada", "ferro", "aco", "metalico", "mecanico", "automato"]);
      if (fleshConstruct) {
        add("flesh", "Flesh-construct morphology detected.");
        add("blood", "Flesh-construct morphology detected.");
        add("bone", "Flesh-construct morphology detected.");
      } else if (crystalConstruct) {
        add("crystal", "Crystal construct morphology detected.");
        add("mineral", "Crystal construct morphology detected.");
      } else if (stoneConstruct) {
        add("mineral", "Stone/mineral construct morphology detected.");
      } else if (metalConstruct) {
        add("metal", "Metal construct morphology detected.");
        add("mechanical", "Mechanical/automaton morphology detected.");
      } else {
        // No invented metal body: generic construct materials in the catalog have no anatomy requirement.
        reasons.push("Construct material was not explicit; no metal/stone/flesh anatomy was invented.");
      }
    }

    if (nature === "elemental" && !hardIncorporeal) {
      if (bodyHas(["earth", "stone", "rock", "crystal", "terra", "pedra", "rocha", "cristal"])) add("mineral", "Earth/stone elemental morphology detected.");
      if (bodyHas(["water", "liquid", "agua", "liquido"])) add("amorphous", "Liquid elemental morphology detected.");
    }

    if (nature !== "construct" && !hardIncorporeal && bodyHas(["hide", "pelt", "fur", "pele", "couro", "pelagem"])) {
      add("hide", "Hide/pelt morphology detected.");
    }

    // A structural Amorphous trait can override ordinary physical assumptions outside the Ooze family.
    if (!hardIncorporeal && structuralHas(["amorphous", "amorphous form", "forma amorfa"])) {
      remove("bone", "hide", "claw", "fang", "beak", "feather", "scale", "horn", "wing", "shell");
      add("amorphous", "A structural amorphous feature was detected.");
    }

    const fly = Number(actor.system?.attributes?.movement?.fly ?? 0) || 0;
    if (fly > 0 && anatomy.has("feather")) add("wing", "Flying movement supports explicit feathered anatomy.");
    if (fly > 0 && anatomy.has("beak") && !anatomy.has("feather")) {
      add("feather", "A flying creature with explicit beak anatomy is treated as feathered unless stronger morphology says otherwise.");
      add("wing", "Flying movement plus avian anatomy supports wings.");
    }

    // Record that weak magical text was observed but intentionally did not drive morphology.
    if (contains(corpus.weak, ["spirit", "spectral", "phantom", "ghost", "incorporeal", "espirito", "espectral"])) {
      reasons.push("Spectral/spirit language exists in incidental spell or item text; it was treated as weak evidence and did not define morphology.");
    }

    return {
      anatomy: [...anatomy].sort(),
      reasons: [...new Set(reasons)]
    };
  }

  static #actorCorpus(actor) {
    const identityTerms = [
      actor.name,
      actor.system?.details?.type?.subtype,
      actor.system?.details?.type?.custom
    ];
    const structuralTerms = [];
    const attackTerms = [];
    const equipmentTerms = [];
    const weakTerms = [];

    for (const item of actor.items ?? []) {
      const itemType = String(item.type ?? "").toLowerCase();
      const itemName = String(item.name ?? "");
      const activities = item.system?.activities;

      if (["weapon", "equipment"].includes(itemType)) equipmentTerms.push(itemName);
      else if (itemType === "feat") structuralTerms.push(itemName);
      else weakTerms.push(itemName);

      if (activities) {
        for (const activity of activities) {
          const activityName = String(activity?.name ?? itemName);
          const activityType = String(activity?.type ?? "").toLowerCase();
          if (itemType === "feat") structuralTerms.push(activityName);
          else if (itemType === "spell") weakTerms.push(activityName);
          else weakTerms.push(activityName);

          if (["attack", "save", "damage"].includes(activityType)) {
            try {
              const source = activity.toObject?.() ?? activity;
              const compact = JSON.stringify(source?.damage ?? source?.attack ?? source?.save ?? {});
              if (itemType === "spell") weakTerms.push(activityName, itemName, compact);
              else attackTerms.push(activityName, itemName, compact);
            } catch (_) {
              if (itemType === "spell") weakTerms.push(activityName, itemName);
              else attackTerms.push(activityName, itemName);
            }
          }
        }
      }
    }

    const normalize = values => this.#normalizeText((values ?? []).filter(Boolean).join(" | "));
    const identity = normalize(identityTerms);
    const structural = normalize(structuralTerms);
    const attacks = normalize(attackTerms);
    const equipment = normalize(equipmentTerms);
    const weak = normalize(weakTerms);
    return {
      identity,
      structural,
      attacks,
      equipment,
      weak,
      all: normalize([...identityTerms, ...structuralTerms, ...attackTerms, ...equipmentTerms, ...weakTerms]),
      attackTerms: attackTerms.filter(Boolean).map(String),
      itemTerms: [...structuralTerms, ...equipmentTerms, ...weakTerms].filter(Boolean).map(String)
    };
  }

  static #normalizeText(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  static #normalizeProfile(profile) {
    const sourceSlots = Array.isArray(profile?.slots) ? profile.slots.slice(0, 4) : [];
    const specs = this.HARVEST_POOL_SPECS;
    const hasPoolSchema = sourceSlots.some(slot => Array.isArray(slot?.materialIds));
    const pools = specs.map(spec => ({
      id: spec.id,
      position: spec.position,
      label: spec.label,
      rarities: [...spec.rarities],
      materialIds: [],
      materialId: "",
      chance: 0,
      quantityOverrides: {},
      generated: true
    }));

    if (hasPoolSchema) {
      for (let index = 0; index < pools.length; index += 1) {
        const source = sourceSlots.find(slot => String(slot?.id ?? "") === pools[index].id) ?? sourceSlots[index] ?? {};
        const ids = [...new Set((source.materialIds ?? []).map(String).filter(Boolean))];
        pools[index] = {
          ...pools[index],
          materialIds: ids,
          materialId: ids[0] ?? "",
          chance: Math.clamp(Number(source.chance ?? 0) || 0, 0, 100),
          quantityOverrides: source.quantityOverrides && typeof source.quantityOverrides === "object" ? foundry.utils.deepClone(source.quantityOverrides) : {},
          generated: source.generated !== false
        };
      }
    } else {
      // v0.0.19d migration: group each legacy single-material slot into its rarity pool.
      for (const source of sourceSlots) {
        const materialId = String(source?.materialId ?? "");
        if (!materialId) continue;
        const rarity = String(source?.rarity ?? "common");
        const targetIndex = rarity === "common" ? 0 : rarity === "uncommon" ? 1 : rarity === "rare" ? 2 : 3;
        const pool = pools[targetIndex];
        if (!pool.materialIds.includes(materialId)) pool.materialIds.push(materialId);
        pool.materialId ||= materialId;
        pool.chance = Math.max(pool.chance, Math.clamp(Number(source?.chance ?? 0) || 0, 0, 100));
        const quantity = String(source?.quantity || "1").trim() || "1";
        if (quantity !== "1") pool.quantityOverrides[materialId] = quantity;
        pool.generated = source?.generated !== false;
      }
    }

    return {
      ...foundry.utils.deepClone(profile ?? {}),
      id: String(profile?.id || foundry.utils.randomID(20)),
      sourceUuid: String(profile?.sourceUuid ?? ""),
      sourcePack: String(profile?.sourcePack ?? ""),
      sourcePackLabel: String(profile?.sourcePackLabel ?? ""),
      sourceId: String(profile?.sourceId ?? ""),
      sourceLabel: String(profile?.sourceLabel ?? ""),
      sourcePriority: Math.max(0, Number(profile?.sourcePriority ?? 9999) || 0),
      name: String(profile?.name ?? "Creature"),
      img: String(profile?.img ?? "icons/svg/mystery-man.svg"),
      actorType: String(profile?.actorType ?? "npc"),
      creatureType: String(profile?.creatureType ?? ""),
      creatureTypeLabel: String(profile?.creatureTypeLabel ?? this.creatureTypeLabel(profile?.creatureType)),
      subtype: String(profile?.subtype ?? ""),
      cr: Math.max(0, Number(profile?.cr ?? 0) || 0),
      size: String(profile?.size ?? ""),
      analysis: {
        anatomy: [...new Set((profile?.analysis?.anatomy ?? []).map(String).filter(Boolean))].sort(),
        reasons: [...new Set((profile?.analysis?.reasons ?? []).map(String).filter(Boolean))],
        harvestSignals: [...new Set((profile?.analysis?.harvestSignals ?? []).map(String).filter(Boolean))].sort(),
        legendarySource: Boolean(profile?.analysis?.legendarySource),
        essenceAffinities: (profile?.analysis?.essenceAffinities ?? []).map(row => ({
          type: String(row?.type ?? "").toLowerCase(),
          score: Math.max(1, Number(row?.score ?? row?.weight ?? 1) || 1),
          weight: Math.max(1, Number(row?.weight ?? row?.score ?? 1) || 1),
          reasons: [...new Set((row?.reasons ?? []).map(String).filter(Boolean))]
        })).filter(row => this.ESSENCE_DAMAGE_TYPES.includes(row.type)),
        essenceReasons: [...new Set((profile?.analysis?.essenceReasons ?? []).map(String).filter(Boolean))]
      },
      slots: pools,
      essenceSlot: {
        enabled: profile?.essenceSlot?.enabled === true,
        position: 5,
        label: "Essence",
        quantity: String(profile?.essenceSlot?.quantity || "1"),
        arcaneChance: Math.clamp(Number(profile?.essenceSlot?.arcaneChance ?? 50) || 0, 0, 100),
        specificChance: Math.clamp(Number(profile?.essenceSlot?.specificChance ?? 0) || 0, 0, 100),
        emptyChance: Math.clamp(Number(profile?.essenceSlot?.emptyChance ?? 50) || 0, 0, 100),
        affinities: (profile?.essenceSlot?.affinities ?? profile?.analysis?.essenceAffinities ?? []).map(row => ({
          type: String(row?.type ?? "").toLowerCase(),
          score: Math.max(1, Number(row?.score ?? row?.weight ?? 1) || 1),
          weight: Math.max(1, Number(row?.weight ?? row?.score ?? 1) || 1),
          reasons: [...new Set((row?.reasons ?? []).map(String).filter(Boolean))]
        })).filter(row => this.ESSENCE_DAMAGE_TYPES.includes(row.type))
      },
      pinpointOverrides: (Array.isArray(profile?.pinpointOverrides) ? profile.pinpointOverrides : []).map((row, index) => ({
        id: String(row?.id ?? foundry.utils.randomID(12)),
        position: index + 1,
        materialId: String(row?.materialId ?? ""),
        rarity: String(row?.rarity ?? "common"),
        chance: Math.clamp(Number(row?.chance ?? 100) || 0, 0, 100),
        quantity: String(row?.quantity || "1"),
        generated: false
      })),
      analyzedAt: Number(profile?.analyzedAt ?? Date.now())
    };
  }
}
