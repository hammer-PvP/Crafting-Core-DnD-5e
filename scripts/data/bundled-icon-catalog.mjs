/**
 * Crafting Core bundled icon candidates.
 *
 * These paths point to artwork physically bundled with the module under /icons.
 * They complement Foundry/D&D5e native artwork; they do not replace the native
 * catalogs wholesale. Candidate ordering is intentionally deterministic so the
 * Curated Products UI can continue to present three useful choices per item.
 */

const ROOT = "modules/dnd5e-crafting-core/icons";
const p = relative => `${ROOT}/${relative}`;

const MEAL_EXTRAS = Object.freeze({
  "forge-stew": [
    p("products/meals/dumpling-stew-bowl-orange.webp"),
    p("products/meals/noodle-soup-bowl-brown.webp")
  ],
  "hot-stone-ribs": [
    p("products/meals/roasted-meat-platter-red-brown.webp"),
    p("products/meals/steak-board-red-brown.webp")
  ],
  "khaz-marchbread": [p("products/meals/pastry-roll-golden-brown.webp")],
  "miners-hand-pie": [
    p("products/meals/pie-slice-golden-yellow.webp"),
    p("products/meals/pastry-roll-golden-brown.webp")
  ],
  "hot-stone-feast": [
    p("products/meals/meat-vegetable-plate-red-green.webp"),
    p("products/meals/roasted-meat-platter-red-brown.webp")
  ],
  "stillleaf-broth": [p("products/meals/noodle-soup-bowl-brown.webp")],
  "lightleaf-cakes": [
    p("products/meals/berry-cake-red-cream.webp"),
    p("products/meals/pastry-roll-golden-brown.webp")
  ],
  "greenway-salad": [p("products/meals/cucumber-salad-bowl-green.webp")],
  "roadside-stew": [
    p("products/meals/dumpling-stew-bowl-orange.webp"),
    p("products/meals/noodle-soup-bowl-brown.webp")
  ],
  "farmers-pie": [
    p("products/meals/pie-slice-golden-yellow.webp"),
    p("products/meals/pastry-roll-golden-brown.webp")
  ],
  "messengers-bread": [p("products/meals/pastry-roll-golden-brown.webp")],
  "first-bell-eggs": [p("products/meals/fried-egg-plate-yellow-white.webp")],
  "adventurers-breakfast": [
    p("products/meals/fried-egg-plate-yellow-white.webp"),
    p("products/meals/meat-vegetable-plate-red-green.webp")
  ]
});

const DRINK_COLORS = Object.freeze({
  // Alcohol — mundane
  "dockside-draft": ["gold", "orange"],
  "sour-house-red": ["red", "purple"],
  "barrelhouse-white": ["teal", "blue"],
  "cheap-grain-vodka": ["blue", "teal"],
  "backroad-spirit": ["black", "orange"],
  "roadwarden-ale": ["gold", "orange"],
  "moonveil-claret": ["purple", "red"],
  "glassfire-vodka": ["blue", "teal"],
  "black-kettle-whiskey": ["black", "orange"],
  "hunters-stillness": ["green", "blue"],

  // Alcohol — dwarven
  "deepmine-bitter": ["black", "gold"],
  "forgehand-ale": ["orange", "gold"],
  "stonebelly-stout": ["black", "orange"],
  "clearforge-reserve": ["teal", "blue"],
  "emberrest-bourbon": ["gold", "orange"],
  "king-under-the-mountain": ["black", "gold"],
  "cavern-ember": ["red", "orange"],

  // Alcohol — elven
  "dewwine": ["green", "teal"],
  "stillleaf-wine": ["green", "teal"],
  "starlight-rose": ["red", "purple"],
  "moonpetal-mead": ["purple", "gold"],
  "autumn-stillness-vintage": ["gold", "green"],
  "song-of-the-summer-court": ["red", "purple"],
  "quiet-twilight-nectar": ["blue", "purple"],

  // Alcohol — cane spirits
  "fieldhand-cachaca": ["green", "gold"],
  "golden-cane": ["gold", "orange"],
  "laughing-mule-cachaca": ["red", "purple"],
  "old-barrel-cachaca": ["gold", "black"],

  // Non-alcoholic — mundane
  "fresh-cane-juice": ["green", "gold"],
  "barley-water": ["gold", "teal"],
  "honeyed-apple-cider": ["orange", "red"],
  "berry-cordial": ["purple", "red"],
  "harvesters-tonic": ["green", "orange"],

  // Non-alcoholic — dwarven
  "miners-barley-water": ["black", "gold"],
  "forgecooler": ["gold", "blue"],
  "deepwell-tonic": ["green", "black"],
  "stonebrew-malt": ["gold", "black"],
  "underhall-restorative": ["green", "orange"],

  // Non-alcoholic — elven
  "silverdew-infusion": ["teal", "green"],
  "moonberry-tea": ["purple", "teal"],
  "greenpath-tonic": ["green", "teal"],
  "dawnleaf-cordial": ["gold", "green"],
  "summer-court-nectar": ["red", "purple"]
});

