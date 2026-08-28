# Changelog

## 0.0.19f1
- Rebuilt the generated Item Pile fix from the user-supplied stable **v0.0.19f** baseline; the previous f1 attempt is not part of this build.
- Changed Generate Materials Item Pile creation to a two-stage transaction: create the hidden pile empty first, then populate its inventory through Item Piles `addItems()` using `{ item, quantity }` entries, matching the already-live-validated Token Harvest integration.
- Added a unique generated-loot batch/material marker to cloned Items and post-transaction verification that every Preview material and quantity exists in the created pile.
- If Item Piles creation succeeds but population or verification fails, Crafting Core removes the newly created Token instead of silently leaving a partial pile.
- Temporarily disables `deleteWhenEmpty` only while the empty pile is being populated, then restores the Item Piles default when available.
- Drag-to-scene and **Create Hidden at Scene Center** share the same corrected population path, so Creature Harvest manual, Environment Gathering, and Game Hunt receive the same fix.
- No generation probabilities, yield, dropdown UX, Harvest pools, Essence rules, Game Hunt behavior, or Crafting Project mechanics changed.

## 0.0.19f
- Converted Generate Materials checkbox multi-selects into true anchored **popover/dropdown controls**. Biomes, Resources, Abundance, Creature Types, Harvest Profiles, and Essence Affinities now open over the Application instead of expanding/reflowing the window.
- Applied the same popover interaction to Harvest Profile rarity-pool material selection, establishing the shared rule that selector dropdowns must not distort Application layout.
- Added a draggable **Generated Loot** card to non-empty Generate Materials previews when Item Piles is active. Dragging the card onto the viewed Scene creates the Item Pile at the exact drop coordinates.
- Generated Item Piles now spawn **Hidden** by default so the GM can prepare gathering/hunting results during RP and reveal them later.
- Kept **Create Hidden at Scene Center** only as a secondary fallback; drag-to-scene is the primary Item Piles workflow.
- Preserved all v0.0.19e generation mathematics, mixed-biome/resource behavior, abundance handling, attempts, Game Hunt yield, Harvest pools, and Crafting Project mechanics.
- Test checklist remains a separate validation artifact and is not bundled in the GitHub/Foundry runtime ZIP.

## 0.0.19e
- Reworked **Generate Materials** into a shared multi-selection gathering tool for manual Creature Harvest, Environment Gathering, and Game Hunt.
- Added checkbox multi-select fields using the same compact interaction language as Harvest Profile rarity pools.
- Manual Creature Harvest can mix Creature Types and Harvest Profiles in one generation while preserving Essence affinity selection and Sources/Bodies as the attempt count.
- Environment Gathering now supports up to 3 Biomes, multiple Resource Categories, up to 2 Abundance bands, and explicit Gather Attempts.
- Mixed Environment generation chooses from the selected biome/resource context per discovery; selecting more categories expands variety instead of multiplying loot linearly.
- Game Hunt now supports up to 3 Biomes and up to 2 Abundance bands in one generation; Hunt Attempts remain the number of hunting opportunities.
- Added direct **Create Item Pile** output when Item Piles is active. The generated pile is created on the viewed Scene and uses the highest-quantity generated material as its visual when possible.
- Renamed Materials **Create / Sync Materials** to **Sync Catalog** and added a distinct **Reset to Curated Defaults** action. Sync preserves GM overrides; Reset deliberately restores every built-in curated material and rarity economy while preserving registered custom materials.
- Compacted Creature Scanner pool/candidate/Essence/Pinpoint counters and slightly tightened Harvest Profile editor spacing.
- Test checklists are no longer packaged in the GitHub/Foundry runtime ZIP; the current checklist is delivered separately for manual validation.

## 0.0.19d

Harvest variety and Game Hunt expansion on the stable v0.0.19 line. Crafting Projects, Progress Checks, Knowledge, Item Piles gear handling, and normalization are otherwise unchanged.

