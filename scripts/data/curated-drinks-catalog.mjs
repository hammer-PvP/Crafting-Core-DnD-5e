/**
 * Crafting Core official Curated Drink libraries.
 *
 * Alcoholic drinks are persistent Item Creator consumables. All alcoholic Products
 * share one runtime family so a new alcoholic drink replaces the previous one, while
 * remaining independent from Curated Food effects.
 *
 * Non-alcoholic drinks are intentionally simple native D&D5e healing consumables.
 */

export const CURATED_DRINKS_VERSION = 1;

const alcoholIcons = {
  beer: [
    "icons/consumables/drinks/alcohol-jar-spirits-gray.webp",
    "icons/consumables/drinks/wine-amphora-clay-blue.webp",
    "icons/consumables/drinks/alcohol-spirits-bottle-green.webp"
  ],
  wine: [
    "icons/consumables/drinks/wine-amphora-clay-blue.webp",
    "icons/consumables/drinks/alcohol-spirits-bottle-blue.webp",
    "icons/consumables/potions/bottle-round-corked-pink.webp"
  ],
  spirit: [
    "icons/consumables/drinks/alcohol-spirits-bottle-green.webp",
    "icons/consumables/drinks/alcohol-spirits-bottle-blue.webp",
    "icons/consumables/drinks/alcohol-jar-spirits-gray.webp"
  ]
};

const nonAlcoholIcons = {
  juice: [
    "icons/consumables/drinks/coconut-fruit-milk.webp",
    "icons/consumables/potions/bottle-round-corked-yellow.webp",
    "icons/consumables/potions/flask-corked-yellow-glow.webp"
  ],
  grain: [
    "icons/consumables/drinks/wine-amphora-clay-blue.webp",
    "icons/consumables/drinks/coconut-fruit-milk.webp",
    "icons/consumables/potions/potion-bottle-corked-white.webp"
  ],
  cordial: [
    "icons/consumables/potions/bottle-round-corked-pink.webp",
    "icons/consumables/potions/flask-corked-red-glow.webp",
    "icons/consumables/potions/potion-vial-corked-purple.webp"
  ],
  tonic: [
    "icons/consumables/potions/bottle-round-label-cork-green.webp",
    "icons/consumables/potions/flask-corked-green.webp",
    "icons/consumables/potions/round-cork-leaf-green.webp"
  ],
  herbal: [
    "icons/consumables/potions/round-cork-leaf-green.webp",
    "icons/consumables/potions/potion-flask-corked-teal.webp",
    "icons/consumables/potions/bottle-conical-corked-cyan.webp"
  ]
};

function alcoholic({ id, name, culture, tier, drinkType, ingredients, yieldCount, modifiers, description, iconSet="spirit" }) {
  return {
    id,
    recipeId: `crafting-core-curated-alcohol-${id}`,
    productId: `crafting-core-product-alcohol-${id}`,
    name,
    culture,
    category: "culinary",
    subcategory: "alcoholic-drink",
    drinkType,
    tier,
    rarity: "common",
    curated: true,
    source: "crafting-core",
    effectFamily: "alcohol",
    durationMode: "hours",
    durationValue: 6,
    yield: yieldCount,
    priceMultiplier: 2,
    craftingTime: 10,
    abilityModifiers: { ...modifiers },
    description,
    ingredients: ingredients.map(([materialId, quantity=1]) => ({ materialId, quantity })),
    icons: [...(alcoholIcons[iconSet] ?? alcoholIcons.spirit)]
  };
}

function nonAlcoholic({ id, name, culture, tier, drinkType, ingredients, yieldCount, healing, description, iconSet="tonic" }) {
  return {
    id,
    recipeId: `crafting-core-curated-nonalcohol-${id}`,
    productId: `crafting-core-product-nonalcohol-${id}`,
    name,
    culture,
    category: "culinary",
    subcategory: "non-alcoholic-drink",
    drinkType,
    tier,
    rarity: "common",
    curated: true,
    source: "crafting-core",
    effectFamily: null,
    durationMode: null,
    durationValue: 0,
    yield: yieldCount,
    priceMultiplier: 2,
    craftingTime: 10,
    healing,
    description,
    ingredients: ingredients.map(([materialId, quantity=1]) => ({ materialId, quantity })),
    icons: [...(nonAlcoholIcons[iconSet] ?? nonAlcoholIcons.tonic)]
  };
}

