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
const gathering = (id, name, nature, rarity, {biomes=[], tags=[], quantity="1", chance=null, category=null}={}) => ({
  id, name, family: "gathering", nature, rarity, biomes, tags, quantity, chance, ...(category ? {category} : {})
});
const profession = (id, name, nature, rarity, {tags=[], quantity="1", chance=null}={}) => ({
  id, name, family: "profession", nature, rarity, tags, quantity, chance
});
const essence = (id, name, nature, {tags=[], quantity="1"}={}) => ({
  id, name, family: "essence", nature, category: "essence", rarity: "uncommon",
  tags: ["essence", ...tags], requires: [], biomes: [], quantity, chance: 100
});

export const MATERIAL_CATALOG_VERSION = 9;

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
  creature("monstrosity-flesh", "Monstrous Flesh", "monstrosity", "common", {requires:["flesh"]}),
  creature("monstrosity-blood", "Monstrous Blood", "monstrosity", "common", {requires:["blood"]}),
  creature("monstrosity-fang", "Monster Fang", "monstrosity", "common", {requires:["fang"]}),
  creature("monstrosity-feather", "Monster Feather", "monstrosity", "uncommon", {requires:["feather"]}),
  creature("monstrosity-bone", "Monstrous Bone", "monstrosity", "uncommon", {requires:["bone"]}),
  creature("monstrosity-eye", "Monstrous Eye", "monstrosity", "uncommon", {requires:["eye"]}),
  creature("monstrosity-gland", "Monstrous Gland", "monstrosity", "rare", {requires:["flesh"], tags:["organ","gland"]}),
  creature("monstrosity-arcane-organ", "Arcane Organ", "monstrosity", "rare", {requires:["flesh"], tags:["arcane","organ"]}),
  creature("monstrosity-venom-gland", "Monstrous Venom Gland", "monstrosity", "veryRare", {requires:["venom"], tags:["venom","gland"]}),
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

  // Environment gathering — wild resources. Biomes intentionally overlap categories so
  // adventurers nearly always have something worth searching for, while each biome keeps a
  // stronger identity through its available material mix and optional per-biome chance overrides.
  // Flora
  gathering("gathering-elfleaf", "Elvenleaf Herb", "flora", "common", {biomes:["forest","ravine"], tags:["herb"], quantity:"1d4"}),
  gathering("gathering-wild-sage", "Wild Sage", "flora", "common", {biomes:["forest","grassland","ravine"], tags:["herb","aromatic"], quantity:"1d4"}),
  gathering("gathering-bitterleaf", "Bitterleaf", "flora", "common", {biomes:["forest","swamp","grassland"], tags:["herb","bitter"], quantity:"1d4"}),
  gathering("gathering-silverleaf", "Silverleaf", "flora", "uncommon", {biomes:["forest","mountain","arctic"], tags:["herb","alchemy"], quantity:"1d3"}),
  gathering("gathering-thornvine", "Thornvine", "flora", "uncommon", {biomes:["forest","swamp","ravine"], tags:["plant","thorn"], quantity:"1d3"}),
  gathering("gathering-moonwort", "Moonwort", "flora", "rare", {biomes:["forest","swamp","underdark"], tags:["herb","arcane"], quantity:"1d2"}),
  gathering("gathering-blackwater-flower", "Blackwater Flower", "flora", "uncommon", {biomes:["swamp"], tags:["flower"]}),
  gathering("gathering-ghost-orchid", "Ghost Orchid", "flora", "veryRare", {biomes:["swamp","underdark"], tags:["flower","arcane"]}),
  gathering("gathering-cliff-moss", "Cliff Moss", "flora", "common", {biomes:["ravine","mountain","forest"], tags:["moss"], quantity:"1d3"}),
  gathering("gathering-ashen-lichen", "Ashen Lichen", "flora", "uncommon", {biomes:["ravine","mountain","cave"], tags:["lichen"]}),
  gathering("gathering-frostbloom", "Frostbloom", "flora", "rare", {biomes:["arctic","mountain"], tags:["flower"]}),
  gathering("gathering-sungrass", "Sungrass", "flora", "common", {biomes:["grassland","forest"], tags:["herb","grass"], quantity:"1d4"}),
  gathering("gathering-sea-herb", "Tide Herb", "flora", "common", {biomes:["coast","swamp"], tags:["herb"]}),

  // Fungi — intentionally asymmetric by biome: Forest has one dependable fungus, Mountain four,
  // Cave five, Swamp three, and Grassland only a very rare find.
  gathering("gathering-mooncap", "Mooncap Mushroom", "flora", "common", {biomes:["forest"], tags:["fungus","mushroom"], quantity:"1d3"}),
  gathering("gathering-cavecap", "Cavecap Mushroom", "flora", "common", {biomes:["cave","mountain","ravine"], tags:["fungus","mushroom"], quantity:"1d3"}),
  gathering("gathering-bitter-fungus", "Bitter Fungus", "flora", "common", {biomes:["swamp","mountain"], tags:["fungus","bitter"], quantity:"1d3"}),
  gathering("gathering-glowcap", "Glowcap Fungus", "flora", "uncommon", {biomes:["cave","underdark","mountain"], tags:["fungus","luminous"], quantity:"1d2"}),
  gathering("gathering-embercap", "Embercap Mushroom", "flora", "uncommon", {biomes:["cave","mountain","desert"], tags:["fungus","fire"], quantity:"1d2"}),
  gathering("gathering-deep-spore", "Deep Spore", "flora", "rare", {biomes:["underdark","cave"], tags:["fungus","spore"]}),
  gathering("gathering-ghost-fungus", "Ghost Fungus", "flora", "rare", {biomes:["underdark","swamp","cave"], tags:["fungus","spirit"]}),
  gathering("gathering-mycelial-cluster", "Mycelial Cluster", "flora", "rare", {biomes:["underdark","swamp"], tags:["fungus","mycelium"]}),
  gathering("gathering-prairie-truffle", "Prairie Truffle", "flora", "veryRare", {biomes:["grassland"], tags:["fungus","truffle"]}),

  // Roots
  gathering("gathering-bloodroot", "Bloodroot", "flora", "common", {biomes:["forest","swamp"], tags:["root"], quantity:"1d3"}),
  gathering("gathering-common-root", "Common Root", "flora", "common", {biomes:["forest","grassland","swamp"], tags:["root"], quantity:"1d4"}),
  gathering("gathering-bitter-root", "Bitter Root", "flora", "common", {biomes:["forest","swamp"], tags:["root","bitter"], quantity:"1d3"}),
  gathering("gathering-medicinal-root", "Medicinal Root", "flora", "uncommon", {biomes:["forest","grassland","mountain"], tags:["root","medicine"], quantity:"1d3"}),
  gathering("gathering-cave-root", "Cave Root", "flora", "uncommon", {biomes:["cave","underdark","ravine"], tags:["root"], quantity:"1d2"}),
  gathering("gathering-elven-root", "Elven Root", "flora", "uncommon", {biomes:["forest","ravine"], tags:["root","herb","elven"], quantity:"1d2"}),
  gathering("gathering-arcane-root", "Arcane Root", "flora", "rare", {biomes:["underdark","forest","swamp"], tags:["root","arcane"]}),

  // Wood & Resin
  gathering("gathering-softwood", "Softwood Timber", "flora", "common", {biomes:["forest","grassland","mountain"], tags:["wood"], quantity:"1d4"}),
  gathering("gathering-hardwood", "Hardwood Timber", "flora", "uncommon", {biomes:["forest","swamp"], tags:["wood"], quantity:"1d3"}),
  gathering("gathering-ironwood", "Ironwood Timber", "flora", "rare", {biomes:["forest","mountain"], tags:["wood","craft"], quantity:"1d2"}),
  gathering("gathering-aromatic-resin", "Aromatic Resin", "flora", "common", {biomes:["forest"], tags:["resin","aromatic"], quantity:"1d3"}),
  gathering("gathering-sticky-resin", "Sticky Resin", "flora", "common", {biomes:["forest","swamp"], tags:["resin"], quantity:"1d3"}),
  gathering("gathering-amber-resin", "Amber Resin", "flora", "uncommon", {biomes:["forest","mountain"], tags:["resin","alchemy"], quantity:"1d2"}),
  gathering("gathering-enchanted-resin", "Enchanted Resin", "flora", "rare", {biomes:["forest","underdark"], tags:["resin","arcane"]}),

  // Wild Foraging — non-cultivated foodstuffs discovered in the environment.
  gathering("gathering-wild-berries", "Wild Berries", "flora", "common", {biomes:["forest","grassland","mountain"], tags:["forage","food","berry"], quantity:"1d4"}),
  gathering("gathering-wild-nuts", "Wild Nuts", "flora", "common", {biomes:["forest","mountain"], tags:["forage","food","nut"], quantity:"1d4"}),
  gathering("gathering-wild-honey", "Wild Honey", "flora", "uncommon", {biomes:["forest"], tags:["forage","food","honey"], quantity:"1d2"}),

  // Minerals & Geological. Raw metals remain gathering resources; Steel is deliberately not an ore.
  gathering("gathering-iron-ore", "Iron Ore", "mineral", "common", {biomes:["cave","mountain","ravine","forest","grassland"], tags:["metal"], quantity:"1d4"}),
  gathering("gathering-copper-ore", "Copper Ore", "mineral", "common", {biomes:["cave","mountain","ravine","forest","desert"], tags:["metal"], quantity:"1d4"}),
  gathering("gathering-coal", "Coal", "mineral", "common", {biomes:["cave","mountain","ravine","forest"], tags:["mineral","fuel","coal"], quantity:"1d4"}),
  gathering("gathering-quartz", "Quartz Cluster", "mineral", "common", {biomes:["cave","mountain","ravine","forest","grassland","coast","desert","arctic"], tags:["crystal","stone"], quantity:"1d3"}),
  gathering("gathering-mineral-salt", "Mineral Salt", "mineral", "common", {biomes:["cave","coast","desert","swamp"], tags:["salt"], quantity:"1d4"}),
  gathering("gathering-silver-ore", "Silver Ore", "mineral", "uncommon", {biomes:["cave","mountain","ravine","arctic"], tags:["metal"]}),
  gathering("gathering-raw-crystal", "Raw Crystal", "mineral", "uncommon", {biomes:["cave","ravine","mountain","forest","coast"], tags:["crystal"]}),
  gathering("gathering-rough-gemstone", "Rough Gemstone", "mineral", "uncommon", {biomes:["cave","mountain","ravine","desert","forest"], tags:["gem","crystal"], quantity:"1d2"}),
  gathering("gathering-obsidian", "Obsidian", "mineral", "uncommon", {biomes:["mountain","desert","cave"], tags:["glass","stone"], quantity:"1d3"}),
  gathering("gathering-sulfur", "Sulfur", "mineral", "uncommon", {biomes:["cave","mountain","swamp"], tags:["alchemy","mineral"], quantity:"1d3"}),
  gathering("gathering-gold-ore", "Gold Ore", "mineral", "rare", {biomes:["cave","mountain","ravine","desert"], tags:["metal"], quantity:"1d2"}),
  gathering("gathering-mithral-ore", "Mithral Ore", "mineral", "rare", {biomes:["cave","mountain","underdark"], tags:["metal","fantastic"]}),
  gathering("gathering-arcane-crystal", "Arcane Crystal", "mineral", "rare", {biomes:["cave","underdark","mountain"], tags:["crystal","arcane"]}),
  gathering("gathering-volcanic-glass", "Volcanic Glass", "mineral", "rare", {biomes:["mountain","desert","cave"], tags:["glass","stone"]}),
  gathering("gathering-gem-geode", "Gem-Bearing Geode", "mineral", "rare", {biomes:["cave","mountain","ravine"], tags:["gem","stone"]}),
  gathering("gathering-adamantine-ore", "Adamantine Ore", "mineral", "veryRare", {biomes:["underdark","mountain","cave"], tags:["metal","fantastic"]}),
  gathering("gathering-starstone", "Starstone Shard", "mineral", "legendary", {biomes:["mountain","desert"], tags:["stone","arcane"]}),

  // Game Hunt — abstract environmental hunting, never a targeted Actor harvest.
  // Basic / Rich / Premium quality maps to Common / Rare / Very Rare.
  gathering("hunt-rabbit-basic", "Basic Rabbit Meat", "game", "common", {category:"game-small", biomes:["forest","grassland","mountain"], tags:["game-hunt","small-game","rabbit","meat","basic"], quantity:"1d2"}),
  gathering("hunt-rabbit-rich", "Rich Rabbit Meat", "game", "rare", {category:"game-small", biomes:["forest","grassland","mountain"], tags:["game-hunt","small-game","rabbit","meat","rich"], quantity:"1d2"}),
  gathering("hunt-rabbit-premium", "Premium Rabbit Meat", "game", "veryRare", {category:"game-small", biomes:["forest","grassland","mountain"], tags:["game-hunt","small-game","rabbit","meat","premium"], quantity:"1"}),
  gathering("hunt-hare-basic", "Basic Hare Meat", "game", "common", {category:"game-small", biomes:["grassland","forest","mountain","arctic"], tags:["game-hunt","small-game","hare","meat","basic"], quantity:"1d2"}),
  gathering("hunt-hare-rich", "Rich Hare Meat", "game", "rare", {category:"game-small", biomes:["grassland","forest","mountain","arctic"], tags:["game-hunt","small-game","hare","meat","rich"], quantity:"1d2"}),
  gathering("hunt-hare-premium", "Premium Hare Meat", "game", "veryRare", {category:"game-small", biomes:["grassland","forest","mountain","arctic"], tags:["game-hunt","small-game","hare","meat","premium"], quantity:"1"}),
  gathering("hunt-game-bird-basic", "Basic Game Bird Meat", "game", "common", {category:"game-small", biomes:["forest","grassland","swamp","coast"], tags:["game-hunt","small-game","game-bird","meat","basic"], quantity:"1d2"}),
  gathering("hunt-game-bird-rich", "Rich Game Bird Meat", "game", "rare", {category:"game-small", biomes:["forest","grassland","swamp","coast"], tags:["game-hunt","small-game","game-bird","meat","rich"], quantity:"1d2"}),
  gathering("hunt-game-bird-premium", "Premium Game Bird Meat", "game", "veryRare", {category:"game-small", biomes:["forest","grassland","swamp","coast"], tags:["game-hunt","small-game","game-bird","meat","premium"], quantity:"1"}),

  gathering("hunt-wild-boar-basic", "Basic Wild Boar Meat", "game", "common", {category:"game-medium", biomes:["forest","grassland","swamp"], tags:["game-hunt","medium-game","wild-boar","meat","basic"], quantity:"1d4"}),
  gathering("hunt-wild-boar-rich", "Rich Wild Boar Meat", "game", "rare", {category:"game-medium", biomes:["forest","grassland","swamp"], tags:["game-hunt","medium-game","wild-boar","meat","rich"], quantity:"1d3"}),
  gathering("hunt-wild-boar-premium", "Premium Wild Boar Meat", "game", "veryRare", {category:"game-medium", biomes:["forest","grassland","swamp"], tags:["game-hunt","medium-game","wild-boar","meat","premium"], quantity:"1d2"}),
  gathering("hunt-wild-goat-basic", "Basic Wild Goat Meat", "game", "common", {category:"game-medium", biomes:["mountain","grassland","ravine"], tags:["game-hunt","medium-game","wild-goat","meat","basic"], quantity:"1d3"}),
  gathering("hunt-wild-goat-rich", "Rich Wild Goat Meat", "game", "rare", {category:"game-medium", biomes:["mountain","grassland","ravine"], tags:["game-hunt","medium-game","wild-goat","meat","rich"], quantity:"1d3"}),
  gathering("hunt-wild-goat-premium", "Premium Wild Goat Meat", "game", "veryRare", {category:"game-medium", biomes:["mountain","grassland","ravine"], tags:["game-hunt","medium-game","wild-goat","meat","premium"], quantity:"1d2"}),

  gathering("hunt-deer-basic", "Basic Deer Meat", "game", "common", {category:"game-large", biomes:["forest","grassland","mountain"], tags:["game-hunt","large-game","deer","meat","basic"], quantity:"1d6"}),
  gathering("hunt-deer-rich", "Rich Deer Meat", "game", "rare", {category:"game-large", biomes:["forest","grassland","mountain"], tags:["game-hunt","large-game","deer","meat","rich"], quantity:"1d4"}),
  gathering("hunt-deer-premium", "Premium Deer Meat", "game", "veryRare", {category:"game-large", biomes:["forest","grassland","mountain"], tags:["game-hunt","large-game","deer","meat","premium"], quantity:"1d3"}),
  gathering("hunt-elk-basic", "Basic Elk Meat", "game", "common", {category:"game-large", biomes:["forest","mountain","grassland","arctic"], tags:["game-hunt","large-game","elk","meat","basic"], quantity:"1d8"}),
  gathering("hunt-elk-rich", "Rich Elk Meat", "game", "rare", {category:"game-large", biomes:["forest","mountain","grassland","arctic"], tags:["game-hunt","large-game","elk","meat","rich"], quantity:"1d6"}),
  gathering("hunt-elk-premium", "Premium Elk Meat", "game", "veryRare", {category:"game-large", biomes:["forest","mountain","grassland","arctic"], tags:["game-hunt","large-game","elk","meat","premium"], quantity:"1d4"}),

  // Cultivated / Domestic — ordinary farm, orchard, apiary and livestock products. These are
  // intentionally Profession & Trade materials rather than Environment Gathering results.
  profession("trade-wheat", "Wheat", "cultivated", "common", {tags:["cultivated","crop","grain","food"]}),
  profession("trade-corn", "Corn", "cultivated", "common", {tags:["cultivated","crop","food"]}),
  profession("trade-barley", "Barley", "cultivated", "common", {tags:["cultivated","crop","grain","food"]}),
  profession("trade-rice", "Rice", "cultivated", "common", {tags:["cultivated","crop","grain","food"]}),
  profession("trade-oats", "Oats", "cultivated", "common", {tags:["cultivated","crop","grain","food"]}),
  profession("trade-sugar-cane", "Sugar Cane", "cultivated", "common", {tags:["cultivated","crop","food","brewing","cane"]}),
  profession("trade-potato", "Potato", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-onion", "Onion", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-garlic", "Garlic", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-carrot", "Carrot", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-cabbage", "Cabbage", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-peas", "Peas", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-beans", "Beans", "cultivated", "common", {tags:["cultivated","crop","vegetable","food"]}),
  profession("trade-apple", "Apple", "cultivated", "common", {tags:["cultivated","orchard","fruit","food"]}),
  profession("trade-grapes", "Grapes", "cultivated", "common", {tags:["cultivated","orchard","fruit","food"]}),
  profession("trade-milk", "Milk", "cultivated", "common", {tags:["cultivated","domestic","dairy","food"]}),
  profession("trade-eggs", "Eggs", "cultivated", "common", {tags:["cultivated","domestic","egg","food"]}),
  profession("trade-honey", "Honey", "cultivated", "common", {tags:["cultivated","domestic","apiary","honey","food"]}),

  // Food & Cooking — processed or pantry staples.
  profession("trade-salt", "Salt", "trade", "common", {tags:["food","preservative"]}),
  profession("trade-bread", "Bread", "trade", "common", {tags:["food"]}),
  profession("trade-flour", "Flour", "trade", "common", {tags:["food","grain"]}),
  profession("trade-seasonings", "Seasonings", "trade", "common", {tags:["food","spice"]}),
  profession("trade-cooking-oil", "Cooking Oil", "trade", "common", {tags:["food","oil"]}),

  // Leatherworking — intentionally compact; Thread from General Materials can be shared by Recipes.
  profession("trade-leather-piece", "Leather Piece", "trade", "common", {tags:["leather","craft"]}),
  profession("trade-leather-straps", "Leather Straps", "trade", "uncommon", {tags:["leather","craft"]}),
  profession("trade-refined-leather", "Refined Leather", "trade", "rare", {tags:["leather","craft"]}),

  // General reusable crafting materials shared across professions.
  profession("trade-thread", "Thread", "trade", "common", {tags:["textile","general","craft"]}),
  profession("trade-cloth", "Cloth", "trade", "common", {tags:["textile","general","craft"]}),
  profession("trade-twine", "Twine", "trade", "common", {tags:["cordage","general","craft"]}),
  profession("trade-wax", "Wax", "trade", "common", {tags:["wax","general","craft"]}),
  profession("trade-fine-cloth", "Fine Cloth", "trade", "rare", {tags:["textile","general","craft"]}),

  // Alchemy — broadly useful processed reagents rather than specific potion Recipes.
  profession("trade-alcohol", "Alcohol", "trade", "common", {tags:["alchemy","solvent","liquid"]}),
  profession("trade-distilled-extract", "Distilled Extract", "trade", "uncommon", {tags:["alchemy","extract","liquid"]}),
  profession("trade-binding-agent", "Binding Agent", "trade", "uncommon", {tags:["alchemy","binder","craft"]}),
  profession("trade-alchemical-catalyst", "Alchemical Catalyst", "trade", "rare", {tags:["alchemy","catalyst"]}),
  profession("trade-alchemical-solvent", "Alchemical Solvent", "trade", "rare", {tags:["alchemy"]}),
  profession("trade-refined-pigment", "Refined Pigment", "trade", "veryRare", {tags:["craft","alchemy"]}),

  // Metalworking — raw ores come from Gathering; ingots/alloys are the processed stage.
  profession("trade-charcoal", "Charcoal", "trade", "common", {tags:["smithing","fuel","charcoal"]}),
  profession("trade-iron-ingot", "Iron Ingot", "trade", "uncommon", {tags:["metal","smithing"]}),
  profession("trade-copper-ingot", "Copper Ingot", "trade", "uncommon", {tags:["metal","smithing"]}),
  profession("trade-steel-ingot", "Steel Ingot", "trade", "uncommon", {tags:["metal","smithing","alloy","carbon"]}),
  profession("trade-silver-ingot", "Silver Ingot", "trade", "rare", {tags:["metal","smithing"]}),
  profession("trade-gold-ingot", "Gold Ingot", "trade", "rare", {tags:["metal","smithing"]}),
  profession("trade-mithral-ingot", "Mithral Ingot", "trade", "veryRare", {tags:["metal","smithing","fantastic"]}),
  profession("trade-adamantine-ingot", "Adamantine Ingot", "trade", "legendary", {tags:["metal","smithing","fantastic"]}),
  profession("trade-masterwork-alloy", "Masterwork Alloy", "trade", "veryRare", {tags:["metal","smithing","alloy"]}),

  // Gemcutting & Crystals — explicit refinement chains for Geological materials.
  profession("trade-cut-gem", "Cut Gemstone", "trade", "rare", {tags:["gem","jewelry","gemcutting"]}),
  profession("trade-perfect-gem", "Perfect Gemstone", "trade", "legendary", {tags:["gem","jewelry","gemcutting"]}),
  profession("trade-refined-crystal", "Refined Crystal", "trade", "rare", {tags:["crystal","gemcutting","craft"]}),
  profession("trade-perfect-crystal", "Perfected Crystal", "trade", "veryRare", {tags:["crystal","gemcutting","craft"]})

]);