- Replaced scanned Harvest Profiles' old one-material-per-slot model with four **multi-material rarity pools**: Common, Uncommon, Rare, and Very Rare / Legendary. The separate fifth **Essence Pool** and GM Pinpoint Overrides remain independent.
- Each rarity pool now uses a checkbox multi-select. A successful pool produces **exactly one** of its selected materials, chosen with equal probability. Adding candidates increases variety without increasing the number of drops from that rarity.
- Added an automatic migration for stored legacy Harvest Profiles. Existing single-material slots are grouped into their matching rarity pools while preserving pool chances and non-default quantity overrides where possible.
- Reworked Creature Scanner normalization to populate several plausible candidates per rarity from D&D5e anatomy, creature type, natural attacks/features, magical signals, rarity, and specialty requirements. Scanner rows now show both active-pool count and total candidate count.
- Improved natural anatomy inference for NPCs whose Beak, Claw, Bite, Talon, Sting, or similar anatomy exists only in native Weapon/Activity data. Flying creatures with explicit avian anatomy can infer feathers/wings without treating incidental spell text as morphology.
- Expanded Monstrosity bridge materials with **Monstrous Flesh, Monstrous Blood, Monster Fang, Monstrous Bone, Monstrous Eye, and Monstrous Gland** so rich anatomy no longer collapses into only Hide/Arcane Organ. `Monstrous Venom Gland` still requires venom/poison evidence, and `Arcane Organ` requires an arcane signal.
- Added **Game Hunt** as a third manual material-generation origin alongside Creature Harvest and Environment Gathering. It is pool-based and never requires an Actor/Token target.
- Added 21 Game Hunt materials across seven species: Rabbit, Hare, Game Bird, Wild Boar, Wild Goat, Deer, and Elk. Every species has **Basic (Common), Rich (Rare), and Premium (Very Rare)** meat.
- Game Hunt Abundance now controls three separate pressures: chance to find game, Small/Medium/Large prey distribution, and Basic/Rich/Premium quality distribution. Prey size is rolled before species so the configured size weights remain stable even when a biome contains different numbers of species.
- Game Hunt materials live in dedicated nested Materials Compendium folders: **Gathering → Game Hunt → Small Game / Medium Game / Large Game**. Standard Environment Gathering excludes these categories.
- Expanded the curated Material Catalog from **202 to 229 built-ins** and bumped the catalog schema to version **8**.
- Every built-in material still has exactly three Foundry Core icon candidates with one curated default. All icon paths are references to native `icons/...` assets; Crafting Core bundles no Foundry artwork.
- Extra Effort remains reserved for v0.0.20.

## 0.0.19c

Cultivated/Domestic and Profession & Trade catalog expansion on the stable v0.0.19 line. Crafting Projects, Creature Harvest, Scanner, Essence, Item Piles, and gear normalization are unchanged.

- Expanded the built-in curated Material Catalog from **165 to 202 materials**.
- Added a dedicated **Profession & Trade — Cultivated & Domestic** group with 17 farm/orchard/apiary staples: Wheat, Corn, Barley, Rice, Oats, Potato, Onion, Garlic, Carrot, Cabbage, Peas, Beans, Apple, Grapes, Milk, Eggs, and Honey. These are vendor/farm materials and are not Environment Gathering results.
- Added **Wild Foraging** to Environment Gathering with Wild Berries, Wild Nuts, and **Wild Honey**. Wild Honey is distinct from cultivated Honey and currently belongs to Forest gathering.
- Refined fungus distribution by biome so the resource remains discoverable without making every biome equivalent: Forest has one dependable fungus, Mountain four, Cave five, Swamp three, Grassland one very-rare fungus, with additional Underdark/Ravine/Desert presence where appropriate.
- Added **Elven Root** to the Roots pool, complementing Elvenleaf Herb and giving Forest/Ravine exploration another distinct botanical resource.
- Expanded **Alchemy** with Alcohol, Distilled Extract, Binding Agent, and Alchemical Catalyst alongside the existing Alchemical Solvent and Refined Pigment.
- Expanded **General Materials** with Thread, Cloth, Twine, and Wax. Fine Cloth remains the higher-tier textile and shared materials can be reused across Leatherworking and other Recipes.
- Added a dedicated **Gemcutting & Crystals** Profession group. Rough Gemstone can now progress conceptually to Cut Gemstone and Perfect Gemstone; Raw Crystal can progress to Refined Crystal and Perfected Crystal.
- Expanded **Metalworking** with Copper Ingot, Gold Ingot, Mithral Ingot, and Adamantine Ingot. Coal remains a gathered mineral fuel; Charcoal remains a separate processed/trade fuel. Steel remains a processed alloy material intended for a simple Iron Ingot + carbon-source refinement Recipe rather than any fictional Steel Ore.
- Preserved GM-authored Recipes as the authority for actual refinement ratios; v0.0.19c adds the material endpoints but does not auto-create refinery Recipes.
- Every one of the **202** built-in materials has exactly three Foundry Core icon candidates and one curated default. All 202 shipped defaults use distinct icon paths, and all referenced paths were validated against the supplied Core Icons archive. No Foundry artwork is bundled.
- Reworked Materials search so typing filters the already-rendered catalog in place. Search no longer rerenders on each keystroke, preserving focus, caret, scroll position, and open groups for normal human typing speed. Search text includes material name, ID, nature, category, tags, and biomes.
- Bumped the built-in Material Catalog schema to version **7**.
- Game Hunt remains reserved for v0.0.19d. Extra Effort remains reserved for v0.0.20.

## 0.0.19b

Environment Catalog and icon-curation refinement on the stable v0.0.19 line. Crafting Projects, Harvest, Scanner, Essence, Item Piles, and gear normalization are not changed.

