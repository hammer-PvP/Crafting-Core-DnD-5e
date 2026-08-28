/**
 * Crafting Core default material catalog.
 *
 * These records are intentionally system-neutral inside the D&D5e project: they describe
 * materials and future generation metadata, while MaterialCatalogService is responsible for
 * materializing them as native D&D5e Loot / Trade Good Items.
 */

const creature = (id, name, nature, rarity, {tags=[], requires=[], quantity="1", chance=null}={}) => ({
  id, name, family: "creature", nature, rarity, tags, requires, quantity, chance
});
const gathering = (id, name, nature, rarity, {biomes=[], tags=[], quantity="1", chance=null}={}) => ({
  id, name, family: "gathering", nature, rarity, biomes, tags, quantity, chance
});
const profession = (id, name, nature, rarity, {tags=[], quantity="1", chance=null}={}) => ({
  id, name, family: "profession", nature, rarity, tags, quantity, chance
});
const essence = (id, name, nature, {tags=[], quantity="1"}={}) => ({
  id, name, family: "essence", nature, category: "essence", rarity: "uncommon",
  tags: ["essence", ...tags], requires: [], biomes: [], quantity, chance: 100
});

export const MATERIAL_CATALOG_VERSION = 5;

export const DEFAULT_MATERIALS = Object.freeze([
  // Aberration
  creature("aberration-ichor", "Aberrant Ichor", "aberration", "common", {requires:["flesh"]}),
  creature("aberration-eye", "Aberrant Eye", "aberration", "common", {requires:["eye"]}),
  creature("aberration-membrane", "Warped Membrane", "aberration", "uncommon", {requires:["flesh"]}),
  creature("aberration-psychic-gland", "Psychic Gland", "aberration", "rare", {requires:["flesh"], tags:["psionic"]}),
  creature("aberration-neural-fragment", "Neural Fragment", "aberration", "veryRare", {requires:["flesh"], tags:["psionic"]}),
  creature("aberration-void-essence", "Void-Touched Essence", "aberration", "legendary", {tags:["arcane","planar"]}),

  // Beast
  creature("beast-hide", "Beast Hide", "beast", "common", {requires:["hide"]}),
  creature("beast-bone", "Beast Bone", "beast", "common", {requires:["bone"]}),
  creature("beast-meat", "Beast Meat", "beast", "uncommon", {requires:["flesh"]}),
  creature("beast-venom-gland", "Beast Venom Gland", "beast", "rare", {requires:["venom"]}),
  creature("beast-prime-marrow", "Prime Beast Marrow", "beast", "veryRare", {requires:["bone"]}),
  creature("beast-primal-essence", "Primal Beast Essence", "beast", "legendary", {tags:["primal"]}),

  // Celestial
  creature("celestial-radiant-residue", "Radiant Residue", "celestial", "common", {tags:["radiant"]}),
  creature("celestial-ichor", "Celestial Ichor", "celestial", "common", {requires:["flesh"], tags:["radiant"]}),
  creature("celestial-feather", "Consecrated Feather", "celestial", "uncommon", {requires:["feather"]}),
  creature("celestial-luminous-bone", "Luminous Bone", "celestial", "rare", {requires:["bone"], tags:["radiant"]}),
  creature("celestial-astral-fragment", "Astral Fragment", "celestial", "veryRare", {tags:["planar"]}),
  creature("celestial-pure-essence", "Pure Celestial Essence", "celestial", "legendary", {tags:["radiant","planar"]}),

  // Construct
  creature("construct-alloy", "Enchanted Alloy", "construct", "common", {requires:["metal"]}),
  creature("construct-arcane-gear", "Arcane Gear", "construct", "common", {requires:["mechanical"]}),
  creature("construct-conductor", "Arcane Conductor", "construct", "uncommon", {tags:["arcane"]}),
  creature("construct-rune-core", "Runic Core", "construct", "rare", {tags:["arcane"]}),
  creature("construct-animation-crystal", "Animation Crystal", "construct", "veryRare", {tags:["arcane","crystal"]}),
  creature("construct-eternal-core", "Eternal Construct Core", "construct", "legendary", {tags:["arcane"]}),

  // Dragon
  creature("dragon-scale", "Dragon Scale", "dragon", "common", {requires:["scale"], quantity:"1d4"}),
  creature("dragon-blood", "Dragon Blood", "dragon", "common", {requires:["blood"], quantity:"1d2"}),
  creature("dragon-claw", "Dragon Claw", "dragon", "uncommon", {requires:["claw"]}),
  creature("dragon-elemental-gland", "Draconic Elemental Gland", "dragon", "rare", {requires:["flesh"], tags:["elemental"]}),
  creature("dragon-marrow", "Dragon Marrow", "dragon", "veryRare", {requires:["bone"]}),
  creature("dragon-essence", "Ancient Draconic Essence", "dragon", "legendary", {tags:["draconic","arcane"]}),

  // Elemental
  creature("elemental-residue", "Elemental Residue", "elemental", "common", {tags:["elemental"]}),
  creature("elemental-crystal", "Elemental Crystal", "elemental", "common", {tags:["elemental","crystal"]}),
  creature("elemental-condensate", "Elemental Condensate", "elemental", "uncommon", {tags:["elemental"]}),
  creature("elemental-core", "Elemental Core", "elemental", "rare", {tags:["elemental"]}),
  creature("elemental-planar-shard", "Planar Elemental Shard", "elemental", "veryRare", {tags:["elemental","planar"]}),
  creature("elemental-primal-heart", "Primal Elemental Heart", "elemental", "legendary", {tags:["elemental","planar"]}),

  // Fey
  creature("fey-dew", "Fey Dew", "fey", "common", {tags:["fey"]}),
  creature("fey-blood", "Fey Blood", "fey", "common", {requires:["blood"], tags:["fey"]}),
  creature("fey-glamour-dust", "Glamour Dust", "fey", "uncommon", {tags:["fey","illusion"]}),
  creature("fey-ethereal-fragment", "Fey Ethereal Fragment", "fey", "rare", {tags:["fey","planar"]}),
  creature("fey-enchantment-residue", "Enchantment Residue", "fey", "veryRare", {tags:["fey","enchantment"]}),
  creature("fey-heart-essence", "Feyheart Essence", "fey", "legendary", {tags:["fey","planar"]}),

  // Fiend
  creature("fiend-vile-ichor", "Vile Ichor", "fiend", "common", {requires:["flesh"], tags:["fiend"]}),
  creature("fiend-infernal-blood", "Infernal Blood", "fiend", "common", {requires:["blood"], tags:["fiend"]}),
  creature("fiend-profane-ash", "Profane Ash", "fiend", "uncommon", {tags:["fiend"]}),
  creature("fiend-profane-horn", "Profane Horn", "fiend", "rare", {requires:["horn"], tags:["fiend"]}),
  creature("fiend-abyssal-fragment", "Abyssal Fragment", "fiend", "veryRare", {tags:["fiend","planar"]}),
  creature("fiend-corrupted-soul-essence", "Corrupted Soul Essence", "fiend", "legendary", {tags:["fiend","soul"]}),

  // Giant
  creature("giant-hide", "Giant Hide", "giant", "common", {requires:["hide"]}),
  creature("giant-bone", "Giant Bone", "giant", "common", {requires:["bone"]}),
  creature("giant-blood", "Giant Blood", "giant", "uncommon", {requires:["blood"]}),
  creature("giant-tendon", "Giant Tendon", "giant", "rare", {requires:["flesh"]}),
  creature("giant-marrow", "Giant Marrow", "giant", "veryRare", {requires:["bone"]}),
  creature("giant-titan-essence", "Titan Essence", "giant", "legendary", {tags:["giant","primal"]}),

  // Humanoid — salvage / carried trade materials rather than automatic butchery
  creature("humanoid-worked-leather", "Worked Leather", "humanoid", "common", {tags:["trade"]}),
  creature("humanoid-seasonings", "Salts & Seasonings", "humanoid", "common", {tags:["food","trade"]}),
  creature("humanoid-worked-metal", "Worked Metal", "humanoid", "uncommon", {tags:["metal","trade"]}),
  creature("humanoid-alchemical-reagent", "Alchemical Reagent", "humanoid", "rare", {tags:["alchemy","trade"]}),
  creature("humanoid-fine-gemstone", "Fine Gemstone", "humanoid", "veryRare", {tags:["gem","trade"]}),
  creature("humanoid-masterwork-component", "Masterwork Component", "humanoid", "legendary", {tags:["craft","trade"]}),

  // Monstrosity
  creature("monstrosity-hide", "Monstrous Hide", "monstrosity", "common", {requires:["hide"]}),
  creature("monstrosity-claw", "Monster Claw", "monstrosity", "common", {requires:["claw"]}),
  creature("monstrosity-feather", "Monster Feather", "monstrosity", "uncommon", {requires:["feather"]}),
  creature("monstrosity-arcane-organ", "Arcane Organ", "monstrosity", "rare", {requires:["flesh"], tags:["arcane"]}),
  creature("monstrosity-venom-gland", "Monstrous Venom Gland", "monstrosity", "veryRare", {requires:["venom"]}),
  creature("monstrosity-essence", "Monstrous Essence", "monstrosity", "legendary", {tags:["monstrous","arcane"]}),

  // Ooze
  creature("ooze-gel", "Alchemical Gel", "ooze", "common", {requires:["amorphous"]}),
  creature("ooze-acid", "Corrosive Secretion", "ooze", "common", {requires:["amorphous"], tags:["acid"]}),
  creature("ooze-enzyme", "Ooze Enzyme", "ooze", "uncommon", {requires:["amorphous"]}),
  creature("ooze-viscous-core", "Viscous Core", "ooze", "rare", {requires:["amorphous"]}),
  creature("ooze-concentrate", "Ooze Concentrate", "ooze", "veryRare", {requires:["amorphous"]}),
  creature("ooze-prime-matrix", "Prime Ooze Matrix", "ooze", "legendary", {requires:["amorphous"]}),

  // Plant
  creature("plant-fiber", "Enchanted Plant Fiber", "plant", "common", {requires:["plant"]}),
  creature("plant-sap", "Monstrous Sap", "plant", "common", {requires:["plant"]}),
  creature("plant-spore", "Magical Spore", "plant", "uncommon", {requires:["plant"]}),
  creature("plant-living-root", "Living Root", "plant", "rare", {requires:["plant"]}),
  creature("plant-enchanted-petal", "Enchanted Petal", "plant", "veryRare", {requires:["plant"]}),
  creature("plant-elder-seed", "Elder Seed", "plant", "legendary", {requires:["plant"], tags:["primal"]}),

  // Undead
  creature("undead-profane-bone", "Profane Bone", "undead", "common", {requires:["bone"], tags:["necrotic"]}),
  creature("undead-flesh", "Undead Flesh", "undead", "common", {requires:["flesh"], tags:["necrotic"]}),
  creature("undead-funerary-dust", "Funerary Dust", "undead", "common", {tags:["necrotic","funerary"]}),
  creature("undead-ectoplasm", "Ectoplasm", "undead", "uncommon", {requires:["incorporeal"], tags:["spirit"]}),
  creature("undead-necrotic-residue", "Necrotic Residue", "undead", "uncommon", {tags:["necrotic","residue"]}),
  creature("undead-corrupted-marrow", "Corrupted Marrow", "undead", "rare", {requires:["bone"], tags:["necrotic"]}),
  creature("undead-spiritual-residue", "Spiritual Residue", "undead", "veryRare", {tags:["spirit","necrotic"]}),
  creature("undead-death-essence", "Death Essence", "undead", "legendary", {tags:["necrotic","soul"]}),

  // Universal essence materials — dedicated fifth Harvest Profile slot.
  // Physical damage types are intentionally excluded. The Actor Analyzer chooses
  // between Arcane Essence and one mechanically-supported specific essence at harvest time.
  essence("essence-arcane", "Arcane Essence", "arcane", {tags:["arcane","universal"]}),
  essence("essence-acid", "Acid Essence", "acid", {tags:["acid"]}),
  essence("essence-cold", "Cold Essence", "cold", {tags:["cold"]}),
  essence("essence-fire", "Flame Essence", "fire", {tags:["fire","flame"]}),
  essence("essence-force", "Force Essence", "force", {tags:["force"]}),
  essence("essence-lightning", "Lightning Essence", "lightning", {tags:["lightning"]}),
  essence("undead-necrotic-essence", "Necrotic Essence", "necrotic", {tags:["necrotic"]}),
  essence("essence-poison", "Poison Essence", "poison", {tags:["poison"]}),
  essence("essence-psychic", "Psychic Essence", "psychic", {tags:["psychic","psionic"]}),
  essence("essence-radiant", "Radiant Essence", "radiant", {tags:["radiant"]}),
  essence("essence-thunder", "Thunder Essence", "thunder", {tags:["thunder"]}),

  // Environment gathering — intended for future biome pools.
  gathering("gathering-elfleaf", "Elvenleaf Herb", "flora", "common", {biomes:["forest","ravine"], tags:["herb"], quantity:"1d4"}),
  gathering("gathering-bloodroot", "Bloodroot", "flora", "common", {biomes:["forest","swamp"], tags:["root"], quantity:"1d3"}),
  gathering("gathering-mooncap", "Mooncap Mushroom", "flora", "common", {biomes:["forest","cave"], tags:["fungus"], quantity:"1d3"}),
  gathering("gathering-blackwater-flower", "Blackwater Flower", "flora", "uncommon", {biomes:["swamp"], tags:["flower"]}),
  gathering("gathering-ghost-orchid", "Ghost Orchid", "flora", "veryRare", {biomes:["swamp","underdark"], tags:["flower","arcane"]}),
  gathering("gathering-aromatic-resin", "Aromatic Resin", "flora", "common", {biomes:["forest"], tags:["resin"], quantity:"1d3"}),
  gathering("gathering-cliff-moss", "Cliff Moss", "flora", "common", {biomes:["ravine","mountain"], tags:["moss"], quantity:"1d3"}),
  gathering("gathering-ashen-lichen", "Ashen Lichen", "flora", "uncommon", {biomes:["ravine","mountain","cave"], tags:["lichen"]}),
  gathering("gathering-frostbloom", "Frostbloom", "flora", "rare", {biomes:["arctic","mountain"], tags:["flower"]}),
  gathering("gathering-sungrass", "Sungrass", "flora", "common", {biomes:["grassland"], tags:["herb"], quantity:"1d4"}),
  gathering("gathering-sea-herb", "Tide Herb", "flora", "common", {biomes:["coast"], tags:["herb"]}),
  gathering("gathering-deep-spore", "Deep Spore", "flora", "rare", {biomes:["underdark","cave"], tags:["fungus"]}),

  gathering("gathering-iron-ore", "Iron Ore", "mineral", "common", {biomes:["cave","mountain","ravine"], tags:["metal"], quantity:"1d4"}),
  gathering("gathering-copper-ore", "Copper Ore", "mineral", "common", {biomes:["cave","mountain"], tags:["metal"], quantity:"1d4"}),
  gathering("gathering-silver-ore", "Silver Ore", "mineral", "uncommon", {biomes:["cave","mountain"], tags:["metal"]}),
  gathering("gathering-raw-crystal", "Raw Crystal", "mineral", "uncommon", {biomes:["cave","ravine"], tags:["crystal"]}),
  gathering("gathering-arcane-crystal", "Arcane Crystal", "mineral", "rare", {biomes:["cave","underdark"], tags:["crystal","arcane"]}),
  gathering("gathering-starstone", "Starstone Shard", "mineral", "legendary", {biomes:["mountain","desert"], tags:["stone","arcane"]}),
  gathering("gathering-mineral-salt", "Mineral Salt", "mineral", "common", {biomes:["cave","coast","desert"], tags:["salt"], quantity:"1d4"}),
  gathering("gathering-volcanic-glass", "Volcanic Glass", "mineral", "rare", {biomes:["mountain"], tags:["glass","stone"]}),

  // Profession / trade materials. These can later feed vendors, regions and profession pools.
  profession("trade-salt", "Salt", "trade", "common", {tags:["food","preservative"]}),
  profession("trade-bread", "Bread", "trade", "common", {tags:["food"]}),
  profession("trade-flour", "Flour", "trade", "common", {tags:["food","grain"]}),
  profession("trade-seasonings", "Seasonings", "trade", "common", {tags:["food","spice"]}),
  profession("trade-cooking-oil", "Cooking Oil", "trade", "common", {tags:["food","oil"]}),
  profession("trade-charcoal", "Charcoal", "trade", "common", {tags:["smithing","fuel"]}),
  profession("trade-leather-straps", "Leather Straps", "trade", "uncommon", {tags:["leather","craft"]}),
  profession("trade-iron-ingot", "Iron Ingot", "trade", "uncommon", {tags:["metal","smithing"]}),
  profession("trade-steel-ingot", "Steel Ingot", "trade", "uncommon", {tags:["metal","smithing"]}),
  profession("trade-silver-ingot", "Silver Ingot", "trade", "rare", {tags:["metal","smithing"]}),
  profession("trade-fine-cloth", "Fine Cloth", "trade", "rare", {tags:["textile","craft"]}),
  profession("trade-alchemical-solvent", "Alchemical Solvent", "trade", "rare", {tags:["alchemy"]}),
  profession("trade-refined-pigment", "Refined Pigment", "trade", "veryRare", {tags:["craft","alchemy"]}),
  profession("trade-masterwork-alloy", "Masterwork Alloy", "trade", "veryRare", {tags:["metal","smithing"]}),
  profession("trade-perfect-gem", "Perfect Gemstone", "trade", "legendary", {tags:["gem","jewelry"]})
]);
