# Changelog

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
