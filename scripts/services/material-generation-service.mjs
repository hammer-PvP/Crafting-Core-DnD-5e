import { FLAGS, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";

/**
 * One material-generation engine used by manual Creature Harvest and Environment Gathering.
 * Future Token HUD / Item Piles integration should call this service and only replace the output sink.
 */
export class MaterialGenerationService {
  static GENERATED_FOLDER_NAME = "Crafting Core — Generated Loot";
  static FOLDER_COLOR = "#8de901";

  static ABUNDANCE = Object.freeze({
    scarce: { label: "Scarce", maxTypes: 1, quantityFactor: 1 },
    normal: { label: "Normal", maxTypes: 2, quantityFactor: 1 },
    rich: { label: "Rich", maxTypes: 3, quantityFactor: 1.5 },
    abundant: { label: "Abundant", maxTypes: 4, quantityFactor: 2 }
  });

  // Manual profiles are deliberately coarse. Actor Scanner will later provide precise per-Actor anatomy.
  static CREATURE_PROFILES = Object.freeze({
    undead: [
      { id: "general", label: "General Undead" },
      { id: "fleshy", label: "Fleshy Undead / Zombie-like", allowRequires: ["flesh", "blood", "bone"], denyRequires: ["incorporeal"] },
      { id: "skeletal", label: "Skeletal Undead", allowRequires: ["bone"], denyRequires: ["flesh", "blood", "incorporeal"] },
      { id: "incorporeal", label: "Incorporeal Undead", allowRequires: ["incorporeal"], denyRequires: ["flesh", "blood", "bone"] }
    ]
  });

  static profilesFor(nature) {
    const key = String(nature || "").toLowerCase();
    return foundry.utils.deepClone(this.CREATURE_PROFILES[key] ?? [
      { id: "general", label: `General ${this.title(key || "Creature")}` }
    ]);
  }

  static async options() {
    const entries = await MaterialCatalogService.allEntries();
    const creatureNatures = [...new Set(entries.filter(e => e.family === "creature").map(e => e.nature).filter(Boolean))]
      .sort((a, b) => this.title(a).localeCompare(this.title(b), game.i18n.lang));
    const biomes = [...new Set(entries.filter(e => e.family === "gathering").flatMap(e => e.biomes ?? []).filter(Boolean))]
      .sort((a, b) => this.title(a).localeCompare(this.title(b), game.i18n.lang));
    return { entries, creatureNatures, biomes };
  }

  static resourceCategories(entries, biome) {
    const set = new Set(entries
      .filter(e => e.family === "gathering" && (e.biomes ?? []).includes(String(biome)))
      .map(e => e.category)
      .filter(Boolean));
    const preferred = ["flora", "roots", "fungi", "wood", "mineral"];
    return [...set].sort((a, b) => {
      const ai = preferred.indexOf(a); const bi = preferred.indexOf(b);
      if (ai >= 0 || bi >= 0) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return MaterialCatalogService.categoryLabel("gathering", a).localeCompare(MaterialCatalogService.categoryLabel("gathering", b), game.i18n.lang);
    });
  }

  static async generateCreature({ nature, profileId="general", sources=1 }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can generate Crafting Core materials.");
    const entries = (await MaterialCatalogService.allEntries())
      .filter(entry => entry.family === "creature" && entry.nature === String(nature));
    if (!entries.length) throw new Error("No Creature Harvest materials are configured for that creature type.");

    const profiles = this.profilesFor(nature);
    const profile = profiles.find(p => p.id === profileId) ?? profiles[0];
    const eligible = entries.filter(entry => this.#matchesProfile(entry, profile));
    const byRarity = {
      common: eligible.filter(e => e.rarity === "common"),
      rare: eligible.filter(e => e.rarity === "rare"),
      legendary: eligible.filter(e => e.rarity === "legendary")
    };

    const count = Math.clamp(Math.floor(Number(sources) || 1), 1, 100);
    const aggregate = new Map();
    const attempts = [];

    for (let sourceIndex = 0; sourceIndex < count; sourceIndex++) {
      const slots = [
        ...this.#pickUnique(byRarity.common, 2),
        ...this.#pickUnique(byRarity.rare, 1),
        ...this.#pickUnique(byRarity.legendary, 1)
      ];
      const sourceAttempts = [];
      for (const material of slots) {
        const success = this.#chance(material.chance);
        let quantity = 0;
        if (success) {
          quantity = await this.#rollQuantity(material.quantity);
          this.#aggregate(aggregate, material, quantity);
        }
        sourceAttempts.push({ materialId: material.id, name: material.name, rarity: material.rarity, chance: material.chance, success, quantity });
      }
      attempts.push(sourceAttempts);
    }

    const result = {
      source: "creature",
      sourceLabel: "Creature Harvest",
      nature: String(nature),
      natureLabel: this.title(nature),
      profileId: profile.id,
      profileLabel: profile.label,
      sources: count,
      items: [...aggregate.values()],
      attempts
    };
    result.folderName = `${result.natureLabel} — ${result.profileLabel} ×${count} — ${this.timestamp()}`;
    return result;
  }

  static async generateEnvironment({ biome, resource, abundance="normal" }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can generate Crafting Core materials.");
    const entries = (await MaterialCatalogService.allEntries()).filter(entry => entry.family === "gathering"
      && (entry.biomes ?? []).includes(String(biome))
      && entry.category === String(resource));
    if (!entries.length) throw new Error("No gathering materials are configured for that Biome and Resource combination.");

    const abundanceData = this.ABUNDANCE[String(abundance)] ?? this.ABUNDANCE.normal;
    const successes = [];
    const attempts = [];
    for (const material of entries) {
      const success = this.#chance(material.chance);
      attempts.push({ materialId: material.id, name: material.name, rarity: material.rarity, chance: material.chance, success });
      if (success) successes.push(material);
    }

    // Abundance limits how many distinct material types can be found in one gathering result.
    const selected = this.#shuffle(successes).slice(0, abundanceData.maxTypes);
    const aggregate = new Map();
    for (const material of selected) {
      const rolled = await this.#rollQuantity(material.quantity);
      const quantity = Math.max(1, Math.round(rolled * abundanceData.quantityFactor));
      this.#aggregate(aggregate, material, quantity);
    }

    const result = {
      source: "environment",
      sourceLabel: "Environment Gathering",
      biome: String(biome),
      biomeLabel: this.title(biome),
      resource: String(resource),
      resourceLabel: MaterialCatalogService.categoryLabel("gathering", resource),
      abundance: String(abundance),
      abundanceLabel: abundanceData.label,
      items: [...aggregate.values()],
      attempts
    };
    result.folderName = `${result.biomeLabel} — ${result.resourceLabel} — ${result.abundanceLabel} — ${this.timestamp()}`;
    return result;
  }

  /**
   * Materialize a generated result into one world Item folder. Empty results intentionally create no folder.
   */
  static async createWorldLoot(result) {
    if (!game.user?.isGM) throw new Error("Only a GM can create generated loot folders.");
    if (!result?.items?.length) return { ...result, folder: null, createdItems: [] };

    const documents = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const parent = await this.#ensureGeneratedRoot();
    const FolderClass = globalThis.Folder?.implementation ?? globalThis.Folder;
    const folder = await FolderClass.create({
      name: result.folderName,
      type: "Item",
      folder: parent.id,
      sorting: "m",
      color: this.FOLDER_COLOR,
      flags: { [MODULE_ID]: { generatedLoot: true, generationSource: result.source, generatedAt: Date.now() } }
    });

    const creates = [];
    for (const row of result.items) {
      const source = documents.get(row.materialId);
      if (!source) {
        console.warn(`${MODULE_ID} | Generated material ${row.materialId} is missing from Crafting Core — Materials.`);
        continue;
      }
      const data = source.toObject();
      delete data._id;
      delete data._stats;
      data.folder = folder.id;
      data.sort = 0;
      data.ownership = { default: 0 };
      data.system ??= {};
      data.system.quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        generatedLoot: true,
        generatedAt: Date.now(),
        generationSource: result.source
      };
      creates.push(data);
    }

    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const createdItems = creates.length ? await ItemClass.createDocuments(creates) : [];
    if (!createdItems.length) {
      await folder.delete();
      return { ...result, folder: null, createdItems: [] };
    }
    return { ...result, folder, createdItems };
  }

  /**
   * Generate a material result without writing anything to the world.
   * This preview-first entry point is also the shared rules engine future
   * Token HUD / Item Piles integrations should call.
   */
  static async generate(request={}) {
    return request.source === "environment"
      ? this.generateEnvironment(request)
      : this.generateCreature(request);
  }

  /**
   * Backward-compatible convenience helper. New UI should prefer generate()
   * followed by createWorldLoot() only after explicit GM confirmation.
   */
  static async generateAndCreate(request={}) {
    const generated = await this.generate(request);
    return this.createWorldLoot(generated);
  }

  static title(value) {
    return String(value ?? "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  static timestamp(date=new Date()) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yy}${mm}${dd}-${hh}${mi}${ss}`;
  }

  static #matchesProfile(entry, profile) {
    const requires = new Set((entry.requires ?? []).map(r => String(r).toLowerCase()));
    if (!requires.size) return true;
    const denied = new Set(profile?.denyRequires ?? []);
    if ([...requires].some(req => denied.has(req))) return false;
    const allowed = new Set(profile?.allowRequires ?? []);
    if (!allowed.size) return true;
    return [...requires].every(req => allowed.has(req));
  }

  static #chance(chance) {
    const value = Math.clamp(Number(chance) || 0, 0, 100);
    return (Math.random() * 100) < value;
  }

  static async #rollQuantity(formula) {
    const text = String(formula || "1").trim() || "1";
    try {
      const roll = await Roll.create(text).evaluate({ allowInteractive: false });
      return Math.max(1, Math.floor(Number(roll.total) || 1));
    } catch (error) {
      console.warn(`${MODULE_ID} | Invalid material quantity formula "${text}"; using 1.`, error);
      return 1;
    }
  }

  static #aggregate(map, material, quantity) {
    if (!quantity) return;
    const existing = map.get(material.id);
    if (existing) existing.quantity += quantity;
    else map.set(material.id, {
      materialId: material.id,
      name: material.name,
      img: material.img,
      rarity: material.rarity,
      quantity
    });
  }

  static #pickUnique(pool, count) {
    return this.#shuffle(pool).slice(0, Math.max(0, Number(count) || 0));
  }

  static #shuffle(values) {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  static async #ensureGeneratedRoot() {
    const FolderClass = globalThis.Folder?.implementation ?? globalThis.Folder;
    if (!FolderClass?.create) throw new Error("Foundry's Folder API is unavailable.");
    let folder = game.folders?.find(f => f.type === "Item" && f.name === this.GENERATED_FOLDER_NAME && !f.folder) ?? null;
    if (folder) return folder;
    folder = await FolderClass.create({
      name: this.GENERATED_FOLDER_NAME,
      type: "Item",
      folder: null,
      sorting: "m",
      color: this.FOLDER_COLOR,
      flags: { [MODULE_ID]: { generatedLootRoot: true } }
    });
    return folder;
  }
}
