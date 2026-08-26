# Changelog

## 0.0.3

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