- Expanded the built-in curated Material Catalog from **132 to 165 materials**.
- Expanded Environment Gathering to **51** curated records across Flora, Roots, Fungi, Wood & Resin, and **Minerals & Geological**.
- Added new wild Flora: `Wild Sage`, `Bitterleaf`, `Silverleaf`, `Thornvine`, and `Moonwort`.
- Added new Fungi: `Cavecap Mushroom`, `Bitter Fungus`, `Glowcap Fungus`, `Embercap Mushroom`, `Ghost Fungus`, and `Mycelial Cluster`.
- Added new Roots: `Common Root`, `Bitter Root`, `Medicinal Root`, `Cave Root`, and `Arcane Root`.
- Added Wood & Resin depth: `Softwood Timber`, `Hardwood Timber`, `Ironwood Timber`, `Sticky Resin`, `Amber Resin`, and `Enchanted Resin` in addition to the existing Aromatic Resin.
- Expanded Minerals & Geological with `Coal`, `Quartz Cluster`, `Rough Gemstone`, `Obsidian`, `Sulfur`, `Gold Ore`, `Mithral Ore`, `Adamantine Ore`, and `Gem-Bearing Geode`.
- Broadened biome metadata so Environment resources can overlap naturally. Forest/Grassland/Coast/Arctic/etc. can expose geological resources where configured instead of treating resource families as biome-exclusive.
- Kept `Steel Ingot` as a processed trade material rather than inventing a Steel Ore. The expanded raw ore catalog is intended to support later refinement Recipes and alloy chains.
- Added the small leather refinement requested before the larger v0.0.19c trade expansion: `Leather Piece` (Common) and `Refined Leather` (Rare), complementing the existing `Leather Straps`.
- Preserved the v0.0.19a three-candidate icon UI for every material; all 165 built-ins have exactly three native Foundry Core `icons/...` candidates and one preselected default.
- Refined live-feedback icon defaults and candidate logic, including Neural Fragment, Primal Beast Essence, Arcane Gear, Arcane Conductor, Runic Core, Giant/Corrupted Marrow, Masterwork Component, Psychic/Radiant/Necrotic Essence, Arcane Crystal, Salt, Seasonings, and Charcoal.
- Added default-selection de-duplication by choosing equivalent second/third candidates when a strong image had already been used elsewhere. The shipped v0.0.19b defaults now use distinct icon paths across all 165 built-ins while still keeping three semantically valid choices per material.
- Added a safe v0.0.19a → v0.0.19b curated-icon migration. Untouched old curated defaults advance to the refined default, but any explicit GM icon override or unrelated direct Compendium image remains authoritative.
- Hardened inline icon selection failure handling: the row keeps/restores its last saved radio state without forcing a full catalog rerender.
- Bumped the built-in Material Catalog schema to version **6**.
- Cultivated/Domestic + broad Profession & Trade expansion remains v0.0.19c. Game Hunt remains v0.0.19d.

## 0.0.19a

Material Catalog visual-curation build on top of the mechanically stable v0.0.19 line. No Crafting Project, Harvest, Scanner, Essence, Item Piles, or normalization logic is changed.

- Added a curated Foundry Core icon shortlist for all **132 existing built-in materials**. Every curated material has exactly **three** candidate `icons/...` paths and one preselected default.
- Crafting Core references Foundry Core artwork by path only; no Core image file is copied or redistributed inside the module.
- Reworked the GM Materials table for visual curation: widened the application, removed the redundant **Nature** column from rows already grouped by source/category, tightened utility columns, and added three clickable icon previews per curated material.
- Icon choices use an exclusive radio-style selection because one material can have only one active presentation icon. Selecting a candidate saves immediately to the material override and updates the managed Compendium Item without rerendering the entire catalog.
- Added a safe visual migration for legacy managed materials that still use the generic brown Crafting Core pouch. On upgrade, those generic icons move to the curated default while any GM-assigned non-default image is preserved.
- Direct Compendium image edits are also respected. If a managed Item already uses a custom non-default image, the table keeps that image as one of the three visible choices rather than silently replacing it.
- Reset Curated Default now returns a built-in material to its v0.0.19a curated icon instead of the legacy generic pouch.
- This build deliberately does **not** add the Environment/Game Hunt/Cultivated catalog expansion yet. Those remain staged for v0.0.19b–v0.0.19d as previously scoped.

## 0.0.19

Crafting Projects & Rest Progress development release. The validated Harvest pipeline remains untouched.

