import { FLAGS, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { HarvestProfileService } from "./harvest-profile-service.mjs";
import { MaterialOriginService } from "./material-origin-service.mjs";

/**
 * Rebuilds the World-specific reverse index Harvest Profile -> Material into
 * Material -> Actor UUIDs. Harvest Profiles remain the authority; Material flags
 * and description links are a derived, repairable view.
 */
export class MaterialSourceService {
  static #timer = null;
  static #running = null;

  static installHooks() {
    Hooks.on(`${MODULE_ID}.harvestProfilesChanged`, () => this.scheduleRebuild());
  }

  static scheduleRebuild(delay=250) {
    if (!game.user?.isGM || !this.#isPrimaryActiveGM()) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      this.rebuild().catch(error => console.error(`${MODULE_ID} | Automatic Material Source resync failed.`, error));
    }, Math.max(0, Number(delay) || 0));
  }

  static async summary() {
    const pack = MaterialCatalogService.pack();
    if (!pack) return { materials: 0, linkedMaterials: 0, creatureLinks: 0, profiles: HarvestProfileService.list().length };
    const docs = await pack.getDocuments();
    let linkedMaterials = 0;
    let creatureLinks = 0;
    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.MATERIAL)) continue;
      const sources = MaterialOriginService.normalizeCreatureSources(item.getFlag(MODULE_ID, FLAGS.MATERIAL_CREATURE_SOURCES) ?? []);
      if (sources.length) linkedMaterials += 1;
      creatureLinks += sources.length;
    }
    return {
      materials: docs.filter(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL)).length,
      linkedMaterials,
      creatureLinks,
      profiles: HarvestProfileService.list().length
    };
  }

  static async rebuild() {
    if (!game.user?.isGM) throw new Error("Only a GM can resync Material Sources.");
    if (this.#running) return this.#running;
    this.#running = this.#rebuildInternal();
    try { return await this.#running; }
    finally { this.#running = null; }
  }

  static async #rebuildInternal() {
    // Ensures newly-added curated Materials exist before constructing the reverse index.
    const documentsById = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const entries = await MaterialCatalogService.allEntries();
    const entriesById = new Map(entries.map(entry => [String(entry.id), entry]));
    const materialLookup = new Map();
    for (const [id, entry] of entriesById) {
      const doc = documentsById.get(id);
      materialLookup.set(id, { id, name: entry.name, uuid: doc?.uuid ?? entry.packUuid ?? "" });
    }

    const essenceByAffinity = new Map(entries
      .filter(entry => entry.family === "essence")
      .map(entry => [String(entry.nature ?? "").toLowerCase(), entry.id]));

    const reverse = new Map();
    const profiles = HarvestProfileService.list();
    let profilesUsed = 0;

    for (const profile of profiles) {
      const sourceUuid = String(profile?.sourceUuid ?? "").trim();
      if (!sourceUuid) continue;
      const possible = this.#possibleMaterialIds(profile, essenceByAffinity);
      if (!possible.size) continue;
      profilesUsed += 1;
      const source = {
        uuid: sourceUuid,
        name: String(profile?.name ?? "Creature"),
        img: String(profile?.img ?? ""),
        sourcePack: String(profile?.sourcePack ?? ""),
        sourcePackLabel: String(profile?.sourcePackLabel ?? "")
      };
      for (const materialId of possible) {
        if (!entriesById.has(materialId)) continue;
        const byUuid = reverse.get(materialId) ?? new Map();
        byUuid.set(sourceUuid, source);
        reverse.set(materialId, byUuid);
      }
    }

    const pack = MaterialCatalogService.pack();
    if (!pack) throw new Error("Crafting Core — Materials Compendium is unavailable.");
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    let updated = 0;
    let linkedMaterials = 0;
    let creatureLinks = 0;
    try {
      const updates = [];
      for (const [materialId, item] of documentsById) {
        const material = entriesById.get(materialId);
        if (!material) continue;
        const creatureSources = MaterialOriginService.normalizeCreatureSources([...(reverse.get(materialId)?.values?.() ?? [])]);
        if (creatureSources.length) linkedMaterials += 1;
        creatureLinks += creatureSources.length;

        const section = MaterialOriginService.buildManagedSection(material, creatureSources, { materialLookup });
        const currentDescription = String(item.system?.description?.value ?? "");
        const nextDescription = MaterialOriginService.mergeManagedSection(currentDescription, section, { flavor: material.flavor });

        const update = {
          _id: item.id,
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_SOURCE_TYPES}`]: material.sourceTypes ?? MaterialOriginService.inferSourceTypes(material),
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_SOURCE_RULES}`]: material.sourceRules ?? {},
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_PROCESSED_FROM}`]: material.processedFrom ?? [],
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_VENDOR_AVAILABILITY}`]: material.vendorAvailability ?? "",
          [`flags.${MODULE_ID}.${FLAGS.MATERIAL_CREATURE_SOURCES}`]: creatureSources
        };
        if (nextDescription !== currentDescription) update["system.description.value"] = nextDescription;
        updates.push(update);
      }

      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      if (updates.length) {
        const result = await ItemClass.updateDocuments(updates, { pack: pack.collection });
        updated = result?.length ?? updates.length;
      }
      await pack.getIndex({ fields: ["name", "img", "type", "folder", `flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`] });
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }

    Hooks.callAll(`${MODULE_ID}.materialsChanged`, null);
    return {
      profiles: profiles.length,
      profilesUsed,
      materials: entries.length,
      materialsUpdated: updated,
      linkedMaterials,
      creatureLinks
    };
  }

  static #possibleMaterialIds(profile, essenceByAffinity) {
    const ids = new Set();
    for (const pool of (profile?.slots ?? []).slice(0, 4)) {
      if (Number(pool?.chance ?? 0) <= 0) continue;
      const materialIds = pool?.materialIds?.length ? pool.materialIds : [pool?.materialId];
      for (const id of materialIds ?? []) {
        const value = String(id ?? "").trim();
        if (value) ids.add(value);
      }
    }

    for (const row of profile?.pinpointOverrides ?? []) {
      if (Number(row?.chance ?? 0) <= 0) continue;
      const id = String(row?.materialId ?? "").trim();
      if (id) ids.add(id);
    }

    const essence = profile?.essenceSlot;
    if (essence?.enabled === true) {
      if (Number(essence.arcaneChance ?? 0) > 0) {
        const arcane = essenceByAffinity.get("arcane");
        if (arcane) ids.add(arcane);
      }
      if (Number(essence.specificChance ?? 0) > 0) {
        for (const row of essence.affinities ?? []) {
          const materialId = essenceByAffinity.get(String(row?.type ?? "").toLowerCase());
          if (materialId) ids.add(materialId);
        }
      }
    }
    return ids;
  }

  static #isPrimaryActiveGM() {
    const activeGM = game.users?.activeGM ?? game.users?.contents?.find(user => user.active && user.isGM);
    return !activeGM || activeGM.id === game.user?.id;
  }
}
