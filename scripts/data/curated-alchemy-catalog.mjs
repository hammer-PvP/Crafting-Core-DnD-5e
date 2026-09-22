/**
 * Optional Curated Alchemy & Inscription catalog.
 *
 * Canonical consumables are resolved from the installed D&D5e SRD 5.2 / 5.1 packs at runtime.
 * Crafting Core does not bundle SRD Item snapshots. Inscription Products are presentation variants
 * of the same canonical SRD Item source, preserving native Activities, effects and consumption data.
 */

export const CURATED_ALCHEMY_VERSION = 5;

export const CURATED_ALCHEMY_MATERIAL_IDS = Object.freeze(new Set([
  "creature-regenerative-ichor", "creature-venomous-ichor", "creature-corrosive-ichor", "creature-ooze-mucus",
  "creature-feyheart-nectar", "creature-regenerative-tissue", "creature-giant-heart", "creature-vaporous-membrane",
  "creature-regenerative-core", "creature-titanic-core", "creature-accelerated-heart", "creature-aerial-heart",
  "creature-primordial-giant-heart", "gathering-moonmoss", "gathering-deepcap-fungus", "gathering-blood-orchid",
  "gathering-starpetal", "gathering-deepheart-fungus", "gathering-moon-orchid", "gathering-ghost-lotus",
  "gathering-stoneheart-morel", "gathering-worldroot-blossom", "gathering-astral-rose"
]));


export const INSCRIPTION_ICONS = Object.freeze({
  basic: "icons/sundries/documents/document-gold.webp",
  elaborate: "icons/sundries/documents/document-bound-white.webp",
  elite: "icons/sundries/books/book-open-purple.webp"
});

const ROOT = "modules/dnd5e-crafting-core/icons/products/drinks";
export const INK_ICONS = Object.freeze({
  common: `${ROOT}/drink-bottle-flask-black.webp`,
  uncommon: `${ROOT}/drink-bottle-flask-green.webp`,
  rare: `${ROOT}/drink-bottle-flask-blue.webp`,
  veryRare: `${ROOT}/drink-bottle-flask-purple.webp`,
  legendary: `${ROOT}/drink-bottle-flask-gold.webp`
});

const source = (pack, id, name) => ({ pack, id, name });
const srd = (name, id, aliases=[]) => Object.freeze({
  preferred: [source("dnd5e.equipment24", id, name)],
  packs: ["dnd5e.equipment24", "dnd5e.items"],
  names: [name, ...aliases]
});