- Added a persistent **Crafting Project** mode alongside legacy seconds-based Timed crafting. A Project tracks required/completed Work Periods and uses either Long-Rest or Short-Rest cadence.
- **Start Project is the first Work Attempt.** Starting during downtime can immediately produce the first point of progress; a one-period Project can therefore complete during its initial work.
- Completed compatible rests do not advance crafting automatically. They unlock exactly one new Work opportunity: Long-Rest Projects require a Long Rest, while Short-Rest Projects accept either a Short or Long Rest. The player can spend that opportunity later through **Work on Project**.
- Limited each Character to one active Project while still allowing every known Recipe to remain browsable for planning. A second Project cannot start until the current one completes or is cancelled.
- Ingredients are **reserved at Project start** and stored with the Project snapshot, so they cannot be reused by another craft. Cancelling returns all still-reserved materials. A Project also freezes its Recipe snapshot so later GM edits do not retroactively change work already underway.
- Added optional **Progress Checks** using native D&D5e Ability, Skill, Tool, or Saving Throw rolls. They can occur Every Work Period or only when crossing the Project midpoint.
- Progress Check failure has three exclusive outcomes: **No Progress**, **Regress Progress** by a GM-configured number of Work Periods, or **Fail Project**. Material loss exists only inside Fail Project and can optionally destroy a configured percentage of the reserved materials; otherwise the materials return.
- Extended the existing **Final Crafting Check** to Project crafting without replacing its v0.0.18 roll flow. A failed Final Check may stay ready for a later attempt, regress the Project by a configured number of Work Periods, or fail the Project with optional material loss. A retry that stays ready requires a new compatible rest and cannot be spammed.
- Relevant-proficiency **Automatic Success** continues to apply to the Final Crafting Check; Progress Checks remain their own Recipe-defined work tests.
- Rebuilt the Character Crafting tab as a two-column profession workspace: persistent Recipe list on the left and a larger selected-Recipe/Project detail panel on the right with thematic information blocks, progress state, reserved materials and contextual controls.
- Restored the live inventory **`N×` craftable count** beside known Recipes. It remains independently hideable through Player Visibility.
- Added Project visibility controls for current progress, cadence/time, Progress Check, Progress DC and Progress-failure consequences. Hidden mechanics remain enforced without exposing their details in Project chat messages.
- Fixed Knowledge Source republication so it is **idempotent**. Updating or renaming a published Recipe preserves the same managed Compendium document when possible, reconciles its contents, removes old Crafting Core learning Activities, and leaves exactly one canonical `Learn Recipe` Activity. Republishing also repairs previously duplicated Activities.
- Kept existing Timed Recipes backward compatible. Existing Player Visibility, Learning Access, native **Learn** button, full Skill/Tool labels, Recipe descriptions, scroll preservation, and v0.0.18a UI fixes remain in place.
- **Extra Effort is not included** in this release and remains reserved for v0.0.20. Harvest, Creature Scanner, Essence, Item Piles corpse loot, and gear normalization were not changed.

## 0.0.18a

Crafting Resolution polish release. No v0.0.19 Crafting Projects behavior is included.

- Added **Player Visibility** controls to the Recipe Builder so the GM decides whether players see output, ingredients, ingredient quantities, relevant proficiencies, attempt policy, Crafting Check, DC, failure consequence, exact failure percentage, seconds-based crafting time, and the optional Recipe description. Hidden mechanics remain enforced internally.
- Added an optional GM-authored **Additional Description** field. Published Knowledge Sources now build their Description automatically from the Recipe snapshot, including visible ingredients and other mechanics rather than requiring the GM to duplicate recipe data manually.
- Added **Learning Access** with **Follow Crafting Eligibility** and **Anyone Can Learn**. Follow Crafting Eligibility blocks a Character before the native activity is used when the Recipe requires proficiencies the Character does not satisfy, so a rejected Manual/Recipe is not consumed or destroyed.
- Scoped the native D&D5e Knowledge Source usage button from **Use Ability** to **Learn** for Crafting Core learning Activities only.
- Resolved Skill/Tool presentation through D&D5e display labels. Internal IDs such as `smith` remain stored for logic but player/GM UI now displays names such as **Smith's Tools**.
- Cleaned the Character Crafting tab: removed the redundant tiny output line under the Recipe name, removed craft-count prefixes from the Recipe selector, and made all detail rows obey Player Visibility.
- Crafting failure chat/notifications now honor hidden DC and material-loss settings, and hidden ingredient names are not exposed by missing-material transaction errors.
- Preserved the Recipe Builder content scroll position across Item drops and other local rerenders so adding Ingredients or Output no longer jumps the workbench to the top.
- Tightened Recipe sidebar row sizing/highlight layout so the active selection follows the actual Recipe row instead of a displaced button box.
- Existing v0.0.18 Recipes remain compatible. Older Recipes without visibility metadata default to their previous visible behavior, while proficiency-gated Recipes without explicit Learning Access default to following crafting eligibility.
- Harvest, Creature Scanner, Essence, Item Piles corpse loot, and normalization remain untouched from the validated v0.0.17 baseline. Rest-based Crafting Projects remain reserved for v0.0.19.

## 0.0.18

Recipe Crafting Resolution development release.

