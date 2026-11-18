import { FLAGS, MODULE_ID, SETTINGS } from "../constants.mjs";
import {
  canonicalEquipmentIcon, canonicalMaterialIcon,
  isLegacyCatalogArt
} from "../data/canonical-icon-catalog.mjs";
import { CURATED_CULINARY_RECIPES } from "../data/curated-culinary-catalog.mjs";
import { CURATED_ALCOHOLIC_RECIPES, CURATED_NON_ALCOHOLIC_RECIPES } from "../data/curated-drinks-catalog.mjs";
import { CURATED_ALCHEMY_PRODUCTS } from "../data/curated-alchemy-catalog.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";

/**
 * Icon-only, one-time update for v0.6.0 Worlds that already installed optional packs.
 * No packs are created; no Items, Recipes, Knowledge, Actors, or Projects are recreated.
 * User-supplied artwork outside earlier native/bundled icon roots is left as-is.
 */
export class CanonicalAssetsMigrationService {
  static VERSION = 1;

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CANONICAL_ASSET_MIGRATION, {
      name: "Crafting Core — Canonical Asset Migration",
      scope: "world", config: false, type: Number, default: 0
    });
  }

  static #productsById = new Map([
    ...CURATED_CULINARY_RECIPES,
    ...CURATED_ALCOHOLIC_RECIPES,
    ...CURATED_NON_ALCOHOLIC_RECIPES,
    ...CURATED_ALCHEMY_PRODUCTS
  ].map(entry => [entry.productId, entry.icon]));

  static #desiredProductIcon(item) {
    if (!item.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED)) return null;
    const contentId = String(item.getFlag(MODULE_ID, FLAGS.CONTENT_PACK_ID) ?? "");
    if (contentId === "srd-equipment") {
      const baseName = item.getFlag(MODULE_ID, "equipmentBaseName");
      const bonus = item.getFlag(MODULE_ID, "equipmentBonus");
      const kind = item.getFlag(MODULE_ID, FLAGS.PRODUCT_SUBCATEGORY);
      return canonicalEquipmentIcon(baseName, bonus, kind);
    }
    const id = String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? "");
    return this.#productsById.get(id) ?? null;
  }

  static async #upgradePack(pack, desiredFor) {
    if (!pack) return 0; // optional Content Pack not installed
    const docs = await pack.getDocuments();
    const updates = [];
    for (const item of docs) {
      const desired = desiredFor(item);
      if (!desired || String(item.img ?? "") === desired || !isLegacyCatalogArt(item.img)) continue;
      updates.push({ _id: item.id, img: desired });
    }
    if (!updates.length) return 0;

    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      for (let start = 0; start < updates.length; start += 40) {
        // Only the 'img' field changes, never activity/effect/recipe/flag data.
        await ItemClass.updateDocuments(updates.slice(start, start + 40), { pack: pack.collection });
      }
      await pack.getIndex({ fields: ["img"] });
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
    return updates.length;
  }

  static async migrateInstalledOnce() {
    if (!game.user?.isGM) return { migrated: false, reason: "not-gm" };
    if (Number(game.settings.get(MODULE_ID, SETTINGS.CANONICAL_ASSET_MIGRATION)) >= this.VERSION) {
      return { migrated: false, reason: "complete" };
    }

    const overrides = MaterialCatalogService.overrides();
    const materialsUpdated = await this.#upgradePack(MaterialCatalogService.pack(), item => {
      if (!item.getFlag(MODULE_ID, FLAGS.MATERIAL_MANAGED)) return null;
      const id = String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? "");
      const manual = String(overrides[id]?.img ?? "").trim();
      return manual && !isLegacyCatalogArt(manual) ? manual : canonicalMaterialIcon(id);
    });
    const productsUpdated = await this.#upgradePack(ProductSourceService.productsPack(), item => this.#desiredProductIcon(item));

    // A failed upgrade never marks the World complete; retry safely on the next GM login.
    await game.settings.set(MODULE_ID, SETTINGS.CANONICAL_ASSET_MIGRATION, this.VERSION);
    if (materialsUpdated) Hooks.callAll(`${MODULE_ID}.materialsChanged`);
    if (productsUpdated) Hooks.callAll(`${MODULE_ID}.productsChanged`);
    return { migrated: true, materialsUpdated, productsUpdated };
  }
}
