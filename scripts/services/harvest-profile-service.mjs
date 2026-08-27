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
      .map(pack => ({
        collection: String(pack.collection),
        label: String(pack.title ?? pack.metadata?.label ?? pack.collection),
        packageType: String(pack.metadata?.packageType ?? "world"),
        packageName: String(pack.metadata?.packageName ?? pack.metadata?.package ?? ""),
        locked: Boolean(pack.locked)
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
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
    return this.save(profile);
  }

  /** Analyze one D&D5e NPC into deterministic anatomy + four automatic slots. */
  static async analyzeActor(actor, { materials=null, previous=null }={}) {
    const entries = materials ?? await MaterialCatalogService.allEntries();
    const nature = String(actor.system?.details?.type?.value ?? "").toLowerCase();
    const available = entries.filter(entry => entry.family === "creature" && entry.nature === nature);
    if (!available.length) throw new Error(`No curated Creature Harvest materials exist for type "${nature || "unknown"}".`);

    const analysis = this.#inferAnatomy(actor, nature);
    const cr = Number(actor.system?.details?.cr ?? 0) || 0;
    const legendarySource = cr >= 17
      || Number(actor.system?.resources?.legact?.max ?? 0) > 0
      || Number(actor.system?.resources?.legres?.max ?? 0) > 0
      || Boolean(actor.system?.resources?.lair?.value);
    if (legendarySource) analysis.reasons.push("High-tier source detected from CR, Legendary Actions/Resistance, or Lair data; the fourth automatic slot targets Legendary materials.");
    const slots = this.#buildAutomaticSlots(available, analysis.anatomy, legendarySource);
    const oldPinpoint = Array.isArray(previous?.pinpointOverrides) ? previous.pinpointOverrides : [];

    return this.#normalizeProfile({
      id: previous?.id ?? foundry.utils.randomID(20),
      sourceUuid: String(actor.uuid),
      sourcePack: previous?.sourcePack ?? String(actor.pack ?? ""),
      sourcePackLabel: previous?.sourcePackLabel ?? "",
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
    normalized.slots = normalized.slots.map((slot, index) => this.#hydrateRow(slot, map, index + 1));
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

  static #buildAutomaticSlots(materials, anatomy, legendarySource=false) {
    const anatomySet = new Set(anatomy);
    const used = new Set();
    const highTier = legendarySource ? "legendary" : "veryRare";
    const specs = [
      { id: "common", label: "Common", rarities: ["common"] },
      { id: "secondary", label: "Common / Uncommon", rarities: ["uncommon", "common"] },
      { id: "rare", label: "Rare", rarities: ["rare"] },
      { id: "high", label: legendarySource ? "Legendary" : "Very Rare", rarities: [highTier] }
    ];

    return specs.map((spec, index) => {
      const candidates = materials
        .filter(material => spec.rarities.includes(material.rarity))
        .filter(material => !used.has(material.id))
        .filter(material => this.#requirementsSatisfied(material.requires, anatomySet))
        .sort((a, b) => this.#materialScore(b, anatomySet, spec.rarities) - this.#materialScore(a, anatomySet, spec.rarities)
          || a.id.localeCompare(b.id));
      const material = candidates[0] ?? null;
      if (material) used.add(material.id);
      return {
        id: spec.id,
        position: index + 1,
        label: spec.label,
        materialId: material?.id ?? "",
        rarity: material?.rarity ?? spec.rarities[0],
        chance: material?.chance ?? 0,
        quantity: material?.quantity ?? "1",
        generated: true
      };
    });
  }

  static #requirementsSatisfied(requires, anatomySet) {
    const list = (requires ?? []).map(value => String(value).toLowerCase()).filter(Boolean);
    return !list.length || list.every(requirement => anatomySet.has(requirement));
  }

  static #materialScore(material, anatomySet, rarityOrder) {
    const requires = material.requires ?? [];
    const rarityPriority = Math.max(0, rarityOrder.length - rarityOrder.indexOf(material.rarity));
    const requirementScore = requires.reduce((score, requirement) => score + (anatomySet.has(requirement) ? 25 : 0), 0);
    return requirementScore + requires.length * 10 + rarityPriority;
  }

  static #inferAnatomy(actor, nature) {
    const anatomy = new Set(this.BASE_ANATOMY[nature] ?? []);
    const reasons = [];
    const add = (tag, reason) => {
      if (!anatomy.has(tag)) reasons.push(reason);
      anatomy.add(tag);
    };
    const remove = (...tags) => tags.forEach(tag => anatomy.delete(tag));

    if (anatomy.size) reasons.push(`${this.creatureTypeLabel(nature)} baseline anatomy.`);
    if (nature === "ooze") reasons.push("Ooze creature type implies amorphous anatomy.");
    if (nature === "plant") reasons.push("Plant creature type implies plant anatomy.");

    const corpus = this.#actorCorpus(actor);
    const has = patterns => patterns.some(pattern => corpus.all.includes(pattern));
    const attackHas = patterns => patterns.some(pattern => corpus.attacks.includes(pattern));

    // Structural / body-part signals from names, subtype, attacks and features.
    const signals = [
      ["claw", ["claw", "talon", "garra", "garras"]],
      ["fang", ["fang", "bite", "teeth", "jaws", "mordida", "presa", "presas", "mandibula", "mandibulas"]],
      ["beak", ["beak", "bico"]],
      ["feather", ["feather", "feathers", "plumage", "pena", "penas", "plumagem"]],
      ["scale", ["scale", "scales", "scaled", "escama", "escamas"]],
      ["horn", ["horn", "horns", "gore", "antler", "antlers", "chifre", "chifres", "galhada"]],
      ["wing", ["wing", "wings", "asa", "asas"]],
      ["shell", ["shell", "carapace", "exoskeleton", "casco", "carapaca"]],
      ["eye", ["eye", "eyes", "eyestalk", "gaze", "olho", "olhos"]],
      ["tentacle", ["tentacle", "tentacles", "tentaculo", "tentaculos"]]
    ];
    for (const [tag, patterns] of signals) {
      if (has(patterns)) add(tag, `${this.title(tag)} anatomy detected from Actor data.`);
    }

    if (attackHas(["venom", "poison", "sting", "stinger", "veneno", "venenoso", "ferrao"])) {
      add("venom", "Venom/poison delivery detected in an attack or activity.");
    }

    // Undead must be split carefully so skeletal and incorporeal sources do not inherit flesh.
    if (nature === "undead") {
      const incorporeal = has(["incorporeal", "ghost", "specter", "spectre", "wraith", "banshee", "spirit", "phantom", "fantasma", "espectro", "espirito", "aparicao"]);
      const skeletal = has(["skeleton", "skeletal", "bone", "bones", "skull", "esqueleto", "esqueletico", "osseo"]);
      const fleshy = has(["zombie", "ghoul", "ghast", "mummy", "vampire", "wight", "zumbi", "carnical", "mumia", "vampiro"]);
      if (incorporeal) {
        remove(...this.PHYSICAL_TAGS);
        add("incorporeal", "Incorporeal undead indicators detected.");
      } else if (skeletal) {
        remove("flesh", "blood", "hide", "venom");
        add("bone", "Skeletal undead indicators detected.");
      } else if (fleshy) {
        add("flesh", "Fleshy undead indicators detected.");
        add("blood", "Fleshy undead indicators detected.");
        add("bone", "Fleshy undead indicators detected.");
      } else {
        add("flesh", "Physical undead fallback anatomy.");
        add("blood", "Physical undead fallback anatomy.");
        add("bone", "Physical undead fallback anatomy.");
      }
    }

    if (nature === "construct") {
      const fleshConstruct = has(["flesh golem", "flesh construct", "golem de carne"]);
      const stoneConstruct = has(["stone", "rock", "granite", "stone golem", "pedra", "rocha"]);
      const crystalConstruct = has(["crystal", "crystalline", "cristal"]);
      const metalConstruct = has(["iron", "steel", "metal", "clockwork", "automaton", "mechanical", "ferro", "aco", "metalico", "mecanico", "automato"]);
      if (fleshConstruct) {
        add("flesh", "Flesh-construct material detected."); add("blood", "Flesh-construct material detected."); add("bone", "Flesh-construct material detected.");
      } else if (stoneConstruct) add("mineral", "Stone/mineral construct detected.");
      else if (crystalConstruct) { add("crystal", "Crystal construct detected."); add("mineral", "Crystal construct detected."); }
      else if (metalConstruct) { add("metal", "Metal construct detected."); add("mechanical", "Mechanical construct detected."); }
      else add("mechanical", "Generic construct fallback anatomy.");
    }

    if (nature === "elemental" && has(["stone", "earth", "rock", "pedra", "terra", "rocha"])) add("mineral", "Earth/stone elemental indicators detected.");
    if (nature !== "construct" && has(["hide", "pelt", "fur", "pele", "couro", "pelagem"])) add("hide", "Hide/pelt indicators detected.");

    // Fly speed is supporting evidence only; it never creates a harvesting requirement by itself.
    const fly = Number(actor.system?.attributes?.movement?.fly ?? 0) || 0;
    if (fly > 0 && anatomy.has("feather")) add("wing", "Flying movement supports detected feathered anatomy.");

    return {
      anatomy: [...anatomy].sort(),
      reasons: [...new Set(reasons)]
    };
  }

  static #actorCorpus(actor) {
    const general = [
      actor.name,
      actor.system?.details?.type?.subtype,
      actor.system?.details?.type?.custom
    ];
    const attacks = [];
    const items = [];

    for (const item of actor.items ?? []) {
      items.push(item.name);
      const activities = item.system?.activities;
      if (activities) {
        for (const activity of activities) {
          const activityName = activity?.name ?? item.name;
          const activityType = String(activity?.type ?? "");
          items.push(activityName);
          if (activityType === "attack" || activityType === "save" || activityType === "damage") {
            attacks.push(activityName, item.name);
            try {
              const source = activity.toObject?.() ?? activity;
              const compact = JSON.stringify(source?.damage ?? source?.attack ?? source?.save ?? {});
              attacks.push(compact);
            } catch (_) { /* best-effort signal extraction */ }
          }
        }
      }
    }

    const normalize = value => this.#normalizeText((value ?? []).filter(Boolean).join(" | "));
    const all = normalize([...general, ...items, ...attacks]);
    return {
      all,
      attacks: normalize(attacks),
      attackTerms: attacks.filter(Boolean).map(String),
      itemTerms: items.filter(Boolean).map(String)
    };
  }

  static #normalizeText(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  static #normalizeProfile(profile) {
    const slots = Array.isArray(profile?.slots) ? profile.slots.slice(0, 4) : [];
    while (slots.length < 4) {
      const position = slots.length + 1;
      slots.push({ id: `slot-${position}`, position, label: `Slot ${position}`, materialId: "", rarity: "common", chance: 0, quantity: "1", generated: true });
    }
    return {
      ...foundry.utils.deepClone(profile ?? {}),
      id: String(profile?.id || foundry.utils.randomID(20)),
      sourceUuid: String(profile?.sourceUuid ?? ""),
      sourcePack: String(profile?.sourcePack ?? ""),
      sourcePackLabel: String(profile?.sourcePackLabel ?? ""),
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
        reasons: [...new Set((profile?.analysis?.reasons ?? []).map(String).filter(Boolean))]
      },
      slots: slots.map((slot, index) => ({
        id: String(slot?.id ?? `slot-${index + 1}`),
        position: index + 1,
        label: String(slot?.label ?? `Slot ${index + 1}`),
        materialId: String(slot?.materialId ?? ""),
        rarity: String(slot?.rarity ?? "common"),
        chance: Math.clamp(Number(slot?.chance ?? 0) || 0, 0, 100),
        quantity: String(slot?.quantity || "1"),
        generated: slot?.generated !== false
      })),
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