export const SRD_ITEM_SOURCES = Object.freeze({
  "potion-healing": srd("Potion of Healing", "phbagPotionofHea"),
  "potion-healing-greater": srd("Potion of Healing (Greater)", "dmgGreaterPotion", ["Potion of Greater Healing", "Potion of Healing, Greater"]),
  "potion-healing-superior": srd("Potion of Healing (Superior)", "dmgSuperiorPotio", ["Potion of Superior Healing", "Potion of Healing, Superior"]),
  "potion-healing-supreme": srd("Potion of Healing (Supreme)", "dmgSupremePotion", ["Potion of Supreme Healing", "Potion of Healing, Supreme"]),
  antitoxin: srd("Antitoxin", "phbagAntitoxin00"),
  "poison-basic": srd("Poison, Basic", "phbagPoisonBasic", ["Basic Poison"]),
  acid: srd("Acid", "phbagAcid0000000"),
  "alchemists-fire": srd("Alchemist's Fire", "phbagAlchemistsF", ["Alchemist’s Fire"]),
  "holy-water": srd("Holy Water", "phbagHolyWater00"),
  "potion-climbing": srd("Potion of Climbing", "dmgPotionOfClimb"),
  "potion-animal-friendship": srd("Potion of Animal Friendship", "dmgPotionOfAnima"),
  "potion-growth": srd("Potion of Growth", "dmgPotionOfGrowt"),
  "potion-poison": srd("Potion of Poison", "dmgPotionOfPoiso"),
  "oil-slipperiness": srd("Oil of Slipperiness", "dmgOilOfSlipperi"),
  "dust-dryness": srd("Dust of Dryness", "dmgDustOfDryness"),
  "philter-love": srd("Philter of Love", "dmgPhilterOfLove"),
  "potion-water-breathing": srd("Potion of Water Breathing", "dmgPotionOfWater"),
  "potion-resistance": srd("Potion of Resistance", "dmgPotionOfResis"),
  "giant-hill": srd("Potion of Giant Strength (Hill)", "dmgHillPotionOfG", ["Potion of Hill Giant Strength"]),
  "giant-stone": srd("Potion of Giant Strength (Stone)", "dmgStonePotionOf", ["Potion of Stone Giant Strength"]),
  "giant-frost": srd("Potion of Giant Strength (Frost)", "dmgFrostPotionOf", ["Potion of Frost Giant Strength"]),
  "giant-fire": srd("Potion of Giant Strength (Fire)", "dmgFirePotionOfG", ["Potion of Fire Giant Strength"]),
  "giant-cloud": srd("Potion of Giant Strength (Cloud)", "dmgCloudPotionOf", ["Potion of Cloud Giant Strength"]),
  "giant-storm": srd("Potion of Giant Strength (Storm)", "dmgStormPotionOf", ["Potion of Storm Giant Strength"]),
  "potion-heroism": srd("Potion of Heroism", "dmgPotionOfHeroi"),
  "potion-gaseous-form": srd("Potion of Gaseous Form", "dmgPotionOfGaseo"),
  "potion-clairvoyance": srd("Potion of Clairvoyance", "dmgPotionOfClair"),
  "potion-mind-reading": srd("Potion of Mind Reading", "dmgPotionOfMindR"),
  "potion-invulnerability": srd("Potion of Invulnerability", "dmgPotionOfInvul"),
  "potion-invisibility": srd("Potion of Invisibility", "dmgPotionOfInvis"),
  "potion-speed": srd("Potion of Speed", "dmgPotionOfSpeed"),
  "potion-flying": srd("Potion of Flying", "dmgPotionOfFlyin"),
  "potion-vitality": srd("Potion of Vitality", "dmgPotionOfVital"),
  "potion-longevity": srd("Potion of Longevity", "dmgPotionOfLonge"),
  vial: srd("Vial", "phbagVial0000000"),
  pouch: srd("Pouch", "phbagPouch000000"),
  parchment: srd("Parchment", "phbagParchment00")
});

const M = (id, quantity=1) => ({ kind: "material", id, quantity });
const S = (key, quantity=1) => ({ kind: "srd", key, quantity });
const P = (id, quantity=1) => ({ kind: "product", id, quantity });
const tool = id => ({ type: "tool", id });
const skill = id => ({ type: "skill", id });

export const PROFICIENCIES = Object.freeze({
  alchemist: tool("alchemist"),
  herbalism: tool("herb"),
  poisoner: tool("pois"),
  calligrapher: tool("calligrapher"),
  arcana: skill("arc"),
  religion: skill("rel")
});

const productId = id => `crafting-core-alchemy-product-${id}`;
const recipeId = id => `crafting-core-alchemy-recipe-${id}`;

const canonical = (id, sourceKey, folderKey, { category="alchemy", subcategory="consumable", name=null, variant=null }={}) => ({
  id, productId: productId(id), kind: "canonical", sourceKey, folderKey, category, subcategory,
  ...(name ? { name } : {}), ...(variant ? { variant } : {})
});
const inscription = (id, name, sourceKey, tier, { subcategory="inscription", variant=null }={}) => ({
  id, productId: productId(id), kind: "inscription", name, sourceKey, tier,
  icon: INSCRIPTION_ICONS[tier], folderKey: `inscription:${tier}`, category: "inscription", subcategory,
  ...(variant ? { variant } : {})
});
const ink = (rarity, label, priceGp) => ({
  id: `inscription-ink-${rarity}`, productId: productId(`inscription-ink-${rarity}`), kind: "ink",
  name: `${label} Inscription Ink`, rarity, priceGp, icon: INK_ICONS[rarity],
  folderKey: "inscription:inks", category: "inscription", subcategory: "ink"
});