- Added optional per-Recipe **Relevant Proficiencies** using native D&D5e Skills and Tools. Recipes can configure one or two proficiencies and resolve them as **Any** or **All**.
- Added configurable attempt policy: **Anyone** may attempt or the crafter must satisfy the relevant proficiency rule.
- Added configurable proficient behavior: qualifying crafters may **Roll Normally** or receive **Automatic Success**. This supports recipes where an untrained character may risk an attempt while a trained crafter succeeds automatically.
- Added optional native D&D5e **Crafting Checks** selected from Ability Checks, Skills, Tool Checks, or Saving Throws, with a GM-configured DC from 1 to 40.
- Crafting Checks are rolled on the crafting user's client through the D&D5e 5.3.3 roll APIs. The active GM validates the flagged chat roll before committing inventory or result changes.
- Added configurable **material loss on failed Crafting Check**. The GM can disable loss entirely or choose 0–100% with a 5% slider. Loss is applied independently to each required ingredient using round-up quantities; any positive percentage can therefore consume a single rare ingredient.
- A failed Crafting Check never creates the output Item and never starts a crafting job. Only the configured failed-material share is consumed.
- Existing Recipes remain backward compatible: recipes without Crafting Resolution settings require no check and retain the v0.0.17 automatic-success behavior.
- Existing seconds-based Crafting Time remains unchanged in this release. Rest-based Crafting Projects are intentionally reserved for v0.0.19.
- No Harvest, Creature Scanner, Essence, Item Piles corpse-loot, or normalization pipeline behavior was changed.

## 0.0.17

Immersive corpse-loot normalization hotfix + optional Firearm homebrew.

- Kept v0.0.16 as the stable baseline and left its live-validated **Remove All Existing Items** and **Keep All Existing Items** paths unchanged.
- Fixed duplicate physical gear in **Keep Physical Gear / Remove Natural & Features**. Crafting Core no longer re-adds gear that Item Piles already transferred; it removes only disallowed live transferable entries and appends generated Harvest.
- Fixed duplicate equivalent gear in **Normalize from Compendiums** (for example Light Hammer, Hide Armor, Scimitar, Leather Armor, or Mace stacks). Normalize now snapshots the live transferable corpse inventory, removes those current Item Piles IDs while `deleteWhenEmpty` is temporarily disabled, and then inserts exactly one final normalized gear + Harvest payload.
- Normalization still resolves every source Item before corpse conversion and preserves the source stack quantity. Unique/stat-block gear that resolves to a different base item continues to be replaced normally (for example Holy Mace -> Mace).
- Added rollback protection for the two immersive mutation paths: if the post-cleanup add fails, Crafting Core attempts to restore the exact transferable corpse snapshot before invoking the existing Item Piles revert fallback.
- Added optional **Homebrew — Convert Firearms to Random Crossbows**, disabled by default and applied only in Normalize mode. A detected Firearm stack becomes one randomly chosen Hand Crossbow, Light Crossbow, or Heavy Crossbow stack, resolved through the configured normalization compendiums in priority order.
- Firearm detection prefers structured D&D5e weapon data (including the Firearm property) with conservative weapon-only identity fallbacks. If the first randomly selected crossbow is unavailable, the other two are tried before the firearm is discarded as unmatched.
- The Firearm homebrew preserves the original stack quantity and marks converted loot with Crafting Core normalization metadata.

## 0.0.16

Stable-baseline Token Harvest rebuild.

- Rebuilt Token Harvest from the user-validated v0.0.9 baseline instead of carrying forward the experimental v0.0.11-v0.0.15 corpse-pile pipeline.
- Restored the known-good explicit GM Token HUD flow from v0.0.10: scanned Harvest Profile -> shared generation rules -> Item Piles corpse conversion -> addItems().
- Token HUD now uses the compact Font Awesome shopping-bag glyph as the loot action. Harvest remains fully manual and supports multiple selected dead/elegible Tokens.
- Restored Manual Creature Harvest Essence Affinity controls with 45% Arcane / 55% selected specific Essences and the 50% Arcane fallback when no affinity is selected.
- Added four Existing NPC Loot modes: Normalize from Compendiums, Remove All Existing Items, Keep Physical Gear / Remove Natural & Features, and Keep All Existing Items.
- Added up to four ordered Item Compendium normalization sources. The UI presents Source first and Pack second for clearer selection.
- Normalization reads only Items that the active Item Piles D&D5e integration considers transferable, then resolves safe base matches by identifier/base item or exact normalized name + Item type. No fuzzy matching is used.
- Normalization, Remove All, and Keep Physical now use Item Piles' own addItems(..., { removeExistingActorItems: true }) transaction to replace old corpse loot and insert final gear + Crafting Core Harvest atomically. Crafting Core no longer calls removeItems() as a separate cleanup phase.
- Keep All leaves Item Piles' converted corpse inventory untouched and only appends Crafting Core Harvest.
- Corpse conversion temporarily disables deleteWhenEmpty and single-item image/name replacement, preserves the original Token appearance, and restores the Item Piles default deleteWhenEmpty behavior after a successful inventory transaction.
- Failed addItems transactions attempt to revert the Token from Item Piles and never mark the corpse as harvested.
- Added lightweight console timing for the Item Piles transaction to help identify live integration stalls without delaying gameplay.

