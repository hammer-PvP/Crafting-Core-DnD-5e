import {
  DEFAULT_MATERIAL_ICON,
  FLAGS,
  MODULE_ID,
  SETTINGS
} from "../constants.mjs";
import { DEFAULT_MATERIALS, MATERIAL_CATALOG_VERSION } from "../data/material-catalog.mjs";

export class MaterialCatalogService {
  static PACK_NAME = "crafting-core-materials";
  static PACK_LABEL = "Crafting Core — Materials";
  static PACK_ID = `world.${this.PACK_NAME}`;

  static DEFAULT_ECONOMY = Object.freeze({
    common: { price: 5, denomination: "gp", chance: 65 },
    rare: { price: 100, denomination: "gp", chance: 15 },
    legendary: { price: 1000, denomination: "gp", chance: 1 }
  });

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.MATERIAL_ECONOMY, {
      name: "Crafting Core Material Economy",
      scope: "world",
      config: false,
      type: Object,
      default: foundry.utils.deepClone(this.DEFAULT_ECONOMY)
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

  static definitions() {
    const economy = this.economy();
    return DEFAULT_MATERIALS.map(material => ({
      ...foundry.utils.deepClone(material),
      chance: material.chance ?? economy[material.rarity]?.chance ?? 0,
      price: economy[material.rarity]?.price ?? 0,
      denomination: economy[material.rarity]?.denomination ?? "gp",
      img: DEFAULT_MATERIAL_ICON,
      managed: true
    }));
  }

  static groupedDefinitions() {
    const familyLabels = {
      creature: "Creature Harvest",
      gathering: "Gathering Materials",
      profession: "Profession / Trade"
    };
    const groups = new Map();
    for (const material of this.definitions()) {
      if (!groups.has(material.family)) groups.set(material.family, []);
      groups.get(material.family).push(material);
    }
    return [...groups.entries()].map(([family, materials]) => ({
      family,
      label: familyLabels[family] ?? family,
      count: materials.length,
      materials: materials.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang))
    }));
  }

  static pack() {
    return game.packs.get(this.PACK_ID)
      ?? game.packs.find(pack => pack.metadata?.packageType === "world" && pack.metadata?.name === this.PACK_NAME)
      ?? game.packs.find(pack => pack.collection === this.PACK_ID)
      ?? null;
  }

  static async ensurePack() {
    if (!game.user.isGM) throw new Error("Only a GM can create the Crafting Core materials Compendium.");
    const existing = this.pack();
    if (existing) return existing;

    const CompendiumCollection = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
    if (!CompendiumCollection?.createCompendium) throw new Error("Foundry's Compendium creation API is unavailable.");

    return CompendiumCollection.createCompendium({
      name: this.PACK_NAME,
      label: this.PACK_LABEL,
      type: "Item",
      system: "dnd5e",
      package: "world",
      private: true
    });
  }

  static async sync() {
    if (!game.user.isGM) throw new Error("Only a GM can synchronize Crafting Core materials.");
    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const existing = await pack.getDocuments();
      const byMaterialId = new Map(existing
        .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item])
        .filter(([id]) => id));

      const creates = [];
      const updates = [];
      for (const material of this.definitions()) {
        const item = byMaterialId.get(material.id);
        if (!item) {
          creates.push(this.#itemData(material));
          continue;
        }

        // Keep GM-facing presentation edits (name, image, description, weight) intact.
        // Synchronization only refreshes catalog metadata plus rarity/default value.
        updates.push({
          _id: item.id,
          "system.rarity": material.rarity,
          "system.price.value": material.price,
          "system.price.denomination": material.denomination,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL}`]: true,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`]: material.id,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_FAMILY}`]: material.family,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_NATURE}`]: material.nature,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_RARITY}`]: material.rarity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CHANCE}`]: material.chance,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_QUANTITY}`]: material.quantity,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_TAGS}`]: material.tags ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_REQUIRES}`]: material.requires ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_BIOMES}`]: material.biomes ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_MANAGED}`]: true,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CATALOG_VERSION}`]: MATERIAL_CATALOG_VERSION
        });
      }

      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      const created = creates.length ? await ItemClass.createDocuments(creates, { pack: pack.collection }) : [];
      const updated = updates.length ? await ItemClass.updateDocuments(updates, { pack: pack.collection }) : [];
      await pack.getIndex({ fields: ["name", "img", "type", "system.rarity", `flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`] });
      Hooks.callAll(`${MODULE_ID}.materialsChanged`);
      return { pack, created: created.length, updated: updated.length, total: this.definitions().length };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async registerItem(item, { family="profession", nature="trade", rarity="common" }={}) {
    if (!game.user.isGM) throw new Error("Only a GM can register Crafting Core materials.");
    if (!(item instanceof Item)) throw new Error("Drop a D&D5e Item to register it as a material.");
    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    try {
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
      const data = {
        name: item.name,
        type: "loot",
        img: item.img || DEFAULT_MATERIAL_ICON,
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
        [FLAGS.MATERIAL_FAMILY]: family,
        [FLAGS.MATERIAL_NATURE]: nature,
        [FLAGS.MATERIAL_RARITY]: rarity,
        [FLAGS.MATERIAL_CHANCE]: economy[rarity]?.chance ?? 0,
        [FLAGS.MATERIAL_QUANTITY]: "1",
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

  static async packSummary() {
    const pack = this.pack();
    if (!pack) return { exists: false, collection: this.PACK_ID, count: 0, managed: 0, custom: 0 };
    const docs = await pack.getDocuments();
    let managed = 0;
    let custom = 0;
    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.MATERIAL)) continue;
      if (item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)) managed += 1;
      else custom += 1;
    }
    return { exists: true, collection: pack.collection, count: docs.length, managed, custom, title: pack.title };
  }

  static openPack() {
    const pack = this.pack();
    if (!pack) return false;
    pack.render?.(true);
    return true;
  }

  static #itemData(material) {
    return {
      name: material.name,
      type: "loot",
      img: material.img || DEFAULT_MATERIAL_ICON,
      system: {
        description: {
          value: `<p>A crafting material managed by <strong>Crafting Core</strong>.</p>`,
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
        source: { custom: "Crafting Core", book: "", page: "", license: "", rules: "2024", revision: 1 }
      },
      flags: {
        [MODULE_ID]: {
          [FLAGS.MATERIAL]: true,
          [FLAGS.MATERIAL_ID]: material.id,
          [FLAGS.MATERIAL_FAMILY]: material.family,
          [FLAGS.MATERIAL_NATURE]: material.nature,
          [FLAGS.MATERIAL_RARITY]: material.rarity,
          [FLAGS.MATERIAL_CHANCE]: material.chance,
          [FLAGS.MATERIAL_QUANTITY]: material.quantity,
          [FLAGS.MATERIAL_TAGS]: material.tags ?? [],
          [FLAGS.MATERIAL_REQUIRES]: material.requires ?? [],
          [FLAGS.MATERIAL_BIOMES]: material.biomes ?? [],
          [FLAGS.MATERIAL_MANAGED]: true,
          [FLAGS.MATERIAL_CATALOG_VERSION]: MATERIAL_CATALOG_VERSION
        }
      }
    };
  }
}