const products = [
  ink("common", "Common", 25), ink("uncommon", "Uncommon", 125), ink("rare", "Rare", 500),
  ink("veryRare", "Very Rare", 2500), ink("legendary", "Legendary", 5000),

  canonical("potion-healing", "potion-healing", "alchemy:healing"),
  canonical("potion-healing-greater", "potion-healing-greater", "alchemy:healing"),
  canonical("potion-healing-superior", "potion-healing-superior", "alchemy:healing"),
  canonical("potion-healing-supreme", "potion-healing-supreme", "alchemy:healing"),
  canonical("antitoxin", "antitoxin", "alchemy:basic"),
  canonical("poison-basic", "poison-basic", "alchemy:basic"),
  canonical("acid", "acid", "alchemy:basic"),
  canonical("alchemists-fire", "alchemists-fire", "alchemy:basic"),
  canonical("holy-water", "holy-water", "alchemy:basic"),
  canonical("potion-climbing", "potion-climbing", "alchemy:utility"),
  canonical("potion-animal-friendship", "potion-animal-friendship", "alchemy:utility"),
  canonical("potion-growth", "potion-growth", "alchemy:utility"),
  canonical("potion-poison", "potion-poison", "alchemy:utility"),
  canonical("oil-slipperiness", "oil-slipperiness", "alchemy:utility"),
  canonical("dust-dryness", "dust-dryness", "alchemy:utility"),
  canonical("philter-love", "philter-love", "alchemy:utility"),
  canonical("potion-water-breathing", "potion-water-breathing", "alchemy:utility"),
  canonical("giant-hill", "giant-hill", "alchemy:giant"), canonical("giant-stone", "giant-stone", "alchemy:giant"),
  canonical("giant-frost", "giant-frost", "alchemy:giant"), canonical("giant-fire", "giant-fire", "alchemy:giant"),
  canonical("giant-cloud", "giant-cloud", "alchemy:giant"), canonical("giant-storm", "giant-storm", "alchemy:giant"),
  canonical("potion-heroism", "potion-heroism", "alchemy:advanced"),
  canonical("potion-gaseous-form", "potion-gaseous-form", "alchemy:advanced"),
  canonical("potion-clairvoyance", "potion-clairvoyance", "alchemy:advanced"),
  canonical("potion-mind-reading", "potion-mind-reading", "alchemy:advanced"),
  canonical("potion-invulnerability", "potion-invulnerability", "alchemy:advanced"),
  canonical("potion-invisibility", "potion-invisibility", "alchemy:advanced"),
  canonical("potion-speed", "potion-speed", "alchemy:advanced"),
  canonical("potion-flying", "potion-flying", "alchemy:advanced"),
  canonical("potion-vitality", "potion-vitality", "alchemy:advanced"),
  canonical("potion-longevity", "potion-longevity", "alchemy:advanced"),

  inscription("inscription-healing", "Healing Inscription", "potion-healing", "basic"),
  inscription("inscription-healing-greater", "Greater Healing Inscription", "potion-healing-greater", "basic"),
  inscription("inscription-healing-superior", "Superior Healing Inscription", "potion-healing-superior", "elaborate"),
  inscription("inscription-healing-supreme", "Supreme Healing Inscription", "potion-healing-supreme", "elite"),
  inscription("inscription-climbing", "Climbing Inscription", "potion-climbing", "basic"),
  inscription("inscription-animal-friendship", "Animal Friendship Inscription", "potion-animal-friendship", "basic"),
  inscription("inscription-growth", "Growth Inscription", "potion-growth", "basic"),
  inscription("inscription-water-breathing", "Water Breathing Inscription", "potion-water-breathing", "basic"),
  inscription("inscription-hill-strength", "Hill Giant Strength Inscription", "giant-hill", "basic"),
  inscription("inscription-stone-strength", "Stone Giant Strength Inscription", "giant-stone", "elaborate"),
  inscription("inscription-frost-strength", "Frost Giant Strength Inscription", "giant-frost", "elaborate"),
  inscription("inscription-fire-strength", "Fire Giant Strength Inscription", "giant-fire", "elite"),
  inscription("inscription-cloud-strength", "Cloud Giant Strength Inscription", "giant-cloud", "elite"),
  inscription("inscription-storm-strength", "Storm Giant Strength Inscription", "giant-storm", "elite"),
  inscription("inscription-heroism", "Heroism Inscription", "potion-heroism", "elaborate"),
  inscription("inscription-gaseous-form", "Gaseous Form Inscription", "potion-gaseous-form", "elaborate"),
  inscription("inscription-clairvoyance", "Clairvoyance Inscription", "potion-clairvoyance", "elaborate"),
  inscription("inscription-mind-reading", "Mind Reading Inscription", "potion-mind-reading", "elaborate"),
  inscription("inscription-invulnerability", "Invulnerability Inscription", "potion-invulnerability", "elaborate"),
  inscription("inscription-invisibility", "Invisibility Inscription", "potion-invisibility", "elite"),
  inscription("inscription-speed", "Speed Inscription", "potion-speed", "elite"),
  inscription("inscription-flying", "Flying Inscription", "potion-flying", "elite"),
  inscription("inscription-vitality", "Vitality Inscription", "potion-vitality", "elite"),
  inscription("inscription-longevity", "Longevity Inscription", "potion-longevity", "elite")
];