## 0.0.9

Essence Harvest Layer development release.

- Expanded the built-in curated Material Catalog from 121 to 132 materials with 11 Uncommon Essence materials: Arcane, Acid, Cold, Flame, Force, Lightning, Necrotic, Poison, Psychic, Radiant, and Thunder Essence.
- Promoted the previous Undead-only `Necrotic Essence` record into the universal Essence family while preserving its stable material ID, and added a new `Necrotic Residue` Undead material so four-slot Undead profile completeness is preserved.
- Added a dedicated fifth Harvest Profile slot for Essence. The existing four automatic physical/thematic material slots remain unchanged, and Pinpoint Overrides remain separate extra rolls.
- Extended Actor Analyzer v2 with structured Essence-affinity inference from non-spell Attack/Save/Damage Activities plus native D&D5e damage resistance and immunity data.
- Physical damage types (bludgeoning, piercing, slashing) are excluded from Essence affinity. Prepared spells alone do not define harvest affinity.
- Actors with one or more supported affinities roll the fifth slot as 45% Arcane Essence / 55% specific Essence. When several specific affinities exist, the 55% side is weighted by supporting Actor evidence.
- Actors with no supported non-physical affinity roll the fifth slot as 50% Arcane Essence / 50% no Essence.
- Essence selection is rolled per harvested source at generation time rather than being permanently fixed during scanning, preserving the intended long-term material economy.
- Existing v0.0.8 Harvest Profiles remain valid and keep Essence disabled until they are rescanned or individually reanalyzed; no affinity is invented during migration.
- Added Essence visibility to the Creature Scanner and Harvest Profile Editor, including inferred damage affinities and the active Arcane/specific distribution.
- Bumped the built-in Material Catalog schema to version 4.

## 0.0.8

Actor Analyzer Intelligence & Scanner Settings development release.

- Rebuilt the Actor Analyzer around evidence strength rather than one flat text corpus. Identity/type data, structural features, attack/body signals, equipment, and incidental spell text now have distinct roles.
- Weak spell/item language such as `spirit`, `spectral`, `phantom`, or `incorporeal` no longer classifies a creature's morphology by itself.
- Strong incorporeal classification now requires explicit identity (Ghost/Specter/Wraith/Banshee/Phantom/etc.) or a structural feature such as `Incorporeal Movement`.
- Corporeal Undead fallback was strengthened so Lich, Mummy Lord, Death Knight, Undead Knight, Zombie, Ghoul, Vampire, Wight, Revenant, and similar sources can resolve physical remains instead of being reduced to spirit-only loot by incidental spell names.
- Skeleton/Demilich-style identities remain bone-focused; true incorporeal Undead continue to exclude physical anatomy.
- Generalized the same evidence hierarchy to all creature families. Constructs no longer invent metal/mechanical anatomy when their material is unknown; stone, crystal, flesh, and metal/mechanical forms require supporting evidence. Elemental and amorphous structural signals were tightened similarly.
- Added a deterministic second-pass family fallback for empty automatic slots: after preferred rarity/anatomy selection, an empty slot may use another unused coherent material from the same creature family at the same-or-lower tier. This improves four-slot completion without inventing anatomy or promoting ordinary sources into higher rarities.
- Added generic Undead fallback materials `Funerary Dust` (Common) and `Necrotic Essence` (Uncommon). This raises the built-in curated catalog from 119 to 121 materials and gives incorporeal Undead at least one additional coherent loot path without fake flesh/bone tags.
- Bumped the built-in Material Catalog schema to version 3 for the internal test line. No general migration layer is included yet.
- Added a dedicated GM-only `Game Settings → Crafting Core` submenu for Creature Scanner source configuration.
- Scanner sources are selected at the package/source level: selecting a module/system automatically includes only its compatible Actor Compendiums. World Actor Compendiums remain individually selectable.
- Added ordered source priority. The saved order is retained in Scanner metadata for future equivalent-creature resolution without introducing premature complex deduplication.
- Removed Compendium selection from the Creature Scanner itself. The Scanner now shows a compact configured-source summary and devotes the main window to profiles/results.
- Fixed Scanner search focus loss: typing no longer rerenders on every keystroke. Search applies on Enter, the magnifying-glass button, or blur; Clear is explicit.
- Expanded the Recipe Builder's dedicated Recipes column again (380px default) and increased the default GM window width so saved Recipes have substantially more readable space.
- Item Piles, Token HUD, corpse conversion, automatic death handling, Region/Vendor generation, and Knowledge Codex remain outside this release.