export const CURATED_ALCOHOLIC_RECIPES = Object.freeze([
  alcoholic({ id:"dockside-draft", name:"Dockside Draft", culture:"mundane", tier:"cheap", drinkType:"draft-beer", ingredients:[["trade-barley"]], yieldCount:100, modifiers:{wis:-1}, iconSet:"beer", description:"A thin workers' beer common near docks and markets. Cheap enough to be everywhere and strong enough to dull good judgment." }),
  alcoholic({ id:"sour-house-red", name:"Sour House Red", culture:"mundane", tier:"cheap", drinkType:"wine", ingredients:[["trade-grapes"]], yieldCount:100, modifiers:{int:-1}, iconSet:"wine", description:"A sharp house red produced in quantity and served by the jug." }),
  alcoholic({ id:"barrelhouse-white", name:"Barrelhouse White", culture:"mundane", tier:"cheap", drinkType:"white-whiskey", ingredients:[["trade-corn"]], yieldCount:100, modifiers:{dex:-1}, description:"A clear unaged spirit straight from the still: strong, cheap, and rough around every edge." }),
  alcoholic({ id:"cheap-grain-vodka", name:"Cheap Grain Vodka", culture:"mundane", tier:"cheap", drinkType:"vodka", ingredients:[["trade-rice"]], yieldCount:100, modifiers:{con:-1}, description:"A bargain grain spirit that proves low price is not the same thing as a gentle drink." }),
  alcoholic({ id:"backroad-spirit", name:"Backroad Spirit", culture:"mundane", tier:"cheap", drinkType:"spirit", ingredients:[["trade-oats"]], yieldCount:100, modifiers:{cha:-1}, description:"A rustic spirit notorious for producing the loud, unpleasant sort of confidence rather than charm." }),
  alcoholic({ id:"roadwarden-ale", name:"Roadwarden Ale", culture:"mundane", tier:"proper", drinkType:"ale", ingredients:[["trade-barley"],["trade-honey"]], yieldCount:20, modifiers:{str:2,wis:-4}, iconSet:"beer", description:"A hearty ale favored by road guards and caravan hands. It lends physical confidence while making caution seem unnecessary." }),
  alcoholic({ id:"moonveil-claret", name:"Moonveil Claret", culture:"mundane", tier:"proper", drinkType:"red-wine", ingredients:[["trade-grapes"],["gathering-wild-berries"]], yieldCount:20, modifiers:{cha:2,int:-4}, iconSet:"wine", description:"A refined claret that loosens the tongue considerably faster than it improves the ideas behind it." }),
  alcoholic({ id:"glassfire-vodka", name:"Glassfire Vodka", culture:"mundane", tier:"reserve", drinkType:"vodka", ingredients:[["trade-rice"],["trade-potato"],["trade-honey"]], yieldCount:10, modifiers:{dex:2,wis:-4}, description:"A clear reserve vodka with a deceptively clean finish. Movements become quick and decisive while judgment falls behind." }),

  alcoholic({ id:"deepmine-bitter", name:"Deepmine Bitter", culture:"dwarven", tier:"cheap", drinkType:"bitter-beer", ingredients:[["trade-barley"]], yieldCount:100, modifiers:{dex:-1}, iconSet:"beer", description:"A bitter everyday mine beer found in dwarven holds and work halls." }),
  alcoholic({ id:"forgehand-ale", name:"Forgehand Ale", culture:"dwarven", tier:"proper", drinkType:"ale", ingredients:[["trade-barley"],["trade-honey"]], yieldCount:20, modifiers:{str:2,wis:-4}, iconSet:"beer", description:"A forge-side ale that makes heavy work feel lighter and risky ideas feel much more reasonable." }),
  alcoholic({ id:"stonebelly-stout", name:"Stonebelly Stout", culture:"dwarven", tier:"reserve", drinkType:"stout", ingredients:[["trade-barley"],["trade-oats"],["gathering-bitter-fungus"]], yieldCount:10, modifiers:{str:2,dex:-4}, iconSet:"beer", description:"A dense dwarven stout that puts weight behind every movement while making fine coordination noticeably worse." }),
  alcoholic({ id:"clearforge-reserve", name:"Clearforge Reserve", culture:"dwarven", tier:"proper", drinkType:"light-ale", ingredients:[["trade-barley"],["gathering-bitter-fungus"]], yieldCount:20, modifiers:{int:2,dex:-4}, iconSet:"beer", description:"An unusually light dwarven reserve sipped by artificers and master smiths while discussing precise work. It settles the mind while relaxing the hands." }),
  alcoholic({ id:"emberrest-bourbon", name:"Emberrest Bourbon", culture:"dwarven", tier:"proper", drinkType:"bourbon", ingredients:[["trade-corn"],["trade-barley"]], yieldCount:20, modifiers:{wis:2,dex:-4}, description:"A mild bourbon meant for slow drinking after the forge cools. It encourages patient reflection at the cost of sharp reflexes." }),
  alcoholic({ id:"king-under-the-mountain", name:"King Under the Mountain", culture:"dwarven", tier:"reserve", drinkType:"whiskey", ingredients:[["trade-corn"],["trade-barley"],["trade-honey"]], yieldCount:10, modifiers:{str:2,int:-4}, description:"A prestigious aged dwarven whiskey. After a few measures, wrestling an ogre begins to sound like a sensible test of character." }),
  alcoholic({ id:"cavern-ember", name:"Cavern Ember", culture:"dwarven", tier:"proper", drinkType:"spirit", ingredients:[["trade-oats"],["gathering-bitter-fungus"]], yieldCount:20, modifiers:{dex:2,int:-4}, description:"A quick-burning cavern spirit that puts motion ahead of thought." }),

  alcoholic({ id:"dewwine", name:"Dewwine", culture:"elven", tier:"cheap", drinkType:"light-wine", ingredients:[["trade-grapes"]], yieldCount:100, modifiers:{str:-1}, iconSet:"wine", description:"A very light young wine traditionally served fresh. More relaxing than intoxicating, though it still softens physical drive." }),
  alcoholic({ id:"stillleaf-wine", name:"Stillleaf Wine", culture:"elven", tier:"proper", drinkType:"herbal-wine", ingredients:[["trade-grapes"],["gathering-elfleaf"]], yieldCount:20, modifiers:{int:2,str:-4}, iconSet:"wine", description:"A delicate low-proof herbal wine associated with quiet conversation and study. It clears the mind while leaving the body deeply relaxed." }),
  alcoholic({ id:"starlight-rose", name:"Starlight Rosé", culture:"elven", tier:"proper", drinkType:"rose", ingredients:[["trade-grapes"],["gathering-wild-berries"]], yieldCount:20, modifiers:{dex:2,wis:-4}, iconSet:"wine", description:"A bright rosé that makes movement feel effortless while making restraint feel optional." }),
  alcoholic({ id:"moonpetal-mead", name:"Moonpetal Mead", culture:"elven", tier:"proper", drinkType:"mead", ingredients:[["trade-honey"],["gathering-elfleaf"]], yieldCount:20, modifiers:{cha:2,int:-4}, iconSet:"wine", description:"A floral mead served at songs and evening gatherings, encouraging warmth and conversation over careful reasoning." }),
  alcoholic({ id:"autumn-stillness-vintage", name:"Autumn Stillness Vintage", culture:"elven", tier:"reserve", drinkType:"wine", ingredients:[["trade-grapes"],["trade-honey"],["gathering-elfleaf"]], yieldCount:10, modifiers:{wis:2,str:-4}, iconSet:"wine", description:"A very mild autumn vintage intended for contemplation, meditation, and long conversation. Its calm comes with a pronounced physical languor." }),
  alcoholic({ id:"song-of-the-summer-court", name:"Song of the Summer Court", culture:"elven", tier:"reserve", drinkType:"fruit-wine", ingredients:[["trade-grapes"],["gathering-wild-berries"],["trade-honey"]], yieldCount:10, modifiers:{cha:2,int:-4}, iconSet:"wine", description:"A festival wine that does not necessarily improve anyone's singing, only their certainty that everyone needs to hear it." }),
  alcoholic({ id:"quiet-twilight-nectar", name:"Quiet Twilight Nectar", culture:"elven", tier:"reserve", drinkType:"mead", ingredients:[["trade-honey"],["gathering-wild-berries"],["gathering-elfleaf"]], yieldCount:10, modifiers:{int:2,cha:-4}, iconSet:"wine", description:"A low-proof twilight nectar for slow sipping and inward thought. It sharpens concentration while making the drinker unusually withdrawn." }),

  alcoholic({ id:"fieldhand-cachaca", name:"Fieldhand Cachaça", culture:"cane-spirit", tier:"cheap", drinkType:"cachaca", ingredients:[["trade-sugar-cane"]], yieldCount:100, modifiers:{wis:-1}, description:"A simple rural cane spirit: inexpensive, direct, and rarely associated with improved judgment." }),
  alcoholic({ id:"golden-cane", name:"Golden Cane", culture:"cane-spirit", tier:"proper", drinkType:"cachaca", ingredients:[["trade-sugar-cane"],["trade-honey"]], yieldCount:20, modifiers:{cha:2,int:-4}, description:"A smooth honeyed cachaça that turns social hesitation into confidence while making careful thought much less fashionable." }),
  alcoholic({ id:"laughing-mule-cachaca", name:"Laughing Mule Cachaça", culture:"cane-spirit", tier:"proper", drinkType:"cachaca", ingredients:[["trade-sugar-cane"],["gathering-wild-berries"]], yieldCount:20, modifiers:{cha:2,wis:-4}, description:"A berry-infused cachaça famous for making people extremely sociable and much less capable of noticing when a story should end." }),
  alcoholic({ id:"old-barrel-cachaca", name:"Old Barrel Cachaça", culture:"cane-spirit", tier:"reserve", drinkType:"aged-cachaca", ingredients:[["trade-sugar-cane"],["trade-honey"],["trade-seasonings"]], yieldCount:10, modifiers:{cha:2,int:-4}, description:"An aged cane spirit with a warm, spiced finish and the polished confidence of a drink meant to be shared." }),

  alcoholic({ id:"black-kettle-whiskey", name:"Black Kettle Whiskey", culture:"mundane", tier:"reserve", drinkType:"whiskey", ingredients:[["trade-corn"],["trade-oats"],["trade-honey"]], yieldCount:10, modifiers:{dex:2,int:-4}, description:"A dark reserve whiskey with a fast, warming finish. It favors decisive movement over measured thought." }),
  alcoholic({ id:"hunters-stillness", name:"Hunter's Stillness", culture:"mundane", tier:"proper", drinkType:"berry-spirit", ingredients:[["gathering-wild-berries"],["trade-honey"]], yieldCount:20, modifiers:{wis:2,str:-4}, description:"A deliberately weak berry spirit taken slowly by hunters who want nerves to settle before a long watch. The mind grows quiet while the body loosens." })
]);