const HOT_DRINK_IDS = new Set([
  "barley-water",
  "miners-barley-water",
  "silverdew-infusion",
  "moonberry-tea"
]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function drinkShape(drinkType, alternate=false) {
  const type = String(drinkType ?? "").toLowerCase();
  const round = /(wine|rose|mead|cordial|nectar|cider|malt|beer|ale|stout|grain)/.test(type);
  if (alternate) return round ? "flask" : "round";
  return round ? "round" : "flask";
}

export function curatedMealIconCandidates(id, nativeIcons=[]) {
  const native = unique(nativeIcons);
  const extras = MEAL_EXTRAS[String(id)] ?? [];
  if (!extras.length) return native.slice(0, 3);
  // Bundled art is preferred for new Products, while the old first native icon remains
  // in the shortlist so existing worlds keep a familiar/selectable option.
  return unique([extras[0], native[0], extras[1] ?? native[1], ...native]).slice(0, 3);
}

export function curatedDrinkIconCandidates({ id, drinkType, nonAlcoholic=false }={}, nativeIcons=[]) {
  const key = String(id ?? "");
  const colors = DRINK_COLORS[key] ?? ["amber", "green"];
  const native = unique(nativeIcons);
  const local = [];

  if (nonAlcoholic && HOT_DRINK_IDS.has(key)) {
    local.push(p("products/meals/hot-drink-cup-cream-brown.webp"));
  }

  const firstShape = drinkShape(drinkType, false);
  const secondShape = drinkShape(drinkType, true);
  local.push(p(`products/drinks/drink-bottle-${firstShape}-${colors[0]}.webp`));
  local.push(p(`products/drinks/drink-bottle-${secondShape}-${colors[1]}.webp`));

  return unique([local[0], native[0], local[1], native[1], local[2], ...native]).slice(0, 3);
}

const M = Object.freeze({
  eye: [p("materials/alchemical/eyeball-red-white.webp")],
  alchemy: [p("materials/alchemical/extract-bowl-purple.webp"), p("materials/alchemical/powder-purple.webp")],
  powder: [p("materials/alchemical/powder-purple.webp"), p("materials/alchemical/powder-orange.webp"), p("materials/resources/powder-white.webp")],
  slime: [p("materials/alchemical/slime-pool-green.webp"), p("materials/alchemical/slime-pool-blue.webp"), p("materials/alchemical/slime-cluster-red.webp")],
  flower: [p("materials/alchemical/flower-blue-green.webp"), p("materials/alchemical/flower-lotus-blue.webp"), p("materials/alchemical/flower-red-gold.webp")],
  herb: [p("materials/resources/herb-leaves-green.webp"), p("materials/alchemical/branch-flowering-blue.webp")],
  root: [p("materials/alchemical/root-gnarled-brown.webp"), p("materials/resources/herb-leaves-green.webp")],
  berries: [p("materials/alchemical/berries-red-leaf.webp"), p("materials/alchemical/berries-plant-purple-green.webp"), p("materials/alchemical/berries-branch-red-green.webp")],
  fungus: [p("materials/fungi/mushroom-wide-brown.webp"), p("materials/fungi/mushroom-cap-purple.webp"), p("materials/fungi/mushroom-glow-blue-green.webp")],
  hide: [p("materials/creature-parts/hunting/pelt-fur-tan.webp"), p("materials/resources/hide-leather-brown.webp")],
  scale: [p("materials/creature-parts/hunting/scales-hide-green.webp"), p("materials/creature-parts/hunting/scales-hide-tan.webp")],
  bone: [p("materials/creature-parts/bones/bones-loose-ivory.webp"), p("materials/creature-parts/bones/bones-broken-ivory.webp")],
  skull: [p("materials/creature-parts/bones/skull-reptile-ivory.webp"), p("materials/creature-parts/bones/skull-dinosaur-ivory.webp")],
  claw: [p("materials/creature-parts/hunting/claw-ivory.webp"), p("materials/creature-parts/hunting/talon-brown.webp")],
  horn: [p("materials/creature-parts/hunting/horn-curved-ivory.webp"), p("materials/creature-parts/hunting/antler-brown.webp")],
  feather: [p("materials/creature-parts/hunting/feather-brown.webp"), p("materials/creature-parts/hunting/feathers-bundle-brown-white.webp")],
  meat: [p("materials/creature-parts/hunting/raw-meat-steak-red.webp"), p("materials/creature-parts/hunting/raw-meat-leg-red-brown.webp")],
  monsterMeat: [p("materials/creature-parts/hunting/monster-meat-slices-red-green.webp"), p("materials/creature-parts/hunting/raw-meat-steak-red.webp")],
  leather: [p("materials/resources/hide-leather-brown.webp"), p("materials/resources/leather-strip-brown.webp")],
  ore: [p("materials/resources/ore-rock-gray.webp"), p("materials/resources/ore-chunks-black.webp"), p("materials/resources/ore-rock-gray-red.webp")],
  copper: [p("materials/resources/ingot-copper-orange.webp"), p("materials/resources/wire-copper.webp")],
  ingot: [p("materials/resources/ingot-black.webp"), p("materials/resources/metal-sheets-silver.webp")],
  wood: [p("materials/resources/logs-cut-brown.webp"), p("materials/resources/planks-wood-brown.webp"), p("materials/resources/sticks-bundle-brown.webp")],
  resin: [p("materials/resources/resin-log-amber-brown.webp")],
  rope: [p("materials/resources/rope-coil-brown.webp")],
  crystal: [p("materials/resources/crystals-amber-brown.webp"), p("materials/resources/mineral-chunks-white.webp")],
  dragonScale: [p("materials/creature-parts/dragon/dragon-scale-cluster-orange.webp"), p("materials/creature-parts/dragon/dragon-scales-red.webp")],
  dragonClaw: [p("materials/creature-parts/dragon/dragon-claw-red.webp")],
  dragonBone: [p("materials/creature-parts/dragon/dragon-spine-green.webp"), p("materials/creature-parts/dragon/dragon-skull-white-brown.webp")]
});

/**
 * Return a small semantic pool of bundled candidates for a canonical Material id.
 * The native Material icon catalog decides how these are interleaved with Foundry art.
 */
export function bundledMaterialIconCandidates(materialId) {
  const id = String(materialId ?? "").toLowerCase();

  if (id === "dragon-scale") return [...M.dragonScale];
  if (id === "dragon-claw") return [...M.dragonClaw];
  if (id === "dragon-marrow") return [...M.dragonBone];

  if (/(eye)/.test(id)) return [...M.eye];
  if (/(ichor|reagent|solvent|enzyme|concentrate|condensate|gel)/.test(id)) return [...M.alchemy];
  if (/(ooze|slime|secretion|matrix)/.test(id)) return [...M.slime];
  if (/(dust|ash|powder|residue)/.test(id)) return [...M.powder];
  if (/(orchid|flower|bloom|petal)/.test(id)) return [...M.flower];
  if (/(berry|berries)/.test(id)) return [...M.berries];
  if (/(fungus|mushroom|spore)/.test(id)) return [...M.fungus];
  if (/(root|wort|lichen|moss|herb|leaf|sage|grass|vine)/.test(id)) return [...M.root, ...M.herb];

  if (/(hide|pelt|fur)/.test(id)) return [...M.hide];
  if (/(scale)/.test(id)) return [...M.scale];
  if (/(bone|marrow)/.test(id)) return [...M.bone];
  if (/(skull)/.test(id)) return [...M.skull];
  if (/(claw|talon|fang)/.test(id)) return [...M.claw];
  if (/(horn|antler)/.test(id)) return [...M.horn];
  if (/(feather)/.test(id)) return [...M.feather];
  if (/(meat)/.test(id)) return [...M.meat];
  if (/(flesh)/.test(id)) return [...M.monsterMeat];

  if (/(worked-leather|leather)/.test(id)) return [...M.leather];
  if (/(copper)/.test(id)) return [...M.copper];
  if (/(ore|mineral|stone|coal|charcoal)/.test(id)) return [...M.ore];
  if (/(ingot|alloy|worked-metal|metal)/.test(id)) return [...M.ingot];
  if (/(wood|timber|lumber|log|plank)/.test(id)) return [...M.wood];
  if (/(resin|sap)/.test(id)) return [...M.resin];
  if (/(rope|fiber)/.test(id)) return [...M.rope];
  if (/(crystal|gem|fragment|shard)/.test(id)) return [...M.crystal];

  return [];
}

export const BUNDLED_ICON_ROOT = ROOT;
