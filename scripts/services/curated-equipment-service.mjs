import { FLAGS, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { normalizeItemSourceForDnd5e6, rarityArray } from "../utils/dnd5e-data.mjs";
import { forcedDeletionMap } from "../utils/foundry-data.mjs";

const SOURCE_PACK_ID = "dnd5e.equipment24";
const VERSION = 1;
const WEAPON_TYPES = new Set(["simpleM", "simpleR", "martialM", "martialR"]);
const ARMOR_TYPES = new Set(["light", "medium", "heavy", "shield"]);
const MAGIC_COST = Object.freeze({ standard: { 1: 200, 2: 2000, 3: 20000 }, armor: { 1: 2000, 2: 20000, 3: 100000 } });
const RARITY = Object.freeze({
  weapon: { 0: "", 1: "uncommon", 2: "rare", 3: "veryRare" },
  armor: { 0: "", 1: "rare", 2: "veryRare", 3: "legendary" },
  shield: { 0: "", 1: "uncommon", 2: "rare", 3: "veryRare" },
  ammunition: { 0: "", 1: "uncommon", 2: "rare", 3: "veryRare" }
});

const M = Object.freeze({
  iron: "trade-iron-ingot", copper: "trade-copper-ingot", steel: "trade-steel-ingot",
  silver: "trade-silver-ingot", gold: "trade-gold-ingot", mithral: "trade-mithral-ingot",
  adamantine: "trade-adamantine-ingot", masterwork: "trade-masterwork-alloy",
  softwood: "gathering-softwood", hardwood: "gathering-hardwood", ironwood: "gathering-ironwood",
  leather: "trade-leather-piece", straps: "trade-leather-straps", refinedLeather: "trade-refined-leather",
  thread: "trade-thread", cloth: "trade-cloth", twine: "trade-twine", fineCloth: "trade-fine-cloth",
  coal: "gathering-coal", charcoal: "trade-charcoal", quartz: "gathering-quartz", obsidian: "gathering-obsidian",
  roughGem: "gathering-rough-gemstone", cutGem: "trade-cut-gem", perfectGem: "trade-perfect-gem",
  rawCrystal: "gathering-raw-crystal", refinedCrystal: "trade-refined-crystal", perfectCrystal: "trade-perfect-crystal"
});

// Explicit construction identity for the SRD 5.2 equipment table. Regex fallbacks below
// only protect against harmless naming/localization drift; the English SRD set is curated
// item-by-item here rather than assigning one recipe to every member of a broad category.
const PROFILE_BY_NAME = new Map(Object.entries({
  "club": "wood-weapon", "dagger": "light-metal-weapon", "greatclub": "wood-weapon",
  "handaxe": "light-metal-weapon", "javelin": "polearm", "light hammer": "light-metal-weapon",
  "mace": "metal-weapon", "quarterstaff": "wood-weapon", "sickle": "light-metal-weapon", "spear": "polearm",
  "dart": "light-metal-weapon", "light crossbow": "crossbow", "shortbow": "bow", "sling": "sling",
  "battleaxe": "metal-weapon", "flail": "metal-weapon", "glaive": "polearm", "greataxe": "heavy-weapon",
  "greatsword": "heavy-weapon", "halberd": "polearm", "lance": "polearm", "longsword": "metal-weapon",
  "maul": "heavy-weapon", "morningstar": "metal-weapon", "pike": "polearm", "rapier": "metal-weapon",
  "scimitar": "metal-weapon", "shortsword": "metal-weapon", "trident": "polearm", "war pick": "metal-weapon",
  "warhammer": "metal-weapon", "whip": "whip", "blowgun": "blowgun", "hand crossbow": "crossbow",
  "heavy crossbow": "crossbow", "longbow": "bow", "musket": "firearm", "pistol": "firearm",
  "padded armor": "padded", "padded": "padded", "leather armor": "leather", "leather": "leather",
  "studded leather armor": "studded-leather", "studded leather": "studded-leather", "hide armor": "hide", "hide": "hide",
  "chain shirt": "light-metal-armor", "scale mail": "medium-metal-armor", "breastplate": "medium-metal-armor",
  "half plate armor": "heavy-metal-armor", "half plate": "heavy-metal-armor", "ring mail": "medium-metal-armor",
  "chain mail": "heavy-metal-armor", "splint armor": "heavy-metal-armor", "splint": "heavy-metal-armor",
  "plate armor": "heavy-metal-armor", "plate": "heavy-metal-armor", "shield": "shield",
  "arrow": "arrow-ammo", "arrows": "arrow-ammo", "crossbow bolt": "arrow-ammo", "crossbow bolts": "arrow-ammo",
  "bolt": "arrow-ammo", "bolts": "arrow-ammo", "firearm bullet": "firearm-ammo", "firearm bullets": "firearm-ammo",
  "bullet": "firearm-ammo", "bullets": "firearm-ammo", "sling bullet": "sling-ammo", "sling bullets": "sling-ammo",
  "blowgun needle": "needle-ammo", "blowgun needles": "needle-ammo", "needle": "needle-ammo", "needles": "needle-ammo"
}));

function clone(value) { return foundry.utils.deepClone(value); }
function slug(value) { return String(value ?? "").slugify?.({ strict: true }) ?? String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function valuesOf(value) {
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return [...value];
  if (value?.values instanceof Function) { try { return [...value.values()]; } catch (_) { /* noop */ } }
  return value && typeof value === "object" ? Object.values(value) : [];
}
function priceGp(system={}) {
  const price = system?.price ?? {};
  const rate = { cp: .01, sp: .1, ep: .5, gp: 1, pp: 10 }[String(price.denomination || "gp")] ?? 1;
  return Math.max(0, (Number(price.value) || 0) * rate);
}
function setPriceGp(system, gp) { system.price = { value: Math.max(0, Math.round(Number(gp || 0) * 100) / 100), denomination: "gp" }; }
function hasMagic(item) {
  const props = item.system?.properties;
  const mgc = props?.has?.("mgc") ?? (Array.isArray(props) && props.includes("mgc"));
  const rarity = valuesOf(item.system?.rarities).filter(Boolean).length > 0;
  return Boolean(mgc || rarity || Number(item.system?.magicalBonus) || Number(item.system?.armor?.magicalBonus));
}

export class CuratedEquipmentService {
  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.CURATED_EQUIPMENT_STATE, {
      name: "Crafting Core Curated Equipment State", scope: "world", config: false, type: Object,
      default: { enabled: false, version: 0, restoredAt: 0 }
    });
  }

  static state() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.CURATED_EQUIPMENT_STATE) ?? {};
    return { enabled: Boolean(raw.enabled), version: Number(raw.version) || 0, restoredAt: Number(raw.restoredAt) || 0 };
  }

  static sourcePack() { return game.packs?.get?.(SOURCE_PACK_ID) ?? null; }

  static #isBaseEquipment(item) {
    if (!item || hasMagic(item)) return false;
    if (item.type === "weapon") return WEAPON_TYPES.has(String(item.system?.type?.value || ""));
    if (item.type === "equipment") return ARMOR_TYPES.has(String(item.system?.type?.value || ""));
    if (item.type === "consumable") return String(item.system?.type?.value || "") === "ammo";
    return false;
  }

  static #category(item) {
    if (item.type === "weapon") return "weapon";
    if (item.type === "consumable") return "ammunition";
    return String(item.system?.type?.value || "") === "shield" ? "shield" : "armor";
  }

  static #profile(item) {
    const name = String(item.name || "").toLowerCase();
    const explicit = PROFILE_BY_NAME.get(name);
    if (explicit) return explicit;
    const subtype = String(item.system?.type?.subtype || "").toLowerCase();
    const category = this.#category(item);
    if (category === "armor") {
      if (/padded/.test(name)) return "padded";
      if (/leather/.test(name)) return /studded/.test(name) ? "studded-leather" : "leather";
      if (/hide/.test(name)) return "hide";
      if (/chain shirt|ring mail/.test(name)) return "light-metal-armor";
      if (/scale|breastplate/.test(name)) return "medium-metal-armor";
      if (/half plate|chain mail|splint|plate/.test(name)) return "heavy-metal-armor";
      return "metal-armor";
    }
    if (category === "shield") return "shield";
    if (category === "ammunition") {
      if (/firearm|bullet/.test(subtype) || /firearm|musket|pistol/.test(name)) return "firearm-ammo";
      if (/sling/.test(subtype) || /sling/.test(name)) return "sling-ammo";
      if (/needle/.test(subtype) || /needle/.test(name)) return "needle-ammo";
      return "arrow-ammo";
    }
    if (/longbow|shortbow/.test(name)) return "bow";
    if (/crossbow/.test(name)) return "crossbow";
    if (/musket|pistol/.test(name)) return "firearm";
    if (/glaive|halberd|pike|lance|spear|javelin|trident/.test(name)) return "polearm";
    if (/greatsword|greataxe|maul/.test(name)) return "heavy-weapon";
    if (/longsword|rapier|scimitar|shortsword|battleaxe|warhammer|morningstar|flail|war pick/.test(name)) return "metal-weapon";
    if (/dagger|sickle|handaxe|light hammer|dart/.test(name)) return "light-metal-weapon";
    if (/whip/.test(name)) return "whip";
    if (/sling/.test(name)) return "sling";
    if (/club|greatclub|quarterstaff/.test(name)) return "wood-weapon";
    if (/blowgun/.test(name)) return "blowgun";
    if (/mace/.test(name)) return "metal-weapon";
    return "mixed-weapon";
  }

  static #proficiencies(profile) {
    if (["bow", "arrow-ammo", "crossbow", "blowgun"].includes(profile)) return [{ type: "tool", id: "woodcarver" }, { type: "tool", id: "tinker" }];
    if (["polearm"].includes(profile)) return [{ type: "tool", id: "woodcarver" }, { type: "tool", id: "smith" }];
    if (["firearm", "firearm-ammo", "needle-ammo"].includes(profile)) return [{ type: "tool", id: "smith" }, { type: "tool", id: "tinker" }];
    if (["leather", "studded-leather", "hide", "whip"].includes(profile)) return [{ type: "tool", id: "leatherworker" }, { type: "tool", id: "weaver" }];
    if (["padded", "sling"].includes(profile)) return [{ type: "tool", id: "weaver" }, { type: "tool", id: "leatherworker" }];
    if (["sling-ammo"].includes(profile)) return [{ type: "tool", id: "mason" }, { type: "tool", id: "tinker" }];
    if (["shield"].includes(profile)) return [{ type: "tool", id: "woodcarver" }, { type: "tool", id: "smith" }];
    if (/armor/.test(profile)) return [{ type: "tool", id: "smith" }, { type: "tool", id: "leatherworker" }];
    if (["wood-weapon"].includes(profile)) return [{ type: "tool", id: "woodcarver" }, { type: "tool", id: "carpenter" }];
    return [{ type: "tool", id: "smith" }, { type: "tool", id: "tinker" }];
  }

  static #componentPlan(profile) {
    const P = (kind, share, min=1) => ({ kind, share, min });
    switch (profile) {
      case "padded": return [P("textile", .75, 2), P("leather", .15), P("binding", .10)];
      case "leather": return [P("leather", .75, 2), P("textile", .15), P("binding", .10)];
      case "studded-leather": return [P("leather", .60, 2), P("metal", .25), P("textile", .10), P("fuel", .05)];
      case "hide": return [P("leather", .70, 2), P("textile", .20), P("binding", .10)];
      case "light-metal-armor": return [P("metal", .62, 2), P("leather", .18), P("textile", .12), P("fuel", .08)];
      case "medium-metal-armor": return [P("metal", .70, 3), P("leather", .15), P("textile", .08), P("fuel", .07)];
      case "heavy-metal-armor": return [P("metal", .80, 4), P("leather", .08), P("textile", .06), P("fuel", .06)];
      case "metal-armor": return [P("metal", .72, 3), P("leather", .12), P("textile", .08), P("fuel", .08)];
      case "shield": return [P("wood", .40, 1), P("metal", .40, 1), P("leather", .15), P("binding", .05)];
      case "bow": return [P("wood", .70, 1), P("binding", .20, 1), P("leather", .10)];
      case "crossbow": return [P("wood", .40, 1), P("metal", .35, 1), P("binding", .15), P("leather", .10)];
      case "firearm": return [P("metal", .62, 2), P("wood", .25, 1), P("fuel", .08), P("leather", .05)];
      case "polearm": return [P("wood", .48, 2), P("metal", .37, 1), P("leather", .10), P("binding", .05)];
      case "heavy-weapon": return [P("metal", .72, 2), P("wood", .15, 1), P("leather", .08), P("fuel", .05)];
      case "metal-weapon": return [P("metal", .68, 1), P("wood", .16, 1), P("leather", .10), P("fuel", .06)];
      case "light-metal-weapon": return [P("metal", .60, 1), P("wood", .20, 1), P("leather", .12), P("fuel", .08)];
      case "whip": return [P("leather", .78, 2), P("binding", .22, 1)];
      case "sling": return [P("leather", .55, 1), P("binding", .45, 1)];
      case "wood-weapon": return [P("wood", .80, 1), P("leather", .12), P("binding", .08)];
      case "blowgun": return [P("wood", .82, 1), P("binding", .10), P("metal", .08)];
      case "arrow-ammo": return [P("wood", .55, 1), P("metal", .25, 1), P("binding", .20, 1)];
      case "firearm-ammo": return [P("metal", .70, 1), P("fuel", .30, 1)];
      case "sling-ammo": return [P("stone", .85, 1), P("binding", .15, 1)];
      case "needle-ammo": return [P("metal", .80, 1), P("binding", .20, 1)];
      default: return [P("metal", .55, 1), P("wood", .25, 1), P("leather", .10), P("binding", .10)];
    }
  }

  static #materialUnitCost(id) {
    const entry = MaterialCatalogService.definitions().find(row => row.id === id);
    return Math.max(.01, Number(entry?.price) || 0);
  }

  static #balancedSlot({ label, ids, quantity, materialDocs, slotId }) {
    const refs = ids.map(id => {
      const item = materialDocs.get(id);
      if (!item) throw new Error(`Equipment crafting is missing Material ${id}.`);
      const ref = RecipeService.itemReference(item, 1, { ingredient: true });
      ref.optionId = `option-${slug(id)}`;
      return { id, ref, cost: this.#materialUnitCost(id) };
    });
    const basis = refs[0]?.cost ?? 1;
    const equivalent = refs.every(row => Math.abs(row.cost - basis) < 0.001);
    if (equivalent) return { slotId, label, mode: "pool", quantity: Math.max(1, quantity), options: refs.map(row => row.ref) };
    const target = Math.max(1, quantity) * basis;
    return {
      slotId, label, mode: "or", quantity: 1,
      options: refs.map(row => ({ ...row.ref, quantity: Math.max(1, Math.round(target / Math.max(.01, row.cost))) }))
    };
  }

  static #slotFromComponent(component, targetGp, materialDocs, seed) {
    const ref = (id, quantity=1) => {
      const item = materialDocs.get(id);
      if (!item) throw new Error(`Equipment crafting is missing Material ${id}.`);
      const out = RecipeService.itemReference(item, quantity, { ingredient: true });
      out.optionId = `option-${slug(id)}`;
      return out;
    };
    const commonUnit = Math.max(5, this.#materialUnitCost(M.leather));
    const metalUnit = Math.max(25, this.#materialUnitCost(M.iron));
    const woodBundle = Math.max(25, this.#materialUnitCost(M.hardwood));
    const desired = Math.max(0, targetGp * component.share);
    if (component.kind === "metal") {
      const qty = Math.max(component.min, Math.round(desired / metalUnit) || component.min);
      return this.#balancedSlot({ label: "Structural Metal", ids: [M.iron, M.copper, M.steel], quantity: qty, materialDocs, slotId: `${seed}-metal` });
    }
    if (component.kind === "wood") {
      const bundles = Math.max(component.min, Math.round(desired / woodBundle) || component.min);
      return { slotId: `${seed}-wood`, label: "Wood Structure", mode: "or", quantity: 1, options: [ref(M.softwood, bundles * 5), ref(M.hardwood, bundles)] };
    }
    if (component.kind === "leather") {
      const qty = Math.max(component.min, Math.round(desired / commonUnit) || component.min);
      return { slotId: `${seed}-leather`, label: "Leatherwork", mode: "fixed", quantity: qty, options: [ref(M.leather, qty)] };
    }
    if (component.kind === "textile") {
      const qty = Math.max(component.min, Math.round(desired / commonUnit) || component.min);
      return this.#balancedSlot({ label: "Textile & Padding", ids: [M.thread, M.cloth], quantity: qty, materialDocs, slotId: `${seed}-textile` });
    }
    if (component.kind === "binding") {
      const qty = Math.max(component.min, Math.round(desired / commonUnit) || component.min);
      return this.#balancedSlot({ label: "Binding & Cordage", ids: [M.thread, M.twine], quantity: qty, materialDocs, slotId: `${seed}-binding` });
    }
    if (component.kind === "fuel") {
      const qty = Math.max(component.min, Math.round(desired / commonUnit) || component.min);
      return this.#balancedSlot({ label: "Forge Fuel", ids: [M.coal, M.charcoal], quantity: qty, materialDocs, slotId: `${seed}-fuel` });
    }
    const quartzCost = Math.max(5, this.#materialUnitCost(M.quartz));
    const qty = Math.max(component.min, Math.round(desired / quartzCost) || component.min);
    return { slotId: `${seed}-stone`, label: "Stone Shot", mode: "fixed", quantity: qty, options: [ref(M.quartz, qty)] };
  }

  static #enhancementSlot(bonus, category, profile, materialDocs, seed) {
    if (!bonus) return null;
    const cost = (category === "armor" ? MAGIC_COST.armor : MAGIC_COST.standard)[bonus];
    let spec;
    if (bonus === 1) {
      // The first magical tier keeps the construction identity visible: fine wood for bows/shafts,
      // refined leather for leatherwork, fine cloth for padded/textile work, and precious metal for
      // metal-heavy construction. Gem/crystal alternatives remain available to every family.
      const woodHeavy = ["bow", "crossbow", "wood-weapon", "blowgun", "polearm", "shield", "arrow-ammo"].includes(profile);
      const leatherHeavy = ["leather", "studded-leather", "hide", "whip", "sling"].includes(profile);
      const textileHeavy = profile === "padded";
      const ids = woodHeavy
        ? [M.ironwood, M.cutGem, M.refinedCrystal]
        : leatherHeavy
          ? [M.refinedLeather, M.cutGem, M.refinedCrystal]
          : textileHeavy
            ? [M.fineCloth, M.cutGem, M.refinedCrystal]
            : [M.silver, M.gold, M.cutGem, M.refinedCrystal];
      spec = { label: "Refined Enhancement Materials", unit: 100, ids };
    } else if (bonus === 2) spec = { label: "Masterwork Enhancement Materials", unit: 500, ids: [M.mithral, M.masterwork, M.perfectCrystal] };
    else spec = { label: "Apex Enhancement Materials", unit: 1000, ids: [M.adamantine, M.perfectGem] };
    return this.#balancedSlot({ label: spec.label, ids: spec.ids, quantity: Math.max(1, Math.round(cost / spec.unit)), materialDocs, slotId: `${seed}-enhancement` });
  }

  static #productFolders() {
    return [
      { key: "equipment", name: "Equipment" },
      { key: "equipment:weapons", name: "Weapons", parent: "equipment" },
      { key: "equipment:armor", name: "Armor & Shields", parent: "equipment" },
      { key: "equipment:ammo", name: "Ammunition", parent: "equipment" }
    ];
  }
  static #knowledgeFolders() {
    return [
      { key: "curated", name: "Crafting Core Curated" },
      { key: "curated:equipment", name: "Equipment", parent: "curated" },
      { key: "curated:equipment:weapons", name: "Weapons", parent: "curated:equipment" },
      { key: "curated:equipment:armor", name: "Armor & Shields", parent: "curated:equipment" },
      { key: "curated:equipment:ammo", name: "Ammunition", parent: "curated:equipment" }
    ];
  }
  static #folderKey(category, knowledge=false) {
    const suffix = category === "weapon" ? "weapons" : category === "ammunition" ? "ammo" : "armor";
    return knowledge ? `curated:equipment:${suffix}` : `equipment:${suffix}`;
  }

  static #productId(base, bonus) { return `equipment-${slug(base.system?.identifier || base.name)}-${bonus}`; }
  static #recipeId(base, bonus) { return `equipment-recipe-${slug(base.system?.identifier || base.name)}-${bonus}`; }

  static #productData(base, bonus, folderId) {
    const category = this.#category(base);
    const data = normalizeItemSourceForDnd5e6(clone(base.toObject(true)));
    for (const key of ["_id", "folder", "sort", "ownership", "_stats", "pack"]) delete data[key];
    data.folder = folderId;
    data.name = bonus ? `${base.name} +${bonus}` : base.name;
    data.system ??= {};
    data.system.quantity = 1;
    const rarity = RARITY[category]?.[bonus] ?? "";
    data.system.rarities = rarityArray(rarity);
    const props = new Set(valuesOf(data.system.properties).map(String));
    if (bonus) props.add("mgc"); else props.delete("mgc");
    data.system.properties = [...props];
    if (data.type === "equipment") {
      data.system.armor ??= {};
      data.system.armor.magicalBonus = bonus ? String(bonus) : "";
    } else data.system.magicalBonus = bonus ? String(bonus) : "";
    const basePrice = priceGp(base.system);
    const magicCost = bonus ? (category === "armor" ? MAGIC_COST.armor[bonus] : MAGIC_COST.standard[bonus]) : 0;
    const productValue = basePrice + magicCost;
    setPriceGp(data.system, category === "ammunition" ? productValue / 10 : productValue);
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      [FLAGS.CURATED]: true, [FLAGS.CURATED_ID]: this.#productId(base, bonus),
      [FLAGS.CURATED_KIND]: "equipment-product", [FLAGS.CURATED_VERSION]: VERSION,
      [FLAGS.PRODUCT]: true, [FLAGS.PRODUCT_ID]: this.#productId(base, bonus),
      [FLAGS.PRODUCT_CATEGORY]: "equipment", [FLAGS.PRODUCT_SUBCATEGORY]: category,
      [FLAGS.PRODUCT_RARITY]: rarity, [FLAGS.PRODUCT_TIER]: bonus,
      [FLAGS.PRODUCT_YIELD]: category === "ammunition" ? 10 : 1,
      [FLAGS.PRODUCT_MANAGED]: true, [FLAGS.PRODUCT_CANONICAL_SOURCE]: String(base.uuid || ""),
      equipmentBaseName: base.name, equipmentBonus: bonus, equipmentCraftTargetGp: magicCost
    };
    return data;
  }

  static async #replaceProduct(item, data) {
    const desiredActivities = clone(data.system?.activities ?? {});
    const desiredEffects = clone(data.effects ?? []);
    if (data.system) delete data.system.activities;
    delete data.effects; delete data._id; delete data.ownership;
    const currentActivityIds = Object.keys(item._source?.system?.activities ?? {});
    data.system ??= {};
    data.system.activities = { ...forcedDeletionMap(currentActivityIds), ...desiredActivities };
    const effectIds = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
    if (effectIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", effectIds, { render: false });
    await item.update(data, { render: false });
    if (desiredEffects.length) await item.createEmbeddedDocuments("ActiveEffect", desiredEffects, { keepId: true, render: false });
    return item;
  }

  static async #syncProducts(entries, { onProgress=null, overallBase=0, overallTotal=1 }={}) {
    const pack = await ProductSourceService.ensureProductsPack();
    const folders = await CompendiumService.ensurePackFolders(pack, this.#productFolders());
    const wasLocked = Boolean(pack.locked); if (wasLocked) await pack.configure({ locked: false });
    let created = 0, updated = 0, current = 0;
    const documents = new Map();
    try {
      const docs = await pack.getDocuments();
      const byId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_ID) ?? ""), item]).filter(([id]) => id));
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      for (const entry of entries) {
        const id = this.#productId(entry.base, entry.bonus);
        const folder = folders.get(this.#folderKey(entry.category)) ?? folders.get("equipment") ?? null;
        const data = this.#productData(entry.base, entry.bonus, folder?.id ?? null);
        let item = byId.get(id) ?? null;
        if (!item) {
          const [made] = await ItemClass.createDocuments([data], { pack: pack.collection });
          item = made; created += 1;
        } else { await this.#replaceProduct(item, data); updated += 1; }
        if (!item) throw new Error(`Could not persist Equipment Product ${data.name}.`);
        // Mundane (+0) equipment follows the installed SRD 5.2 mother Item and keeps this
        // managed Product as its fallback. Magical +1/+2/+3 variants are generated identities
        // owned by this curated library, so their mother source is the Product itself.
        await ProductSourceService.bindExistingFallback(item, { source: entry.bonus === 0 && entry.category !== "ammunition" ? entry.base : item });
        documents.set(id, item);
        current += 1;
        onProgress?.({ phase: "Restoring Equipment Products", label: data.name, current, total: entries.length, overallCurrent: overallBase + current, overallTotal, stats: { products: current, created, updated } });
      }
      return { pack, documents, created, updated };
    } finally { if (wasLocked) await pack.configure({ locked: true }); }
  }

  static #recipe(base, bonus, product, materialDocs) {
    const category = this.#category(base), profile = this.#profile(base);
    const baseTarget = Math.max(5, priceGp(base.system) / 2);
    const seed = `${slug(base.system?.identifier || base.name)}-${bonus}`;
    const ingredients = this.#componentPlan(profile).map(component => this.#slotFromComponent(component, baseTarget, materialDocs, seed));
    const enhancement = this.#enhancementSlot(bonus, category, profile, materialDocs, seed);
    if (enhancement) ingredients.push(enhancement);
    const proficiencies = this.#proficiencies(profile);
    const requiredWork = 2 + (bonus * 2);
    const quantity = category === "ammunition" ? 10 : 1;
    return RecipeService.snapshot({
      id: this.#recipeId(base, bonus), name: bonus ? `${base.name} +${bonus}` : base.name, img: product.img,
      description: `Curated equipment project for ${bonus ? `${base.name} +${bonus}` : base.name}. Ingredient Slots represent valid construction alternatives; Mix / Pool slots may be filled with any combination of their listed materials.`,
      craftingMode: "project", craftingTime: 0,
      project: {
        requiredWork, cadence: "long",
        progressCheck: { required: false, timing: "every", type: "ability", id: "con", dc: 10, failure: { mode: "noProgress", regressBy: 1, loseMaterials: false, lossPercent: 0 } },
        extraEffort: { enabled: true, type: "ability", id: "con", dc: 12, progressGain: 1, failure: { mode: "noProgress", regressBy: 1 } }
      },
      craftingResolution: {
        proficiencies, proficiencyMatch: "any", attemptPolicy: "anyone", proficientPolicy: "automaticSuccess",
        check: { required: true, type: proficiencies[0].type, id: proficiencies[0].id, dc: 13 },
        failure: { mode: "noProgress", regressBy: 1, loseMaterials: false, lossPercent: 0 }
      },
      learning: { access: "anyone" },
      playerVisibility: {
        output: true, ingredients: true, ingredientQuantities: true, craftCount: true, proficiencies: true,
        attemptPolicy: true, craftingCheck: true, craftingDC: true, failure: true, failurePercent: false,
        craftingTime: true, projectProgress: true, progressCheck: false, progressDC: false, progressFailure: false,
        progressFailurePercent: false, extraEffort: true, extraEffortCheck: true, extraEffortDC: true,
        extraEffortFailure: true, description: true
      },
      ingredients,
      result: null,
      knowledge: { label: "Blueprint", name: `Blueprint — ${bonus ? `${base.name} +${bonus}` : base.name}`, img: KNOWLEDGE_ICONS.Blueprint },
      publication: null, createdAt: Date.now(), updatedAt: Date.now()
    });
  }

  static async #updateKnowledge(item, data) {
    const desiredActivities = clone(data.system?.activities ?? {});
    if (data.system) delete data.system.activities;
    delete data._id; delete data.ownership;
    item = await KnowledgeItemService.clearPersistedRecipeSnapshot(item);
    await item.update(data, { render: false });
    const ids = valuesOf(item.system?.activities).map(activity => activity?.id ?? activity?._id).filter(Boolean);
    if (ids.length) await item.update({ "system.activities": forcedDeletionMap(ids) }, { render: false });
    if (Object.keys(desiredActivities).length) await item.update({ "system.activities": desiredActivities }, { render: false });
    return item;
  }

  static async #syncRecipes(entries, productDocs, materialDocs, { onProgress=null, overallBase=0, overallTotal=1 }={}) {
    const pack = await KnowledgeItemService.ensurePack();
    const folders = await CompendiumService.ensurePackFolders(pack, this.#knowledgeFolders());
    const wasLocked = Boolean(pack.locked); if (wasLocked) await pack.configure({ locked: false });
    let created = 0, updated = 0, current = 0;
    try {
      const docs = await pack.getDocuments();
      const byId = new Map(docs.map(item => [String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? ""), item]).filter(([id]) => id));
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      const drafts = [];
      for (const entry of entries) {
        const productId = this.#productId(entry.base, entry.bonus);
        const product = productDocs.get(productId);
        if (!product) throw new Error(`Missing Equipment Product ${productId}.`);
        let recipe = this.#recipe(entry.base, entry.bonus, product, materialDocs);
        recipe.result = await ProductSourceService.referenceForItem(product, entry.category === "ammunition" ? 10 : 1);
        recipe = RecipeService.snapshot(recipe);
        let existing = byId.get(recipe.id) ?? null;
        if (existing) recipe.publication = {
          uuid: existing.uuid, pack: pack.collection, sourceType: "Blueprint",
          publishedAt: Number(existing.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(), updatedAt: Date.now()
        };
        const folder = folders.get(this.#folderKey(entry.category, true)) ?? folders.get("curated:equipment") ?? null;
        const data = KnowledgeItemService.knowledgeItemData(recipe, { folderId: folder?.id ?? null, published: true });
        data.flags[MODULE_ID] = {
          ...(data.flags[MODULE_ID] ?? {}), [FLAGS.CURATED]: true, [FLAGS.CURATED_ID]: recipe.id,
          [FLAGS.CURATED_KIND]: "equipment-recipe", [FLAGS.CURATED_VERSION]: VERSION,
          [FLAGS.PRODUCT_ID]: productId, [FLAGS.PRODUCT_CATEGORY]: "equipment",
          [FLAGS.PRODUCT_SUBCATEGORY]: entry.category, [FLAGS.PRODUCT_TIER]: entry.bonus,
          [FLAGS.PRODUCT_YIELD]: entry.category === "ammunition" ? 10 : 1
        };
        if (!existing) {
          const [made] = await ItemClass.createDocuments([data], { pack: pack.collection });
          existing = made; created += 1;
        } else { await this.#updateKnowledge(existing, data); updated += 1; }
        if (!existing) throw new Error(`Could not persist Equipment Blueprint ${recipe.name}.`);
        // Keep the GM Builder draft synchronized with the authoritative Curated definition.
        const draft = RecipeService.normalize({ ...recipe, publication: {
          uuid: existing.uuid, pack: pack.collection, sourceType: "Blueprint",
          publishedAt: Number(existing.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(), updatedAt: Date.now()
        }});
        drafts.push(draft);
        current += 1;
        onProgress?.({ phase: "Restoring Equipment Blueprints", label: recipe.name, current, total: entries.length, overallCurrent: overallBase + current, overallTotal, stats: { recipes: current, created, updated } });
      }
      await RecipeService.saveMany(drafts);
      return { pack, created, updated };
    } finally { if (wasLocked) await pack.configure({ locked: true }); }
  }

  static async baseItems() {
    const pack = this.sourcePack();
    if (!pack) return [];
    const docs = await pack.getDocuments();
    return docs.filter(item => this.#isBaseEquipment(item)).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  }

  static async catalogContext() {
    const state = this.state();
    const bases = await this.baseItems();
    const products = ProductSourceService.productsPack();
    const learn = KnowledgeItemService.pack();
    const productDocs = products ? await products.getDocuments() : [];
    const knowledgeDocs = learn ? await learn.getDocuments() : [];
    const productCount = productDocs.filter(item => item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "equipment-product").length;
    const recipeCount = knowledgeDocs.filter(item => item.getFlag(MODULE_ID, FLAGS.CURATED_KIND) === "equipment-recipe").length;
    const total = bases.length * 4;
    const categoryCounts = bases.reduce((counts, item) => {
      const key = this.#category(item);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
    return {
      enabled: state.enabled, sourceAvailable: Boolean(this.sourcePack()), baseCount: bases.length,
      productCount, recipeCount, productTotal: total, recipeTotal: total,
      groups: [
        { label: "Weapons", baseCount: categoryCounts.weapon ?? 0, variantCount: (categoryCounts.weapon ?? 0) * 4 },
        { label: "Armor", baseCount: categoryCounts.armor ?? 0, variantCount: (categoryCounts.armor ?? 0) * 4 },
        { label: "Shields", baseCount: categoryCounts.shield ?? 0, variantCount: (categoryCounts.shield ?? 0) * 4 },
        { label: "Ammunition", baseCount: categoryCounts.ammunition ?? 0, variantCount: (categoryCounts.ammunition ?? 0) * 4 }
      ],
      statusLabel: !this.sourcePack() ? "SRD 5.2 Equipment pack unavailable" : state.enabled ? "Installed" : "Not installed"
    };
  }

  static async restoreAll({ onProgress=null }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can restore Curated Equipment.");
    const bases = await this.baseItems();
    if (!bases.length) throw new Error("No mundane weapons, armor, shields, or ammunition were found in dnd5e.equipment24.");
    const materialDocs = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const entries = bases.flatMap(base => [0, 1, 2, 3].map(bonus => ({ base, bonus, category: this.#category(base) })));
    const overallTotal = entries.length * 2;
    const products = await this.#syncProducts(entries, { onProgress, overallBase: 0, overallTotal });
    const recipes = await this.#syncRecipes(entries, products.documents, materialDocs, { onProgress, overallBase: entries.length, overallTotal });
    await game.settings.set(MODULE_ID, SETTINGS.CURATED_EQUIPMENT_STATE, { enabled: true, version: VERSION, restoredAt: Date.now() });
    await KnowledgeItemService.rebuildAuthorityCache();
    const reconciliation = await KnowledgeItemService.reconcilePublishedKnowledge();
    onProgress?.({ phase: "Equipment Complete", label: "Products and Blueprints are restored.", current: 1, total: 1, overallCurrent: overallTotal, overallTotal, stats: { products: entries.length, recipes: entries.length, created: products.created + recipes.created, updated: products.updated + recipes.updated } });
    return { baseItems: bases.length, products, recipes, reconciliation, total: entries.length };
  }
}