## 0.0.7

Creature Scanner & Actor Analyzer development release.

- Added a GM-only `Creature Scanner` for selecting and scanning D&D5e Actor Compendiums without modifying source Actors or source packs.
- Scanner uses Compendium indexes to pre-filter NPC candidates before loading full Actor documents in small batches for detailed analysis.
- Added deterministic Actor anatomy inference from native D&D5e creature type, subtype/name, movement, embedded Item names, Activities, and attack/damage signals.
- Added generic fantasy anatomy tags including flesh, blood, bone, hide, claw, fang, beak, feather, scale, horn, venom, wing, shell, eye, tentacle, incorporeal, amorphous, plant, mechanical, metal, mineral, and crystal.
- Added conservative Undead handling so skeletal, fleshy, and incorporeal sources do not receive incompatible anatomy requirements.
- Added conservative Construct handling for flesh, stone/mineral, crystal, metal/mechanical, and generic constructs.
- Added persistent per-Actor Harvest Profiles stored as Crafting Core world metadata keyed to the source Actor UUID.
- Added deterministic four-slot automatic profiles: Common; Common/Uncommon; Rare; and a high tier that resolves to Very Rare by default or Legendary for sources signaled by CR 17+, Legendary Actions/Resistance, or Lair data.
- Automatic material selection only uses curated materials whose anatomy requirements are satisfied by the analyzed Actor. Empty slots are allowed when no compatible material exists.
- Added Harvest Profile Editor with GM control over each automatic material, per-profile chance, quantity formula, and editable anatomy tags.
- Added `Pinpoint Overrides` for boss/quest materials. Overrides are extra rolls, default to 100%, do not consume one of the four automatic slots, and survive Actor reanalysis.
- Added profile search/filter, individual reanalysis, and profile deletion. Reanalysis rebuilds automatic analysis/slots from the current source Actor while preserving Pinpoint Overrides.
- Added a shared `generateHarvestProfile()` rules path to `MaterialGenerationService` so the next Token HUD / Item Piles patch can use these stored profiles without creating a second loot engine.
- Expanded the Recipe Builder sidebar to a wider dedicated Recipes area and compacted GM tool launchers into a 2x2 block so saved Recipes receive substantially more usable space.
- Item Piles, Token HUD, corpse conversion, automatic death handling, Region/Vendor generation, and Knowledge Codex remain outside this release.
- No general-purpose migration work is included during the current internal test phase.

## 0.0.6

Rarity & Harvest Profile Foundation development release.

- Expanded Crafting Core material rarity to the complete D&D5e ladder used by the project: Common, Uncommon, Rare, Very Rare, and Legendary.
- Added `Uncommon` and `Very Rare` to the Material Catalog editor, rarity filter, economy defaults, Compendium Item rarity metadata, and generator preview.
- Added a purple Very Rare presentation tier and distinct Common/Uncommon/Rare/Legendary rarity colors.
- Revised all 119 built-in curated materials without changing the catalog size, distributing Creature Harvest, Gathering, and Profession / Trade records across the five rarity tiers.
- Updated default material economy/drop chances to Common 65%, Uncommon 35%, Rare 15%, Very Rare 5%, Legendary 1%; default GP values are 5 / 25 / 100 / 500 / 1,000 respectively and remain GM-editable.
- Preserved the established maximum of four automatic Creature Harvest candidate materials per source.
- Replaced the old `2 Common + 1 Rare + 1 Legendary` layout with four slot pools: `Common`, `Common or Uncommon`, `Rare`, and `Very Rare or Legendary`.
- Slot selection remains unique per source and each selected material still performs its own configured chance and quantity roll.
- Kept manual Undead anatomy profiles and Environment Gathering behavior intact.
- Bumped the built-in Material Catalog schema to version 2 so stale curated Compendium records synchronize before being used as generated loot sources.
- No general-purpose release migration layer is included during this internal development phase.

## 0.0.5

Generator UX Refinement development release.

- Changed manual material generation to a preview-first workflow: `Generate Materials` now rolls/populates the result in memory and writes nothing to the Item Directory.
- Added explicit `Create Loot Folder`, which materializes the exact current preview without rerolling.
- `Generate Again` replaces the preview and remains non-destructive until the GM accepts a result.
- Added a direct `Generate` launcher beside the main `Crafting Core` Item Directory launcher so the GM can reach the session-facing tool in one click.
- Exposed `openGenerator()` on the module API for integrations/console use.
- Compactified the Generate Materials window for notebook-sized displays: reduced header/config spacing, reduced default window size, and reserved the available height for results.
- Made the generated-items list independently scrollable while keeping result actions visible.
- Refined the Recipe Builder draft sidebar to consume the remaining sidebar height and show scrolling only when saved drafts actually overflow.
- Kept all v0.0.4 generation rules unchanged: Creature Harvest profiles, 2 Common + 1 Rare + 1 Legendary candidate slots, chance/quantity behavior, Environment Biome/Resource/Abundance logic, and Material Catalog metadata remain the same.

