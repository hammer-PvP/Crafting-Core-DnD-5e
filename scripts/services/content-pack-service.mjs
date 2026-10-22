import { FLAGS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { CURATED_CULINARY_RECIPES } from "../data/curated-culinary-catalog.mjs";
import { CURATED_ALCHEMY_MATERIAL_IDS, CURATED_ALCHEMY_PRODUCTS, CURATED_ALCHEMY_RECIPES } from "../data/curated-alchemy-catalog.mjs";
import { DEFAULT_MATERIALS } from "../data/material-catalog.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { CuratedContentService } from "./curated-content-service.mjs";
import { CuratedAlchemyService } from "./curated-alchemy-service.mjs";
import { CuratedEquipmentService } from "./curated-equipment-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";

const ARCHITECTURE_VERSION = 1;
const PACKS = Object.freeze({
  MATERIALS: "hammer-materials",
  CULINARY: "hammer-culinary",
  ALCHEMY: "hammer-alchemy-inscription",
  EQUIPMENT: "srd-equipment"
});

function ownFlags(row) { return row?.flags?.[MODULE_ID] ?? {}; }
function curatedKind(row) { return String(ownFlags(row)?.[FLAGS.CURATED_KIND] ?? ""); }
function packFromKind(kind="") {
  if (kind === "culinary-product" || kind === "culinary-recipe") return PACKS.CULINARY;
  if (["alchemy-product", "inscription-product", "inscription-ink", "alchemy-recipe"].includes(kind)) return PACKS.ALCHEMY;
  if (kind === "equipment-product" || kind === "equipment-recipe") return PACKS.EQUIPMENT;
  return "";
}
function sourceLabel(packId, origin="world") {
  return ({
    [PACKS.MATERIALS]: "Hammer — Materials",
    [PACKS.CULINARY]: "Hammer — Culinary",
    [PACKS.ALCHEMY]: "Hammer — Alchemy & Inscription",
    [PACKS.EQUIPMENT]: "SRD Equipment Crafting"
  })[packId] ?? (origin === "external" ? "External" : "World");
}

export class ContentPackService {
  static PACKS = PACKS;
  static ARCHITECTURE_VERSION = ARCHITECTURE_VERSION;

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CONTENT_ARCHITECTURE_STATE, {
      name: "Crafting Core Content Architecture State",
      scope: "world",
      config: false,
      type: Object,
      default: { version: 0, migratedAt: 0 }
    });
  }

  static state() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.CONTENT_ARCHITECTURE_STATE) ?? {};
    return { version: Number(raw.version) || 0, migratedAt: Number(raw.migratedAt) || 0 };
  }

  static packIdForDocument(row) {
    const flags = ownFlags(row);
    const explicit = String(flags?.[FLAGS.CONTENT_PACK_ID] ?? "");
    if (explicit) return explicit;
    const kindPack = packFromKind(String(flags?.[FLAGS.CURATED_KIND] ?? ""));
    if (kindPack) return kindPack;
    const materialId = String(flags?.[FLAGS.MATERIAL_ID] ?? "");
    if (flags?.[FLAGS.MATERIAL_MANAGED]) return CURATED_ALCHEMY_MATERIAL_IDS.has(materialId) ? PACKS.ALCHEMY : PACKS.MATERIALS;
    return "";
  }

  static originForDocument(row) {
    const flags = ownFlags(row);
    const explicit = String(flags?.[FLAGS.CONTENT_ORIGIN] ?? "");
    if (explicit) return explicit;
    if (this.packIdForDocument(row)) return "pack";
    if (flags?.[FLAGS.PRODUCT_MIRROR] && !flags?.[FLAGS.CURATED]) return "external";
    return "world";
  }

  static sourceLabelForDocument(row) {
    const packId = this.packIdForDocument(row);
    return sourceLabel(packId, this.originForDocument(row));
  }

  static async migrateExistingWorld() {
    if (!game.user?.isGM) return { migrated: false, reason: "not-gm" };
    const state = this.state();
    if (state.version >= ARCHITECTURE_VERSION) return { migrated: false, reason: "current" };

    const reports = { materials: 0, products: 0, recipes: 0 };
    await this.#classifyPack(MaterialCatalogService.pack(), "materials", reports);
    await this.#classifyPack(ProductSourceService.productsPack(), "products", reports);
    await this.#classifyPack(KnowledgeItemService.pack(), "recipes", reports);

    await game.settings.set(MODULE_ID, SETTINGS.CONTENT_ARCHITECTURE_STATE, {
      version: ARCHITECTURE_VERSION,
      migratedAt: Date.now()
    });
    return { migrated: true, ...reports };
  }

  static async #classifyPack(pack, bucket, reports) {
    if (!pack) return;
    const docs = await pack.getDocuments();
    const updates = [];
    for (const item of docs) {
      const currentPack = String(item.getFlag(MODULE_ID, FLAGS.CONTENT_PACK_ID) ?? "");
      const currentOrigin = String(item.getFlag(MODULE_ID, FLAGS.CONTENT_ORIGIN) ?? "");
      const desiredPack = this.packIdForDocument(item);
      const desiredOrigin = desiredPack ? "pack" : (item.getFlag(MODULE_ID, FLAGS.PRODUCT_MIRROR) && !item.getFlag(MODULE_ID, FLAGS.CURATED) ? "external" : "world");
      if (currentPack === desiredPack && currentOrigin === desiredOrigin) continue;
      updates.push({
        _id: item.id,
        [`flags.${MODULE_ID}.${FLAGS.CONTENT_PACK_ID}`]: desiredPack,
        [`flags.${MODULE_ID}.${FLAGS.CONTENT_ORIGIN}`]: desiredOrigin
      });
    }
    if (!updates.length) return;
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try { await ItemClass.updateDocuments(updates, { pack: pack.collection }); }
    finally { if (wasLocked) await pack.configure({ locked: true }); }
    reports[bucket] += updates.length;
  }

  static async statusCards() {
    const [materialIndex, productIndex, recipeIndex, equipmentExpected] = await Promise.all([
      this.#index(MaterialCatalogService.pack(), [
        `flags.${MODULE_ID}.${FLAGS.MATERIAL}`, `flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`,
        `flags.${MODULE_ID}.${FLAGS.MATERIAL_MANAGED}`, `flags.${MODULE_ID}.${FLAGS.CONTENT_PACK_ID}`
      ]),
      this.#index(ProductSourceService.productsPack(), [
        `flags.${MODULE_ID}.${FLAGS.CURATED_KIND}`, `flags.${MODULE_ID}.${FLAGS.CONTENT_PACK_ID}`
      ]),
      this.#index(KnowledgeItemService.pack(), [
        `flags.${MODULE_ID}.${FLAGS.CURATED_KIND}`, `flags.${MODULE_ID}.${FLAGS.CONTENT_PACK_ID}`
      ]),
      CuratedEquipmentService.expectedVariantCount()
    ]);

    const coreMaterialIds = new Set(DEFAULT_MATERIALS.map(row => row.id).filter(id => !CURATED_ALCHEMY_MATERIAL_IDS.has(id)));
    const coreMaterials = materialIndex.filter(row => coreMaterialIds.has(String(ownFlags(row)?.[FLAGS.MATERIAL_ID] ?? ""))).length;
    const alchemyMaterials = materialIndex.filter(row => CURATED_ALCHEMY_MATERIAL_IDS.has(String(ownFlags(row)?.[FLAGS.MATERIAL_ID] ?? ""))).length;
    const productKinds = kind => productIndex.filter(row => curatedKind(row) === kind).length;
    const recipeKinds = kind => recipeIndex.filter(row => curatedKind(row) === kind).length;
    const culinaryProducts = productKinds("culinary-product");
    const culinaryRecipes = recipeKinds("culinary-recipe");
    const alchemyProducts = productIndex.filter(row => ["alchemy-product", "inscription-product", "inscription-ink"].includes(curatedKind(row))).length;
    const alchemyRecipes = recipeKinds("alchemy-recipe");
    const equipmentProducts = productKinds("equipment-product");
    const equipmentRecipes = recipeKinds("equipment-recipe");

    const makeState = ({ present, complete }) => ({
      present, complete, installed: complete, needsRestore: present && !complete,
      statusLabel: complete ? "Installed" : present ? "Needs Restore" : "Not Installed"
    });

    const materialsState = makeState({
      present: coreMaterials > 0,
      complete: coreMaterials >= coreMaterialIds.size
    });
    const culinaryExpected = CURATED_CULINARY_RECIPES.length;
    const culinaryState = makeState({
      present: culinaryProducts > 0 || culinaryRecipes > 0,
      complete: culinaryProducts >= culinaryExpected && culinaryRecipes >= culinaryExpected
    });
    const alchemyExpectedProducts = CURATED_ALCHEMY_PRODUCTS.length;
    const alchemyExpectedRecipes = CURATED_ALCHEMY_RECIPES.length;
    const alchemyExpectedMaterials = CURATED_ALCHEMY_MATERIAL_IDS.size;
    const alchemyState = makeState({
      present: alchemyMaterials > 0 || alchemyProducts > 0 || alchemyRecipes > 0,
      complete: alchemyMaterials >= alchemyExpectedMaterials
        && alchemyProducts >= alchemyExpectedProducts
        && alchemyRecipes >= alchemyExpectedRecipes
    });
    const equipmentState = makeState({
      present: equipmentProducts > 0 || equipmentRecipes > 0,
      complete: equipmentExpected > 0
        && equipmentProducts >= equipmentExpected
        && equipmentRecipes >= equipmentExpected
    });

    return [
      {
        id: PACKS.MATERIALS, icon: "fa-boxes-stacked", title: "Hammer — Materials",
        description: "Core crafting Materials for Harvesting, Gathering and trade recipes.",
        ...materialsState,
        current: coreMaterials, expected: coreMaterialIds.size,
        detail: `${coreMaterials} / ${coreMaterialIds.size} Materials`,
        canInstall: true,
        actionLabel: materialsState.present ? "Restore Defaults" : "Install",
        actionIcon: materialsState.present ? "fa-rotate-left" : "fa-download"
      },
      {
        id: PACKS.CULINARY, icon: "fa-utensils", title: "Hammer — Culinary",
        description: "Meals and drinks with published crafting Recipes.",
        ...culinaryState,
        current: Math.min(culinaryProducts, culinaryRecipes), expected: culinaryExpected,
        detail: `${culinaryProducts} Products · ${culinaryRecipes} Recipes`,
        compatible: CuratedContentService.itemCreatorCompatible(),
        canInstall: CuratedContentService.itemCreatorCompatible(),
        actionLabel: culinaryState.present ? "Restore Defaults" : "Install",
        actionIcon: culinaryState.present ? "fa-rotate-left" : "fa-download"
      },
      {
        id: PACKS.ALCHEMY, icon: "fa-flask-vial", title: "Hammer — Alchemy & Inscription",
        description: "Optional alchemy Materials, SRD consumables, inks and inscriptions.",
        ...alchemyState,
        current: Math.min(alchemyProducts, alchemyRecipes), expected: Math.max(alchemyExpectedProducts, alchemyExpectedRecipes),
        detail: `${alchemyMaterials} Materials · ${alchemyProducts} Products · ${alchemyRecipes} Recipes`,
        canInstall: true,
        actionLabel: alchemyState.present ? "Restore Defaults" : "Install",
        actionIcon: alchemyState.present ? "fa-rotate-left" : "fa-download"
      },
      {
        id: PACKS.EQUIPMENT, icon: "fa-shield-halved", title: "SRD Equipment Crafting",
        description: "+0 / +1 / +2 / +3 Weapons, Armor, Shields and Ammunition from SRD 5.2.",
        ...equipmentState,
        current: Math.min(equipmentProducts, equipmentRecipes), expected: equipmentExpected,
        detail: `${equipmentProducts} Products · ${equipmentRecipes} Blueprints`,
        sourceAvailable: Boolean(CuratedEquipmentService.sourcePack()),
        canInstall: Boolean(CuratedEquipmentService.sourcePack()),
        actionLabel: equipmentState.present ? "Restore Defaults" : "Install",
        actionIcon: equipmentState.present ? "fa-rotate-left" : "fa-download"
      }
    ];
  }

  static async install(packId, { onProgress=null }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can install Crafting Core content packs.");
    const id = String(packId ?? "");
    if (id !== PACKS.MATERIALS) await this.#ensureCoreMaterials({ onProgress });
    if (id === PACKS.MATERIALS) return MaterialCatalogService.sync({ onProgress, includeAlchemy: false });
    if (id === PACKS.CULINARY) return CuratedContentService.restoreAll({ onProgress });
    if (id === PACKS.ALCHEMY) return CuratedAlchemyService.restoreAll({ onProgress });
    if (id === PACKS.EQUIPMENT) return CuratedEquipmentService.restoreAll({ onProgress });
    throw new Error("Unknown Crafting Core content pack.");
  }

  static async installAll({ onProgress=null }={}) {
    const status = await this.statusCards();
    const installed = new Set(status.filter(row => row.installed).map(row => row.id));
    const ordered = [PACKS.MATERIALS, PACKS.CULINARY, PACKS.ALCHEMY, PACKS.EQUIPMENT];
    const steps = ordered.filter(id => !installed.has(id));
    if (!steps.length) return [];
    const results = [];
    for (let index = 0; index < steps.length; index += 1) {
      const id = steps[index];
      const label = ({
        [PACKS.MATERIALS]: "Hammer — Materials",
        [PACKS.CULINARY]: "Hammer — Culinary",
        [PACKS.ALCHEMY]: "Hammer — Alchemy & Inscription",
        [PACKS.EQUIPMENT]: "SRD Equipment Crafting"
      })[id];
      onProgress?.({ phase: `Installing ${label}`, label: `${index + 1} of ${steps.length} missing content packs`, current: index, total: steps.length, overallCurrent: index, overallTotal: steps.length, stats: { installedPacks: index } });
      if (id === PACKS.CULINARY && !CuratedContentService.itemCreatorCompatible()) {
        results.push({ id, skipped: true, reason: "item-creator" });
        continue;
      }
      if (id === PACKS.EQUIPMENT && !CuratedEquipmentService.sourcePack()) {
        results.push({ id, skipped: true, reason: "equipment24" });
        continue;
      }
      const result = await this.install(id, {
        onProgress: update => {
          const phaseTotal = Number(update?.overallTotal ?? update?.total ?? 0);
          const phaseCurrent = Number(update?.overallCurrent ?? update?.current ?? 0);
          const fraction = phaseTotal > 0 ? Math.max(0, Math.min(1, phaseCurrent / phaseTotal)) : 0;
          onProgress?.({ ...update, phase: `${label} — ${String(update?.phase ?? "Working")}`, overallCurrent: index + fraction, overallTotal: steps.length, stats: { ...(update?.stats ?? {}), installedPacks: index } });
        }
      });
      results.push({ id, result });
    }
    onProgress?.({ phase: "Content Installation Complete", label: "Missing Crafting Core content packs are installed.", current: steps.length, total: steps.length, overallCurrent: steps.length, overallTotal: steps.length, stats: { installedPacks: results.filter(row => !row.skipped).length, skippedPacks: results.filter(row => row.skipped).length } });
    return results;
  }

  static async #ensureCoreMaterials({ onProgress=null }={}) {
    const cards = await this.statusCards();
    const row = cards.find(card => card.id === PACKS.MATERIALS);
    if (!row?.installed || row.current < row.expected) await MaterialCatalogService.sync({ onProgress, includeAlchemy: false });
  }

  static async #index(pack, fields=[]) {
    if (!pack) return [];
    const index = await pack.getIndex({ fields });
    return Array.from(index ?? []);
  }
}

export { PACKS as CONTENT_PACK_IDS };
