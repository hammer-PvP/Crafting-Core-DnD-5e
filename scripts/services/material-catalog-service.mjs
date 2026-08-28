import {
  DEFAULT_MATERIAL_ICON,
  FLAGS,
  MODULE_ID,
  SETTINGS
} from "../constants.mjs";
import { DEFAULT_MATERIALS, MATERIAL_CATALOG_VERSION } from "../data/material-catalog.mjs";
import { materialDefaultIcon, materialIconCandidates, materialLegacyCuratedDefault } from "../data/material-icon-catalog.mjs";
import { CompendiumService } from "./compendium-service.mjs";

export class MaterialCatalogService {
  static PACK_NAME = "crafting-core-materials";
  static PACK_LABEL = "Crafting Core — Materials";
  static PACK_ID = `world.${this.PACK_NAME}`;

  static RARITIES = Object.freeze(["common", "uncommon", "rare", "veryRare", "legendary"]);

  static RARITY_LABELS = Object.freeze({
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    veryRare: "Very Rare",
    legendary: "Legendary"
  });

  static DEFAULT_ECONOMY = Object.freeze({
    common: { price: 5, denomination: "gp", chance: 65 },
    uncommon: { price: 25, denomination: "gp", chance: 35 },
    rare: { price: 100, denomination: "gp", chance: 15 },
    veryRare: { price: 500, denomination: "gp", chance: 5 },
    legendary: { price: 1000, denomination: "gp", chance: 1 }
  });


  static rarityLabel(rarity) {
    return this.RARITY_LABELS[String(rarity)] ?? this.#title(rarity);
  }

  static rarityOptions({ includeAll=false }={}) {
    const options = this.RARITIES.map(value => ({ value, label: this.rarityLabel(value) }));
    return includeAll ? [{ value: "all", label: "All Rarities" }, ...options] : options;
  }

  static iconCandidatesFor(materialOrId) {
    const material = typeof materialOrId === "object" && materialOrId ? materialOrId : null;
    const id = String(material?.id ?? materialOrId ?? "");
    const current = String(material?.img ?? "");
    const curated = materialIconCandidates(id).slice(0, 3);

    // A GM may have already chosen a custom presentation icon outside this curated shortlist.
    // Preserve that choice by keeping it visible/selectable rather than silently replacing it.
    if (current && current !== DEFAULT_MATERIAL_ICON && !curated.includes(current)) {
      return [current, ...curated].slice(0, 3);
    }
    return curated.length ? curated : (current ? [current] : []);
  }

