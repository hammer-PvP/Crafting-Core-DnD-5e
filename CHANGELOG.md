# Changelog

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