const resistanceTypes = [
  ["acid", "Acid", "essence-acid", "gathering-bitter-fungus", PROFICIENCIES.poisoner],
  ["cold", "Cold", "essence-cold", "gathering-wild-sage", PROFICIENCIES.herbalism],
  ["fire", "Fire", "essence-fire", "gathering-bitter-fungus", PROFICIENCIES.herbalism],
  ["force", "Force", "essence-force", "gathering-wild-sage", PROFICIENCIES.arcana],
  ["lightning", "Lightning", "essence-lightning", "gathering-wild-sage", PROFICIENCIES.arcana],
  ["necrotic", "Necrotic", "undead-necrotic-essence", "gathering-bitter-fungus", PROFICIENCIES.religion],
  ["poison", "Poison", "essence-poison", "gathering-bitter-fungus", PROFICIENCIES.poisoner],
  ["psychic", "Psychic", "essence-psychic", "gathering-wild-sage", PROFICIENCIES.arcana],
  ["radiant", "Radiant", "essence-radiant", "gathering-wild-sage", PROFICIENCIES.religion],
  ["thunder", "Thunder", "essence-thunder", "gathering-wild-sage", PROFICIENCIES.arcana]
];
for (const [key, label] of resistanceTypes) {
  const variant = { type: "resistance", key, label };
  products.push(
    canonical(`potion-resistance-${key}`, "potion-resistance", "alchemy:resistance", {
      name: `Potion of ${label} Resistance`, subcategory: "resistance", variant
    }),
    inscription(`inscription-resistance-${key}`, `${label} Resistance Inscription`, "potion-resistance", "basic", {
      subcategory: "resistance-inscription", variant
    })
  );
}

export const CURATED_ALCHEMY_PRODUCTS = Object.freeze(products.map(Object.freeze));
export const CURATED_ALCHEMY_PRODUCTS_BY_ID = new Map(CURATED_ALCHEMY_PRODUCTS.map(row => [row.productId, row]));

const finalCheck = proficiencies => ({
  proficiencies,
  proficiencyMatch: "any",
  attemptPolicy: "anyone",
  proficientPolicy: "automaticSuccess",
  check: { required: true, type: proficiencies[0]?.type ?? "skill", id: proficiencies[0]?.id ?? "arc", dc: 8 },
  failure: { mode: "failProject", regressBy: 1, loseMaterials: true, lossPercent: 50 }
});

const timed = (id, name, output, ingredients, proficiencies, group, description="") => ({
  id, recipeId: recipeId(id), name, productId: productId(output), resultQuantity: 1,
  ingredients, proficiencies, group, craftingMode: "timed", craftingTime: 10,
  description: description || `${name} is a Curated Alchemy method using the Crafting Core material ecosystem.`
});
const project = (id, name, output, ingredients, tier, group, description="") => ({
  id, recipeId: recipeId(id), name, productId: productId(output), resultQuantity: 1,
  ingredients, proficiencies: [PROFICIENCIES.calligrapher, PROFICIENCIES.arcana], group,
  craftingMode: "project", tier, requiredWork: tier === "basic" ? 1 : tier === "elaborate" ? 2 : 3,
  description: description || `${name} binds the same magic as its SRD consumable counterpart into a written Inscription.`
});
const inkRecipe = (id, name, outputRarity, materialId) => ({
  id, recipeId: recipeId(id), name, productId: productId(`inscription-ink-${outputRarity}`), resultQuantity: 2,
  ingredients: [M(materialId, 5)], proficiencies: [PROFICIENCIES.calligrapher, PROFICIENCIES.alchemist],
  group: "inscription:inks", craftingMode: "timed", craftingTime: 10,
  description: `${name} produces two measures of ${products.find(p => p.id === `inscription-ink-${outputRarity}`)?.name ?? "Inscription Ink"}.`
});