export const CURATED_NON_ALCOHOLIC_RECIPES = Object.freeze([
  nonAlcoholic({ id:"fresh-cane-juice", name:"Fresh Cane Juice", culture:"mundane", tier:"simple", drinkType:"juice", ingredients:[["trade-sugar-cane"]], yieldCount:100, healing:1, iconSet:"juice", description:"Fresh juice pressed directly from sugar cane, common in markets, fairs, and warm regions." }),
  nonAlcoholic({ id:"barley-water", name:"Barley Water", culture:"mundane", tier:"simple", drinkType:"grain-drink", ingredients:[["trade-barley"]], yieldCount:100, healing:1, iconSet:"grain", description:"A simple drink prepared with cooked barley and water, common among travelers, workers, and rural communities." }),
  nonAlcoholic({ id:"honeyed-apple-cider", name:"Honeyed Apple Cider", culture:"mundane", tier:"prepared", drinkType:"non-alcoholic-cider", ingredients:[["trade-apple"],["trade-honey"]], yieldCount:40, healing:2, iconSet:"cordial", description:"Fresh apple cider sweetened with honey and served cool or gently warmed. This version is explicitly non-alcoholic." }),
  nonAlcoholic({ id:"berry-cordial", name:"Berry Cordial", culture:"mundane", tier:"prepared", drinkType:"fruit-cordial", ingredients:[["gathering-wild-berries"],["trade-honey"]], yieldCount:40, healing:2, iconSet:"cordial", description:"A sweet concentrated berry cordial commonly found at better taverns, fairs, and celebrations." }),
  nonAlcoholic({ id:"harvesters-tonic", name:"Harvester's Tonic", culture:"mundane", tier:"specialty", drinkType:"tonic", ingredients:[["trade-apple"],["trade-carrot"],["trade-honey"]], yieldCount:30, healing:3, iconSet:"tonic", description:"A nourishing fruit-and-root tonic prepared for workers during long harvest days." }),

  nonAlcoholic({ id:"miners-barley-water", name:"Miner's Barley Water", culture:"dwarven", tier:"simple", drinkType:"grain-drink", ingredients:[["trade-barley"]], yieldCount:100, healing:1, iconSet:"grain", description:"A concentrated dwarven barley water commonly carried in canteens through long mining shifts." }),
  nonAlcoholic({ id:"forgecooler", name:"Forgecooler", culture:"dwarven", tier:"prepared", drinkType:"malt-drink", ingredients:[["trade-barley"],["trade-honey"]], yieldCount:40, healing:2, iconSet:"grain", description:"A chilled barley-and-honey work drink for smiths and artisans spending hours beside forge heat." }),
  nonAlcoholic({ id:"deepwell-tonic", name:"Deepwell Tonic", culture:"dwarven", tier:"prepared", drinkType:"fungal-tonic", ingredients:[["trade-oats"],["gathering-bitter-fungus"]], yieldCount:40, healing:2, iconSet:"tonic", description:"A thick tonic of oats and subterranean fungus. Most non-dwarves find it aggressively bitter." }),
  nonAlcoholic({ id:"stonebrew-malt", name:"Stonebrew Malt", culture:"dwarven", tier:"specialty", drinkType:"malt-drink", ingredients:[["trade-barley"],["trade-oats"],["trade-honey"]], yieldCount:30, healing:3, iconSet:"grain", description:"A rich, dense malt drink substantial enough to stand in for a small meal in many dwarven holds." }),
  nonAlcoholic({ id:"underhall-restorative", name:"Underhall Restorative", culture:"dwarven", tier:"specialty", drinkType:"root-tonic", ingredients:[["gathering-common-root"],["gathering-bitter-fungus"],["trade-honey"]], yieldCount:30, healing:3, iconSet:"tonic", description:"A traditional root, fungus, and honey tonic served after long journeys through mines and deep halls." }),

  nonAlcoholic({ id:"silverdew-infusion", name:"Silverdew Infusion", culture:"elven", tier:"simple", drinkType:"herbal-infusion", ingredients:[["gathering-elfleaf"]], yieldCount:100, healing:1, iconSet:"herbal", description:"A light aromatic leaf infusion traditionally prepared in the early morning." }),
  nonAlcoholic({ id:"moonberry-tea", name:"Moonberry Tea", culture:"elven", tier:"prepared", drinkType:"herbal-fruit-tea", ingredients:[["gathering-wild-berries"],["gathering-elfleaf"]], yieldCount:40, healing:2, iconSet:"herbal", description:"A gently sweet berry-and-leaf infusion traditionally served around dusk." }),
  nonAlcoholic({ id:"greenpath-tonic", name:"Greenpath Tonic", culture:"elven", tier:"prepared", drinkType:"herbal-tonic", ingredients:[["trade-apple"],["gathering-elfleaf"]], yieldCount:40, healing:2, iconSet:"herbal", description:"A fresh apple-and-herb tonic carried by elven travelers and patrols on long forest roads." }),
  nonAlcoholic({ id:"dawnleaf-cordial", name:"Dawnleaf Cordial", culture:"elven", tier:"specialty", drinkType:"herbal-cordial", ingredients:[["trade-apple"],["trade-honey"],["gathering-elfleaf"]], yieldCount:30, healing:3, iconSet:"cordial", description:"A clear aromatic cordial of fruit, honey, and fresh leaves, often served at the start of celebrations or after long travel." }),
  nonAlcoholic({ id:"summer-court-nectar", name:"Summer Court Nectar", culture:"elven", tier:"specialty", drinkType:"fruit-nectar", ingredients:[["trade-grapes"],["gathering-wild-berries"],["trade-honey"]], yieldCount:30, healing:3, iconSet:"cordial", description:"A sweet fruit nectar associated with elven festivals and banquets, suitable for guests who do not drink wine." })
]);
