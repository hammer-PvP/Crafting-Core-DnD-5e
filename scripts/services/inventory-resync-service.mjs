import { FLAGS, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";

/** Manually resync canonical artwork and managed Material Sources into existing Item copies. */
export class InventoryResyncService {
  static #managedRx = /<section\b[^>]*data-crafting-core-generated=["']material-sources["'][^>]*>[\s\S]*?<\/section>/gi;
  static #flavorRx = /<p\b[^>]*data-crafting-core-curated-flavor=["']true["'][^>]*>[\s\S]*?<\/p>/i;
  static #genericRx = /<p>\s*A crafting material from the\s+(?:<strong>)?Crafting Core Built-in Curated Catalog(?:<\/strong>)?\.\s*<\/p>/gi;
  static #provenanceFlags = [
    FLAGS.MATERIAL_BIOMES, FLAGS.MATERIAL_SOURCE_TYPES, FLAGS.MATERIAL_SOURCE_RULES,
    FLAGS.MATERIAL_PROCESSED_FROM, FLAGS.MATERIAL_VENDOR_AVAILABILITY, FLAGS.MATERIAL_CREATURE_SOURCES
  ];

  static #isLegacyIcon(path) {
    const img = String(path ?? "").trim();
    return !img || img.startsWith("icons/") || img.startsWith("systems/dnd5e/")
      || img.startsWith(`modules/${MODULE_ID}/icons/`);
  }

  static #description(existing, canonical) {
    const generated = String(canonical ?? "").match(this.#managedRx)?.[0];
    if (!generated) return null;
    const original = String(existing ?? "");
    let html = original.replace(this.#managedRx, "").replace(this.#genericRx, "").trim();
    const flavor = String(canonical ?? "").match(this.#flavorRx)?.[0] ?? "";
    if (flavor && (!html || /Crafting Core Built-in Curated Catalog/i.test(original))
      && !html.includes('data-crafting-core-curated-flavor')) html += `${html ? "\n" : ""}${flavor}`;
    return `${html}${html ? "\n" : ""}${generated}`;
  }

  static async sync({ onProgress=null }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM may synchronize Crafting Core inventories.");
    const materialPack = MaterialCatalogService.pack();
    const productPack = ProductSourceService.productsPack();
    if (!materialPack) return { checked:0, matched:0, updated:0, icons:0, sources:0, actorCount:0, tokenCount:0, worldItems:0 };
    const [materials, products] = await Promise.all([materialPack.getDocuments(), productPack?.getDocuments?.() ?? Promise.resolve([])]);
    const materialsById = new Map(materials.filter(item => item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED))
      .map(item => [String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? ""), item]));
    const productsById = new Map(products.filter(item => item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED))
      .map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]));
    const stats = { checked:0, matched:0, updated:0, icons:0, sources:0, actorCount:0, tokenCount:0, worldItems:0 };
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    const planItem = item => {
      stats.checked++;
      const flags = item.flags?.[MODULE_ID] ?? {};
      let materialId = String(flags[FLAGS.MATERIAL_ID] ?? "").trim();
      let material = Boolean(flags[FLAGS.MATERIAL] && materialId);
      if (!material && !materialId) {
        const identifier = String(item.system?.identifier ?? "");
        const source = String(item.system?.source?.custom ?? "");
        if (identifier.startsWith("cc-") && /Crafting Core.*Built-in Curated Catalog/i.test(source)) {
          const inferred = identifier.slice(3);
          if (materialsById.has(inferred)) { materialId = inferred; material = true; }
        }
      }
      const productId = String(flags[FLAGS.PRODUCT_ID] ?? "");
      const product = !material && Boolean(flags[FLAGS.PRODUCT_MANAGED] && productId);
      if (!material && !product) return null;
      const canonical = material ? materialsById.get(materialId) : productsById.get(productId);
      if (!canonical) return null;
      stats.matched++;
      const changes = { _id:item.id };
      if (material && (!flags[FLAGS.MATERIAL] || !flags[FLAGS.MATERIAL_ID])) {
        changes[`flags.${MODULE_ID}.${FLAGS.MATERIAL}`] = true;
        changes[`flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`] = materialId;
      }
      if (canonical.img && canonical.img !== item.img && this.#isLegacyIcon(item.img) && !this.#isLegacyIcon(canonical.img)) {
        changes.img = canonical.img;
        stats.icons++;
      }
      if (material) {
        const html = this.#description(item.system?.description?.value, canonical.system?.description?.value);
        if (html !== null && html !== String(item.system?.description?.value ?? "")) {
          changes["system.description.value"] = html;
          stats.sources++;
        }
        for (const flag of this.#provenanceFlags) {
          const value = canonical.getFlag(MODULE_ID, flag);
          if (value !== undefined && !same(flags[flag],value)) changes[`flags.${MODULE_ID}.${flag}`] = foundry.utils.deepClone(value);
        }
      }
      if (Object.keys(changes).length < 2) return null;
      stats.updated++;
      return changes;
    };

    const jobs = [];
    for (const actor of game.actors.contents) {
      const updates = actor.items.contents.map(planItem).filter(Boolean);
      if (updates.length) { stats.actorCount++; jobs.push({ label:actor.name, owner:actor, updates }); }
    }
    const worldUpdates = game.items.contents.map(planItem).filter(Boolean);
    stats.worldItems = worldUpdates.length;
    if (worldUpdates.length) jobs.push({ label:"World Items", owner:null, updates:worldUpdates });
    for (const scene of game.scenes.contents) {
      for (const token of scene.tokens.contents) {
        if (token.actorLink || !token.actor) continue;
        const actor = token.actor;
        const updates = actor.items.contents.map(planItem).filter(Boolean);
        if (updates.length) { stats.tokenCount++; jobs.push({ label:`${scene.name} / ${token.name}`, owner:actor, updates }); }
      }
    }
    let completed = 0;
    for (const job of jobs) {
      for (let i=0;i<job.updates.length;i+=30) {
        const batch = job.updates.slice(i,i+30);
        if (job.owner) await job.owner.updateEmbeddedDocuments("Item", batch);
        else await Item.implementation.updateDocuments(batch);
        completed += batch.length;
        onProgress?.({ phase:"Synchronizing Existing Inventories", label:job.label, current:completed, total:stats.updated,
          overallCurrent:completed, overallTotal:stats.updated, stats:{ items:completed, icons:stats.icons, sources:stats.sources } });
      }
    }
    return stats;
  }
}