## 0.0.4

Material Generation Foundation development release.

- Added one GM-only `Generate Materials` tool with dynamic Source / Origin modes.
- Added manual `Creature Harvest` generation by Creature Type, optional coarse Profile, and number of independent Sources / Bodies.
- Creature Harvest selects up to 2 Common, 1 Rare and 1 Legendary material slots per source, then applies each material's configured drop chance and quantity formula.
- Added initial Undead manual profiles: General, Fleshy, Skeletal and Incorporeal.
- Added `Environment Gathering` generation by Biome, Resource category and Abundance.
- Biome and Resource choices are derived from Material Catalog metadata, not hard-coded encounter tables.
- Added Scarce / Normal / Rich / Abundant yield controls without changing material rarity.
- Materials do not need to be used by an existing Recipe to participate in generation.
- Added silent chance/quantity rolls and aggregation of duplicate material results.
- Added `Crafting Core — Generated Loot` world Item folder output with one timestamped subfolder per successful manual generation.
- Generated Items are cloned from the private Materials Compendium and preserve native D&D5e Trade Good data and Crafting Core metadata.
- Empty rolls create no empty folder.
- Added one-time Compendium library presentation migration: root `Crafting Core` folder defaults to `#8de901`, and Crafting Core-created folder structures default to Manual sorting while preserving later GM changes.
- Exposed the reusable material-generation service through the module API for future Token HUD / Item Piles output integration.

## 0.0.3

- Hotfix: GM launcher no longer depends on `game.craftingCore` being initialized; API exposure now happens before optional init steps and init failures are isolated for diagnostics.

Library & Publication Foundation development release.

- Added private GM-only `Crafting Core — Learn Sources` world Compendium.
- Added top-level `Crafting Core` Compendium Directory folder.
- Reinforced managed Compendium ownership so PLAYER, TRUSTED and ASSISTANT roles have no access.
- Changed Recipe Builder lifecycle to Draft → Publish to Compendium → optional draft deletion.
- Published Recipe/Formula/Blueprint/Manual Items now contain complete frozen Recipe snapshots.
- Learned Recipes are persisted as complete Character Actor knowledge, independent from Builder drafts and physical Knowledge Sources.
- Republishing a retained draft refreshes the learned snapshot for Characters who already know that recipe.
- Added migration of legacy v0.0.1/v0.0.2 Actor knowledge and existing Knowledge Items where the old Recipe is still available.
- Knowledge Source rarity now always inherits the crafted output Item rarity.
- Knowledge Source GP price now follows D&D5e 5.3.3 magic crafting costs: 50 / 200 / 2,000 / 20,000 / 100,000 gp through Legendary.
- Organized the Materials Compendium into Creature Harvest, Gathering, and Profession / Trade folder trees.
- Explicitly labeled the 119 default records as the Crafting Core Built-in Curated Catalog rather than imported book content.
- Added Material Catalog search and filters for family, nature, and rarity.
- Added individual material editor for icon, family, nature, category, rarity, chance, quantity, value, tags, anatomy requirements, and biomes.
- Added persistent built-in material overrides and reset-to-curated-default support.
- Preserved custom registered materials and their folder organization.

## 0.0.2

Material Foundation development release.

- Added `Crafting Core — Materials` world Compendium creation and synchronization.
- Added built-in Creature Harvest, Gathering, and Profession / Trade material catalog.
- Added native D&D5e Loot → Trade Good material creation.
- Added stable material IDs and future Harvest/Gathering metadata flags.
- Added configurable Common / Rare / Legendary default GP value and drop chance.
- Added custom Item registration into the Materials Compendium.
- Added agreed default Core Data icons for Recipe, Formula, Manual, and Blueprint knowledge Items.
- Changed icon File Picker starting location to Core Data `icons/`.
- Added craft-count prefixes to the Character Sheet recipe dropdown.
- Added frozen result snapshots to recipes so complete Item definitions are reproduced reliably.
- Fixed Recipe Builder sidebar selection/scroll alignment.

## 0.0.1

Initial development release.

- Added GM Recipe Builder.
- Added Item drag-and-drop for 1..N consumed requirements and one crafted result.
- Added per-recipe real-time crafting duration.
- Added Recipe/Blueprint/Formula knowledge Item generation.
- Added `Learn Recipe` Utility Activity integration with D&D5e 5.3.3.
- Added Actor-bound known recipe persistence.
- Added integrated Crafting tab to the official D&D5e Character Sheet.
- Added GM-authoritative crafting requests, material validation, material consumption, persistent crafting jobs, and result delivery.
- Adopted the established Character Builder / Item Creator visual family.