  static withIconChoices(material) {
    const entry = foundry.utils.deepClone(material);
    const candidates = this.iconCandidatesFor(entry);
    const selected = candidates.includes(entry.img)
      ? entry.img
      : (candidates[0] ?? entry.img ?? DEFAULT_MATERIAL_ICON);
    entry.iconCandidates = candidates.map((path, index) => ({
      path,
      index: index + 1,
      selected: path === selected
    }));
    entry.selectedIcon = selected;
    entry.hasIconCandidates = entry.iconCandidates.length > 0;
    return entry;
  }

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.MATERIAL_ECONOMY, {
      name: "Crafting Core Material Economy",
      scope: "world",
      config: false,
      type: Object,
      default: foundry.utils.deepClone(this.DEFAULT_ECONOMY)
    });
    game.settings.register(MODULE_ID, SETTINGS.MATERIAL_OVERRIDES, {
      name: "Crafting Core Material Overrides",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }

  static economy() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.MATERIAL_ECONOMY) ?? {};
    const result = foundry.utils.deepClone(this.DEFAULT_ECONOMY);
    for (const rarity of Object.keys(result)) {
      const row = stored?.[rarity] ?? {};
      result[rarity].price = Math.max(0, Number(row.price ?? result[rarity].price) || 0);
      result[rarity].denomination = String(row.denomination || result[rarity].denomination);
      result[rarity].chance = Math.clamp(Number(row.chance ?? result[rarity].chance) || 0, 0, 100);
    }
    return result;
  }

  static async saveEconomy(economy) {
    if (!game.user.isGM) throw new Error("Only a GM can change the material economy.");
    const current = this.economy();
    for (const rarity of Object.keys(current)) {
      const row = economy?.[rarity] ?? {};
      current[rarity].price = Math.max(0, Number(row.price ?? current[rarity].price) || 0);
      current[rarity].chance = Math.clamp(Number(row.chance ?? current[rarity].chance) || 0, 0, 100);
      current[rarity].denomination = String(row.denomination || "gp");
    }
    await game.settings.set(MODULE_ID, SETTINGS.MATERIAL_ECONOMY, current);
    return current;
  }

  static overrides() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.MATERIAL_OVERRIDES);
    return stored && typeof stored === "object" && !Array.isArray(stored) ? foundry.utils.deepClone(stored) : {};
  }

  static definitions() {
    const economy = this.economy();
    const overrides = this.overrides();
    return DEFAULT_MATERIALS.map(base => {
      const override = overrides[base.id] ?? {};
      const rarity = String(override.rarity ?? base.rarity ?? "common");
      const material = {
        ...foundry.utils.deepClone(base),
        ...foundry.utils.deepClone(override),
        id: base.id,
        rarity,
        chance: override.chance ?? base.chance ?? economy[rarity]?.chance ?? 0,
        price: override.price ?? economy[rarity]?.price ?? 0,
        denomination: override.denomination ?? economy[rarity]?.denomination ?? "gp",
        img: (override.img && String(override.img) !== DEFAULT_MATERIAL_ICON) ? override.img : (materialDefaultIcon(base.id) ?? DEFAULT_MATERIAL_ICON),
        managed: true,
        source: "builtin"
      };
      material.category = String(override.category ?? base.category ?? this.categoryFor(material));
      return this.#normalizeMaterial(material);
    });
  }

  static async allEntries() {
    const builtIns = this.definitions();
    const pack = this.pack();
    if (!pack) return builtIns;
    const docs = await pack.getDocuments();
    const byId = new Map(docs
      .filter(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL))
      .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item]));

    const entries = builtIns.map(material => {
      const item = byId.get(material.id);
      if (!item) return material;
      const itemImg = String(item.img || "");
      const img = itemImg && itemImg !== DEFAULT_MATERIAL_ICON ? itemImg : material.img;
      return { ...material, name: item.name, img, packUuid: item.uuid };
    });

    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.MATERIAL) || item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)) continue;
      entries.push(this.#entryFromItem(item));
    }
    return entries.sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang));
  }

  static async getEntry(id) {
    return (await this.allEntries()).find(entry => entry.id === String(id)) ?? null;
  }

  /**
   * Resolve all material Items in the private Materials Compendium by stable materialId.
   * If the pack is missing (or is missing a newly-added curated record), synchronize once.
   */
  static async materialDocumentsById({ ensureComplete=true }={}) {
    let pack = this.pack();
    if (!pack) {
      if (!ensureComplete) return new Map();
      pack = (await this.sync()).pack;
    }

    let docs = await pack.getDocuments();
    let map = new Map(docs
      .filter(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL))
      .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item])
      .filter(([id]) => id));

    const missingCurated = this.definitions().some(entry => !map.has(entry.id));
    const staleCurated = docs.some(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)
      && Number(item.getFlag(MODULE_ID, FLAGS.MATERIAL_CATALOG_VERSION) ?? 0) !== MATERIAL_CATALOG_VERSION);

    if (ensureComplete && (missingCurated || staleCurated)) {
      pack = (await this.sync()).pack;
      docs = await pack.getDocuments();
      map = new Map(docs
        .filter(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL))
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item])
        .filter(([id]) => id));
    }
    return map;
  }

  static groupedEntries(entries) {
    const groups = new Map();
    for (const material of entries) {
      const key = `${material.family}:${material.category}`;
      if (!groups.has(key)) groups.set(key, {
        key,
        family: material.family,
        category: material.category,
        label: material.family === "essence"
          ? this.familyLabel(material.family)
          : `${this.familyLabel(material.family)} — ${this.categoryLabel(material.family, material.category)}`,
        materials: []
      });
      groups.get(key).materials.push(material);
    }
    return [...groups.values()]
      .map(group => ({
        ...group,
        count: group.materials.length,
        materials: group.materials.sort((a, b) => String(a.name).localeCompare(String(b.name), game.i18n.lang))
      }))
      .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
  }

  static familyLabel(family) {
    return ({ creature: "Creature Harvest", essence: "Essences", gathering: "Gathering", profession: "Profession & Trade" })[family] ?? family;
  }

  static categoryLabel(family, category) {
    if (family === "creature") return this.#title(category);
    if (family === "essence") return "Essences";
    return ({
      flora: "Flora",
      roots: "Roots",
      fungi: "Fungi",
      wood: "Wood & Resin",
      mineral: "Minerals & Geological",
      forage: "Wild Foraging",
      cultivated: "Cultivated & Domestic",
      food: "Food & Cooking",
      metalworking: "Metalworking",
      leatherworking: "Leatherworking",
      alchemy: "Alchemy",
      gemcutting: "Gemcutting & Crystals",
      general: "General Materials"
    })[category] ?? this.#title(category);
  }

  static categoryFor(material) {
    const family = String(material.family ?? "profession");
    const tags = new Set((material.tags ?? []).map(tag => String(tag).toLowerCase()));
    const nature = String(material.nature ?? "").toLowerCase();
    if (family === "creature") return nature || "other";
    if (family === "essence") return "essence";
    if (family === "gathering") {
      if (nature === "mineral") return "mineral";
      if (tags.has("forage")) return "forage";
      if (tags.has("root")) return "roots";
      if (tags.has("fungus") || tags.has("mushroom") || tags.has("spore")) return "fungi";
      if (tags.has("resin") || tags.has("wood") || tags.has("bark") || tags.has("sap")) return "wood";
      return "flora";
    }
    if (tags.has("cultivated") || tags.has("domestic") || tags.has("crop") || tags.has("orchard") || tags.has("apiary")) return "cultivated";
    if (tags.has("gemcutting") || tags.has("jewelry") || tags.has("gem")) return "gemcutting";
    if (tags.has("food") || tags.has("grain") || tags.has("spice") || tags.has("preservative") || tags.has("oil")) return "food";
    if (tags.has("leather")) return "leatherworking";
    if (tags.has("alchemy")) return "alchemy";
    if (tags.has("metal") || tags.has("smithing") || tags.has("fuel")) return "metalworking";
    return "general";
  }

  static pack() {
    return CompendiumService.findWorldPack(this.PACK_NAME);
  }

  static async ensurePack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: this.PACK_NAME, label: this.PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, this.#folderDefinitions());
    return pack;
  }

  static #folderDefinitions() {
    const defs = [
      { key: "creature", name: "Creature Harvest" },
      { key: "essence", name: "Essences" },
      { key: "gathering", name: "Gathering" },
      { key: "profession", name: "Profession & Trade" }
    ];
    const creatureTypes = [...new Set(DEFAULT_MATERIALS.filter(m => m.family === "creature").map(m => m.nature))].sort();
    for (const nature of creatureTypes) defs.push({ key: `creature:${nature}`, name: this.#title(nature), parent: "creature" });
    for (const [key, name] of [["flora","Flora"],["roots","Roots"],["fungi","Fungi"],["wood","Wood & Resin"],["forage","Wild Foraging"],["mineral","Minerals & Geological"]]) {
      defs.push({ key: `gathering:${key}`, name, parent: "gathering" });
    }
    for (const [key, name] of [["cultivated","Cultivated & Domestic"],["food","Food & Cooking"],["metalworking","Metalworking"],["leatherworking","Leatherworking"],["alchemy","Alchemy"],["gemcutting","Gemcutting & Crystals"],["general","General Materials"]]) {
      defs.push({ key: `profession:${key}`, name, parent: "profession" });
    }
    return defs;
  }

  static async sync() {
    if (!game.user.isGM) throw new Error("Only a GM can synchronize Crafting Core materials.");
    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#folderDefinitions());
      const existing = await pack.getDocuments();
      const byMaterialId = new Map(existing
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item])
        .filter(([id]) => id));
      const catalogOverrides = this.overrides();

      const creates = [];
      const updates = [];
      for (const material of this.definitions()) {
        const folder = folders.get(`${material.family}:${material.category}`) ?? folders.get(material.family) ?? null;
        const item = byMaterialId.get(material.id);
        if (!item) {
          creates.push(this.#itemData(material, folder?.id ?? null));
          continue;
        }

        // Preserve manual GM-facing presentation edits made directly in the pack (name, image,
        // description and weight). Catalog-editor overrides are already merged into material metadata.
        const update = {
          _id: item.id,
          folder: folder?.id ?? null,
          "system.rarity": material.rarity,
          "system.price.value": material.price,
          "system.price.denomination": material.denomination,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL}`]: true,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`]: material.id,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_FAMILY}`]: material.family,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_NATURE}`]: material.nature,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CATEGORY}`]: material.category,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_RARITY}`]: material.rarity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CHANCE}`]: material.chance,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_QUANTITY}`]: material.quantity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_TAGS}`]: material.tags ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_REQUIRES}`]: material.requires ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_BIOMES}`]: material.biomes ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_MANAGED}`]: true,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CATALOG_VERSION}`]: MATERIAL_CATALOG_VERSION
        };
        // v0.0.19b visual migration:
        // - generic pouch -> current curated default;
        // - untouched v0.0.19a curated defaults may advance to the refined v0.0.19b default;
        // - any explicit Catalog override or unrelated manual Compendium image remains authoritative.
        const explicitIconOverride = String(catalogOverrides?.[material.id]?.img ?? "").trim();
        const legacyCuratedDefault = materialLegacyCuratedDefault(material.id);
        const currentImg = String(item.img ?? "");
        const mayAdvanceCuratedDefault = !explicitIconOverride
          && legacyCuratedDefault
          && currentImg === legacyCuratedDefault
          && currentImg !== String(material.img ?? "");
        if (!currentImg || currentImg === DEFAULT_MATERIAL_ICON || mayAdvanceCuratedDefault) update.img = material.img;
        updates.push(update);
      }

      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      const created = creates.length ? await ItemClass.createDocuments(creates, { pack: pack.collection }) : [];
      const updated = updates.length ? await ItemClass.updateDocuments(updates, { pack: pack.collection }) : [];
      await pack.getIndex({ fields: ["name", "img", "type", "folder", "system.rarity", `flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`] });
      Hooks.callAll(`${MODULE_ID}.materialsChanged`);
      return { pack, created: created.length, updated: updated.length, total: this.definitions().length };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async registerItem(item, { family="profession", nature="trade", rarity="common", category="general" }={}) {
    if (!game.user.isGM) throw new Error("Only a GM can register Crafting Core materials.");
    if (!(item instanceof Item)) throw new Error("Drop a D&D5e Item to register it as a material.");
    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.#folderDefinitions());
      const economy = this.economy();
      if (item.pack === pack.collection && item.getFlag(MODULE_ID, FLAGS.MATERIAL)) return item;
      const existingDocs = await pack.getDocuments();
      const existingBySource = existingDocs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.SOURCE_UUID) ?? "") === String(item.uuid));
      if (existingBySource) return existingBySource;
      const materialId = String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) || `custom-${foundry.utils.randomID(16)}`);
      const existingById = existingDocs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "") === materialId);
      if (existingById) return existingById;
      const source = item.toObject();
      const sourceDescription = foundry.utils.deepClone(item.system?.description ?? { value: "", chat: "" });
      const sourceWeight = foundry.utils.deepClone(item.system?.weight ?? { value: 0, units: "lb" });
      const sourcePrice = foundry.utils.deepClone(item.system?.price ?? { value: economy[rarity]?.price ?? 0, denomination: "gp" });
      const normalized = this.#normalizeMaterial({ id: materialId, family, nature, rarity, category, tags: [], requires: [], biomes: [], chance: economy[rarity]?.chance ?? 0, quantity: "1" });
      const folder = folders.get(`${normalized.family}:${normalized.category}`) ?? folders.get(normalized.family) ?? null;
      const data = {
        name: item.name,
        type: "loot",
        img: item.img || DEFAULT_MATERIAL_ICON,
        folder: folder?.id ?? null,
        system: {
          description: sourceDescription,
          quantity: 1,
          weight: sourceWeight,
          price: sourcePrice,
          rarity,
          identified: true,
          unidentified: { description: "" },
          container: null,
          properties: [],
          type: { value: "trade", subtype: "" },
          identifier: `cc-${materialId}`,
          source: { custom: "Crafting Core Custom Material", book: "", page: "", license: "", rules: "2024", revision: 1 }
        },
        flags: foundry.utils.deepClone(source.flags ?? {})
      };
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        [FLAGS.SOURCE_UUID]: String(item.uuid),
        [FLAGS.MATERIAL]: true,
        [FLAGS.MATERIAL_ID]: materialId,
        [FLAGS.MATERIAL_FAMILY]: normalized.family,
        [FLAGS.MATERIAL_NATURE]: normalized.nature,
        [FLAGS.MATERIAL_CATEGORY]: normalized.category,
        [FLAGS.MATERIAL_RARITY]: normalized.rarity,
        [FLAGS.MATERIAL_CHANCE]: normalized.chance,
        [FLAGS.MATERIAL_QUANTITY]: normalized.quantity,
        [FLAGS.MATERIAL_TAGS]: [],
        [FLAGS.MATERIAL_REQUIRES]: [],
        [FLAGS.MATERIAL_BIOMES]: [],
        [FLAGS.MATERIAL_MANAGED]: false,
        [FLAGS.MATERIAL_CATALOG_VERSION]: MATERIAL_CATALOG_VERSION
      };

      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      const [created] = await ItemClass.createDocuments([data], { pack: pack.collection });
      Hooks.callAll(`${MODULE_ID}.materialsChanged`);
      return created;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async saveIconChoice(id, img) {
    if (!game.user.isGM) throw new Error("Only a GM can choose Crafting Core material icons.");
    const entry = await this.getEntry(id);
    if (!entry) throw new Error("Crafting material could not be resolved.");
    const path = String(img ?? "").trim();
    if (!path) throw new Error("Choose a valid Foundry Core icon.");

    if (!entry.managed) return this.saveEntry(id, { img: path });

    const curated = this.iconCandidatesFor(entry);
    if (curated.length && !curated.includes(path)) throw new Error("That icon is not one of the curated choices for this material.");

    const overrides = this.overrides();
    overrides[entry.id] = { ...(overrides[entry.id] ?? {}), img: path };
    await game.settings.set(MODULE_ID, SETTINGS.MATERIAL_OVERRIDES, overrides);

    const pack = this.pack();
    if (pack) {
      const docs = await pack.getDocuments();
      const item = docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "") === entry.id);
      if (item) {
        const wasLocked = Boolean(pack.locked);
        if (wasLocked) await pack.configure({ locked: false });
        try { await item.update({ img: path }); }
        finally { if (wasLocked) await pack.configure({ locked: true }); }
      }
    }

    Hooks.callAll(`${MODULE_ID}.materialsChanged`, entry.id);
    return this.getEntry(entry.id);
  }

  static async migrateCuratedCatalogIfNeeded() {
    if (!game.user?.isGM) return { migrated: false };
    const pack = this.pack();
    if (!pack) return { migrated: false, reason: "missing-pack" };
    const docs = await pack.getDocuments();
    const needsMigration = docs.some(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)
      && (Number(item.getFlag(MODULE_ID, FLAGS.MATERIAL_CATALOG_VERSION) ?? 0) < MATERIAL_CATALOG_VERSION
        || !item.img
        || String(item.img) === DEFAULT_MATERIAL_ICON));
    if (!needsMigration) return { migrated: false, reason: "current" };
    const result = await this.sync();
    return { migrated: true, ...result };
  }

  static async saveEntry(id, changes={}) {
    if (!game.user.isGM) throw new Error("Only a GM can edit Crafting Core materials.");
    const entry = await this.getEntry(id);
    if (!entry) throw new Error("Crafting material could not be resolved.");
    const normalized = this.#normalizeMaterial({ ...entry, ...foundry.utils.deepClone(changes), id: entry.id });

    if (entry.managed) {
      const overrides = this.overrides();
      overrides[entry.id] = {
        name: normalized.name,
        img: normalized.img,
        family: normalized.family,
        nature: normalized.nature,
        category: normalized.category,
        rarity: normalized.rarity,
        chance: normalized.chance,
        quantity: normalized.quantity,
        tags: normalized.tags,
        requires: normalized.requires,
        biomes: normalized.biomes,
        price: normalized.price,
        denomination: normalized.denomination
      };
      await game.settings.set(MODULE_ID, SETTINGS.MATERIAL_OVERRIDES, overrides);
      await this.sync();
      // Apply presentation fields that sync intentionally preserves.
      const pack = this.pack();
      const docs = await pack.getDocuments();
      const item = docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "") === entry.id);
      if (item) {
        const wasLocked = Boolean(pack.locked);
        if (wasLocked) await pack.configure({ locked: false });
        try { await item.update({ name: normalized.name, img: normalized.img }); }
        finally { if (wasLocked) await pack.configure({ locked: true }); }
      }
    } else {
      const pack = this.pack();
      if (!pack) throw new Error("Materials Compendium is not available.");
      const docs = await pack.getDocuments();
      const item = docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "") === entry.id);
      if (!item) throw new Error("Custom material Item is missing from the Materials Compendium.");
      const wasLocked = Boolean(pack.locked);
      if (wasLocked) await pack.configure({ locked: false });
      try {
        const folders = await CompendiumService.ensurePackFolders(pack, this.#folderDefinitions());
        const folder = folders.get(`${normalized.family}:${normalized.category}`) ?? folders.get(normalized.family) ?? null;
        await item.update({
          name: normalized.name,
          img: normalized.img,
          folder: folder?.id ?? null,
          "system.rarity": normalized.rarity,
          "system.price.value": normalized.price,
          "system.price.denomination": normalized.denomination,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_FAMILY}`]: normalized.family,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_NATURE}`]: normalized.nature,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CATEGORY}`]: normalized.category,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_RARITY}`]: normalized.rarity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CHANCE}`]: normalized.chance,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_QUANTITY}`]: normalized.quantity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_TAGS}`]: normalized.tags,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_REQUIRES}`]: normalized.requires,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_BIOMES}`]: normalized.biomes
        });
      } finally {
        if (wasLocked) await pack.configure({ locked: true });
      }
    }
    Hooks.callAll(`${MODULE_ID}.materialsChanged`, id);
    return this.getEntry(id);
  }

  static async resetEntry(id) {
    if (!game.user.isGM) throw new Error("Only a GM can reset Crafting Core materials.");
    const base = DEFAULT_MATERIALS.find(material => material.id === String(id));
    if (!base) throw new Error("Only built-in curated materials can be reset.");
    const overrides = this.overrides();
    delete overrides[id];
    await game.settings.set(MODULE_ID, SETTINGS.MATERIAL_OVERRIDES, overrides);
    await this.sync();

    // Sync deliberately preserves presentation edits made directly in the Compendium. A deliberate
    // "Reset Curated Default" action is different: it restores the curated name and default icon too.
    const pack = this.pack();
    if (pack) {
      const material = this.definitions().find(entry => entry.id === String(id));
      const docs = await pack.getDocuments();
      const item = docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "") === String(id));
      if (item && material) {
        const wasLocked = Boolean(pack.locked);
        if (wasLocked) await pack.configure({ locked: false });
        try {
          await item.update({ name: material.name, img: material.img || DEFAULT_MATERIAL_ICON });
        } finally {
          if (wasLocked) await pack.configure({ locked: true });
        }
      }
    }
    return this.getEntry(id);
  }

  static async packSummary() {
    const pack = this.pack();
    if (!pack) return { exists: false, collection: this.PACK_ID, count: 0, managed: 0, custom: 0, private: true };
    const docs = await pack.getDocuments();
    let managed = 0;
    let custom = 0;
    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.MATERIAL)) continue;
      if (item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)) managed += 1;
      else custom += 1;
    }
    return { exists: true, collection: pack.collection, count: docs.length, managed, custom, title: pack.title, private: pack.metadata?.private !== false };
  }

  static openPack() {
    const pack = this.pack();
    if (!pack) return false;
    pack.render?.(true);
    return true;
  }

  static #entryFromItem(item) {
    const family = String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_FAMILY) ?? "profession");
    const nature = String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_NATURE) ?? "trade");
    const entry = {
      id: String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? item.id),
      name: item.name,
      img: item.img || DEFAULT_MATERIAL_ICON,
      family,
      nature,
      category: String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_CATEGORY) ?? ""),
      rarity: String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_RARITY) ?? item.system?.rarity ?? "common"),
      chance: Number(item.getFlag(MODULE_ID, FLAGS.MATERIAL_CHANCE) ?? 0),
      quantity: String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_QUANTITY) ?? "1"),
      tags: item.getFlag(MODULE_ID, FLAGS.MATERIAL_TAGS) ?? [],
      requires: item.getFlag(MODULE_ID, FLAGS.MATERIAL_REQUIRES) ?? [],
      biomes: item.getFlag(MODULE_ID, FLAGS.MATERIAL_BIOMES) ?? [],
      price: Number(item.system?.price?.value ?? 0),
      denomination: String(item.system?.price?.denomination ?? "gp"),
      managed: false,
      source: "custom",
      packUuid: item.uuid
    };
    if (!entry.category) entry.category = this.categoryFor(entry);
    return this.#normalizeMaterial(entry);
  }

  static #itemData(material, folderId=null) {
    return {
      name: material.name,
      type: "loot",
      img: material.img || DEFAULT_MATERIAL_ICON,
      folder: folderId,
      system: {
        description: {
          value: `<p>A crafting material from the <strong>Crafting Core Built-in Curated Catalog</strong>.</p>`,
          chat: ""
        },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price: { value: material.price, denomination: material.denomination },
        rarity: material.rarity,
        identified: true,
        unidentified: { description: "" },
        container: null,
        properties: [],
        type: { value: "trade", subtype: "" },
        identifier: `cc-${material.id}`,
        source: { custom: "Crafting Core — Built-in Curated Catalog", book: "", page: "", license: "", rules: "2024", revision: 1 }
      },
      flags: {
        [MODULE_ID]: {
          [FLAGS.MATERIAL]: true,
          [FLAGS.MATERIAL_ID]: material.id,
          [FLAGS.MATERIAL_FAMILY]: material.family,
          [FLAGS.MATERIAL_NATURE]: material.nature,
          [FLAGS.MATERIAL_CATEGORY]: material.category,
          [FLAGS.MATERIAL_RARITY]: material.rarity,
          [FLAGS.MATERIAL_CHANCE]: material.chance,
          [FLAGS.MATERIAL_QUANTITY]: material.quantity,
          [FLAGS.MATERIAL_TAGS]: material.tags ?? [],
          [FLAGS.MATERIAL_REQUIRES]: material.requires ?? [],
          [FLAGS.MATERIAL_BIOMES]: material.biomes ?? [],
          [FLAGS.MATERIAL_MANAGED]: true,
          [FLAGS.MATERIAL_CATALOG_VERSION]: MATERIAL_CATALOG_VERSION
        }
      },
      ownership: { default: 0 }
    };
  }

  static #normalizeMaterial(material) {
    const family = ["creature", "essence", "gathering", "profession"].includes(String(material.family)) ? String(material.family) : "profession";
    const rarity = this.RARITIES.includes(String(material.rarity)) ? String(material.rarity) : "common";
    const normalized = {
      ...material,
      id: String(material.id),
      name: String(material.name || "Material").trim() || "Material",
      img: String(material.img || DEFAULT_MATERIAL_ICON),
      family,
      nature: String(material.nature || (family === "profession" ? "trade" : family === "essence" ? "arcane" : "other")).trim().toLowerCase(),
      rarity,
      rarityLabel: this.rarityLabel(rarity),
      chance: Math.clamp(Number(material.chance) || 0, 0, 100),
      quantity: String(material.quantity || "1").trim() || "1",
      tags: this.#array(material.tags),
      requires: this.#array(material.requires),
      biomes: this.#array(material.biomes),
      price: Math.max(0, Number(material.price) || 0),
      denomination: String(material.denomination || "gp")
    };
    normalized.category = String(material.category || this.categoryFor(normalized)).trim().toLowerCase() || this.categoryFor(normalized);
    return normalized;
  }

  static #array(value) {
    if (Array.isArray(value)) return [...new Set(value.map(v => String(v).trim().toLowerCase()).filter(Boolean))];
    return [...new Set(String(value ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean))];
  }

  static #title(value) {
    return String(value ?? "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