const recipes = [
  inkRecipe("ink-common-sage", "Common Inscription Ink — Sage Pigment Method", "common", "gathering-wild-sage"),
  inkRecipe("ink-common-elvenleaf", "Common Inscription Ink — Elvenleaf Pigment Method", "common", "gathering-elfleaf"),
  inkRecipe("ink-uncommon-blackwater", "Uncommon Inscription Ink — Blackwater Flower Method", "uncommon", "gathering-blackwater-flower"),
  inkRecipe("ink-uncommon-ashen", "Uncommon Inscription Ink — Ashen Lichen Method", "uncommon", "gathering-ashen-lichen"),
  inkRecipe("ink-rare-blood-orchid", "Rare Inscription Ink — Blood Orchid Method", "rare", "gathering-blood-orchid"),
  inkRecipe("ink-rare-starpetal", "Rare Inscription Ink — Starpetal Method", "rare", "gathering-starpetal"),
  inkRecipe("ink-veryrare-moon-orchid", "Very Rare Inscription Ink — Moon Orchid Method", "veryRare", "gathering-moon-orchid"),
  inkRecipe("ink-veryrare-ghost-lotus", "Very Rare Inscription Ink — Ghost Lotus Method", "veryRare", "gathering-ghost-lotus"),
  inkRecipe("ink-legendary-worldroot", "Legendary Inscription Ink — Worldroot Blossom Method", "legendary", "gathering-worldroot-blossom"),
  inkRecipe("ink-legendary-astral", "Legendary Inscription Ink — Astral Rose Method", "legendary", "gathering-astral-rose"),

  timed("healing-traditional", "Potion of Healing — Traditional", "potion-healing", [M("gathering-wild-sage",3), M("gathering-elfleaf",1), S("vial",1)], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("healing-elven", "Potion of Healing — Elven", "potion-healing", [M("gathering-elfleaf",3), M("gathering-common-root",1), S("vial",1)], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("healing-dwarven", "Potion of Healing — Dwarven", "potion-healing", [M("gathering-bitter-fungus",2), M("gathering-common-root",2), M("trade-alcohol",1)], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  project("inscription-healing", "Healing Inscription", "inscription-healing", [S("parchment"), P("inscription-ink-common"), M("gathering-elfleaf")], "basic", "inscription:basic"),

  timed("greater-healing-traditional", "Potion of Healing (Greater) — Traditional", "potion-healing-greater", [M("creature-regenerative-ichor"), M("gathering-wild-sage",2), M("gathering-elfleaf",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("greater-healing-elven", "Potion of Healing (Greater) — Elven", "potion-healing-greater", [M("gathering-moonmoss"), M("gathering-elfleaf",3), M("gathering-common-root"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("greater-healing-dwarven", "Potion of Healing (Greater) — Dwarven", "potion-healing-greater", [M("gathering-deepcap-fungus"), M("gathering-bitter-fungus",2), M("gathering-common-root",2), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  project("inscription-greater-healing", "Greater Healing Inscription", "inscription-healing-greater", [S("parchment"), P("inscription-ink-uncommon"), M("creature-regenerative-ichor")], "basic", "inscription:basic"),

  timed("superior-healing-traditional", "Potion of Healing (Superior) — Traditional", "potion-healing-superior", [M("creature-regenerative-tissue"), M("creature-regenerative-ichor"), M("gathering-wild-sage",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("superior-healing-elven", "Potion of Healing (Superior) — Elven", "potion-healing-superior", [M("gathering-blood-orchid"), M("gathering-moonmoss"), M("gathering-elfleaf",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("superior-healing-dwarven", "Potion of Healing (Superior) — Dwarven", "potion-healing-superior", [M("gathering-deepheart-fungus"), M("gathering-deepcap-fungus"), M("gathering-bitter-fungus",2), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  project("inscription-superior-healing", "Superior Healing Inscription", "inscription-healing-superior", [S("parchment"), P("inscription-ink-rare",2), M("creature-regenerative-tissue")], "elaborate", "inscription:elaborate"),

  timed("supreme-healing-traditional", "Potion of Healing (Supreme) — Traditional", "potion-healing-supreme", [M("creature-regenerative-core"), M("creature-regenerative-tissue"), M("gathering-wild-sage",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("supreme-healing-elven", "Potion of Healing (Supreme) — Elven", "potion-healing-supreme", [M("gathering-moon-orchid"), M("gathering-blood-orchid"), M("gathering-elfleaf",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  timed("supreme-healing-dwarven", "Potion of Healing (Supreme) — Dwarven", "potion-healing-supreme", [M("gathering-stoneheart-morel"), M("gathering-deepheart-fungus"), M("gathering-bitter-fungus"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:healing"),
  project("inscription-supreme-healing", "Supreme Healing Inscription", "inscription-healing-supreme", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-regenerative-core")], "elite", "inscription:elite"),

  timed("antitoxin-herbal", "Antitoxin — Herbal", "antitoxin", [M("gathering-bitterleaf",2), M("gathering-common-root",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:basic"),
  timed("antitoxin-dwarven", "Antitoxin — Dwarven", "antitoxin", [M("gathering-bitter-fungus",2), M("gathering-wild-sage",2), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:basic"),
  timed("basic-poison", "Basic Poison", "poison-basic", [M("creature-venomous-ichor"), M("gathering-bitterleaf",2), S("vial")], [PROFICIENCIES.poisoner, PROFICIENCIES.alchemist], "alchemy:basic"),
  timed("acid-natural", "Acid — Natural", "acid", [M("creature-corrosive-ichor"), M("trade-salt"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.poisoner], "alchemy:basic"),
  timed("acid-alchemical", "Acid — Alchemical", "acid", [M("essence-acid"), M("trade-salt",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.poisoner], "alchemy:basic"),
  timed("alchemists-fire", "Alchemist's Fire", "alchemists-fire", [M("essence-fire"), M("trade-cooking-oil",2)], [PROFICIENCIES.alchemist], "alchemy:basic"),
  timed("holy-water", "Holy Water", "holy-water", [M("essence-radiant"), M("trade-salt",2), S("vial")], [PROFICIENCIES.religion], "alchemy:basic"),

  timed("potion-climbing", "Potion of Climbing", "potion-climbing", [M("creature-spider-silk",2), M("gathering-common-root",2), M("gathering-wild-sage"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:utility"),
  project("inscription-climbing", "Climbing Inscription", "inscription-climbing", [S("parchment"), P("inscription-ink-common"), M("creature-spider-silk")], "basic", "inscription:basic"),
  timed("potion-animal-friendship", "Potion of Animal Friendship", "potion-animal-friendship", [M("creature-feyheart-nectar"), M("trade-honey",2), M("gathering-wild-berries",2), M("gathering-elfleaf"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:utility"),
  project("inscription-animal-friendship", "Animal Friendship Inscription", "inscription-animal-friendship", [S("parchment"), P("inscription-ink-uncommon"), M("creature-feyheart-nectar")], "basic", "inscription:basic"),
  timed("potion-growth", "Potion of Growth", "potion-growth", [M("giant-blood"), M("gathering-common-root",2), M("trade-honey"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:utility"),
  project("inscription-growth", "Growth Inscription", "inscription-growth", [S("parchment"), P("inscription-ink-uncommon"), M("giant-blood")], "basic", "inscription:basic"),
  timed("potion-poison", "Potion of Poison", "potion-poison", [M("creature-venomous-ichor",2), M("trade-honey"), S("vial")], [PROFICIENCIES.poisoner, PROFICIENCIES.alchemist], "alchemy:utility"),
  timed("oil-slipperiness", "Oil of Slipperiness", "oil-slipperiness", [M("creature-ooze-mucus"), M("trade-cooking-oil",2), M("trade-wax")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:utility"),
  timed("dust-dryness", "Dust of Dryness", "dust-dryness", [M("essence-arcane"), M("trade-salt",4), S("pouch")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:utility"),
  timed("philter-love", "Philter of Love", "philter-love", [M("essence-psychic"), M("trade-honey",2), M("gathering-wild-berries",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:utility"),
  timed("potion-water-breathing", "Potion of Water Breathing", "potion-water-breathing", [M("creature-amphibious-membrane"), M("gathering-common-root",2), M("gathering-elfleaf"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:utility"),
  project("inscription-water-breathing", "Water Breathing Inscription", "inscription-water-breathing", [S("parchment"), P("inscription-ink-uncommon"), M("creature-amphibious-membrane")], "basic", "inscription:basic")
];

for (const [key, label, essenceId, herbId, secondary] of resistanceTypes) {
  recipes.push(
    timed(`resistance-${key}`, `Potion of ${label} Resistance`, `potion-resistance-${key}`, [M(essenceId), M("gathering-common-root",2), M(herbId), S("vial")], [PROFICIENCIES.alchemist, secondary], "alchemy:resistance", `A ${label.toLowerCase()}-aligned method producing a ready-to-use ${label} Resistance potion from the SRD Potion of Resistance template.`),
    project(`inscription-resistance-${key}`, `${label} Resistance Inscription`, `inscription-resistance-${key}`, [S("parchment"), P("inscription-ink-uncommon"), M(essenceId)], "basic", "inscription:basic", `A written ${label.toLowerCase()} resistance working. It preserves the native Potion of Resistance mechanics and Activities.`)
  );
}

recipes.push(
  timed("giant-hill", "Potion of Hill Giant Strength", "giant-hill", [M("giant-blood"), M("gathering-common-root"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-hill-strength", "Hill Giant Strength Inscription", "inscription-hill-strength", [S("parchment"), P("inscription-ink-uncommon"), M("giant-blood")], "basic", "inscription:basic"),
  timed("giant-stone", "Potion of Stone Giant Strength", "giant-stone", [M("creature-giant-heart"), M("giant-blood"), M("gathering-common-root"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-stone-strength", "Stone Giant Strength Inscription", "inscription-stone-strength", [S("parchment"), P("inscription-ink-rare",2), M("creature-giant-heart")], "elaborate", "inscription:elaborate"),
  timed("giant-frost", "Potion of Frost Giant Strength", "giant-frost", [M("creature-giant-heart"), M("giant-blood"), M("essence-cold"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-frost-strength", "Frost Giant Strength Inscription", "inscription-frost-strength", [S("parchment"), P("inscription-ink-rare",2), M("creature-giant-heart"), M("essence-cold")], "elaborate", "inscription:elaborate"),
  timed("giant-fire", "Potion of Fire Giant Strength", "giant-fire", [M("creature-titanic-core"), M("giant-blood"), M("essence-fire"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-fire-strength", "Fire Giant Strength Inscription", "inscription-fire-strength", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-titanic-core"), M("essence-fire")], "elite", "inscription:elite"),
  timed("giant-cloud", "Potion of Cloud Giant Strength", "giant-cloud", [M("creature-titanic-core"), M("giant-blood"), M("essence-air"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-cloud-strength", "Cloud Giant Strength Inscription", "inscription-cloud-strength", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-titanic-core"), M("essence-air")], "elite", "inscription:elite"),
  timed("giant-storm", "Potion of Storm Giant Strength", "giant-storm", [M("creature-primordial-giant-heart"), M("giant-blood"), M("essence-lightning"), M("trade-alcohol")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:giant"),
  project("inscription-storm-strength", "Storm Giant Strength Inscription", "inscription-storm-strength", [S("parchment"), P("inscription-ink-legendary",5), M("creature-primordial-giant-heart"), M("essence-lightning")], "elite", "inscription:elite"),

  timed("potion-heroism", "Potion of Heroism", "potion-heroism", [M("gathering-starpetal"), M("essence-radiant"), M("trade-honey",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.religion], "alchemy:advanced"),
  project("inscription-heroism", "Heroism Inscription", "inscription-heroism", [S("parchment"), P("inscription-ink-rare",2), M("gathering-starpetal")], "elaborate", "inscription:elaborate"),
  timed("potion-gaseous-form", "Potion of Gaseous Form", "potion-gaseous-form", [M("creature-vaporous-membrane"), M("essence-air"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-gaseous-form", "Gaseous Form Inscription", "inscription-gaseous-form", [S("parchment"), P("inscription-ink-rare",2), M("creature-vaporous-membrane")], "elaborate", "inscription:elaborate"),
  timed("potion-clairvoyance", "Potion of Clairvoyance", "potion-clairvoyance", [M("aberration-psychic-gland"), M("essence-psychic"), M("gathering-elfleaf"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-clairvoyance", "Clairvoyance Inscription", "inscription-clairvoyance", [S("parchment"), P("inscription-ink-rare",2), M("aberration-psychic-gland")], "elaborate", "inscription:elaborate"),
  timed("potion-mind-reading", "Potion of Mind Reading", "potion-mind-reading", [M("aberration-psychic-gland"), M("gathering-bitter-fungus",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-mind-reading", "Mind Reading Inscription", "inscription-mind-reading", [S("parchment"), P("inscription-ink-rare",2), M("aberration-psychic-gland")], "elaborate", "inscription:elaborate"),
  timed("potion-invulnerability", "Potion of Invulnerability", "potion-invulnerability", [M("gathering-adamantine-powder"), M("essence-force"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-invulnerability", "Invulnerability Inscription", "inscription-invulnerability", [S("parchment"), P("inscription-ink-rare",2), M("gathering-adamantine-powder")], "elaborate", "inscription:elaborate"),

  timed("potion-invisibility", "Potion of Invisibility", "potion-invisibility", [M("gathering-ghost-lotus"), M("essence-arcane"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-invisibility", "Invisibility Inscription", "inscription-invisibility", [S("parchment"), P("inscription-ink-veryRare",4), M("gathering-ghost-lotus")], "elite", "inscription:elite"),
  timed("potion-speed", "Potion of Speed", "potion-speed", [M("creature-accelerated-heart"), M("essence-lightning"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-speed", "Speed Inscription", "inscription-speed", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-accelerated-heart")], "elite", "inscription:elite"),
  timed("potion-flying", "Potion of Flying", "potion-flying", [M("creature-aerial-heart"), M("essence-air"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.arcana], "alchemy:advanced"),
  project("inscription-flying", "Flying Inscription", "inscription-flying", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-aerial-heart")], "elite", "inscription:elite"),
  timed("potion-vitality", "Potion of Vitality", "potion-vitality", [M("creature-regenerative-core"), M("essence-radiant"), M("gathering-elfleaf",2), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.religion], "alchemy:advanced"),
  project("inscription-vitality", "Vitality Inscription", "inscription-vitality", [S("parchment"), P("inscription-ink-veryRare",4), M("creature-regenerative-core")], "elite", "inscription:elite"),
  timed("potion-longevity", "Potion of Longevity", "potion-longevity", [M("gathering-moon-orchid"), M("gathering-blood-orchid"), M("gathering-common-root"), S("vial")], [PROFICIENCIES.alchemist, PROFICIENCIES.herbalism], "alchemy:advanced"),
  project("inscription-longevity", "Longevity Inscription", "inscription-longevity", [S("parchment"), P("inscription-ink-veryRare",4), M("gathering-moon-orchid")], "elite", "inscription:elite")
);

// Potion of Comprehension and Potion of Fire Breath are deliberately not distributed here.
// They are not present in the supplied D&D5e SRD 5.1/5.2 packs, and this catalog never
// falls back to premium content.
export const CURATED_ALCHEMY_RECIPES = Object.freeze(recipes.map(row => Object.freeze({
  ...row,
  craftingResolution: finalCheck(row.proficiencies),
  project: row.craftingMode === "project" ? {
    requiredWork: row.requiredWork,
    cadence: "short",
    progressCheck: {
      required: false, timing: "every", type: "ability", id: "int", dc: 10,
      failure: { mode: "noProgress", regressBy: 1, loseMaterials: false, lossPercent: 0 }
    },
    extraEffort: {
      enabled: true, type: "ability", id: "int", dc: 12, progressGain: 1,
      failure: { mode: "noProgress", regressBy: 1 }
    }
  } : null
})));

export const CURATED_ALCHEMY_RECIPES_BY_ID = new Map(CURATED_ALCHEMY_RECIPES.map(row => [row.recipeId, row]));
