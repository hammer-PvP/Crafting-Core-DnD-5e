# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.4 — Material Generation Foundation

This release adds the first gameplay-facing material generation engine while keeping the v0.0.3 private library/publication model intact.

### Unified manual generator

The GM can open **Generate Materials** from Crafting Core and choose one Source / Origin:

- **Creature Harvest** — choose Creature Type, coarse manual Profile, and number of Sources / Bodies. Each source is rolled independently, then duplicate materials are aggregated. The engine uses up to 2 Common, 1 Rare and 1 Legendary material slots per source and applies the Material Catalog's configured chance and quantity. Initial Undead profiles distinguish General, Fleshy, Skeletal and Incorporeal sources.
- **Environment Gathering** — choose Biome, Resource category and Abundance. The available Resource list is derived from the materials actually configured for that Biome. Scarce / Normal / Rich / Abundant change yield size without changing material rarity. Any Nature/Survival check is resolved by the GM outside the module.

Materials remain eligible even if no current Recipe consumes them. The catalog represents resources that exist in the world, not only ingredients already required by known recipes.

### Manual output

Successful generations create one timestamped subfolder under **Crafting Core — Generated Loot** in the world Item Directory. Generated entries are copies of the real Trade Good Items from **Crafting Core — Materials**, with aggregate rolled quantities. If all chance rolls fail, no empty folder is created.

The generator is intentionally the same engine future Token HUD / Item Piles support will call. Item Piles will change only the output destination from a world Folder to an individual corpse/pile; it will not decide the loot.

### Library presentation

The top-level **Crafting Core** Compendium folder now defaults to color `#8de901`. Crafting Core-created folder structures default to **Manual** sorting. A one-time migration applies those defaults to pre-v0.0.4 Crafting Core folders, then later GM presentation changes are preserved.

### Existing v0.0.3 foundation retained

- GM-only private `Crafting Core — Materials` and `Crafting Core — Learn Sources` packs.
- Built-in Curated Material Catalog plus custom registered materials.
- Recipe Builder as temporary Draft → Publish workbench.
- Self-contained published Knowledge Sources and Character-bound learned recipe snapshots.
- Knowledge Source rarity inherited from the crafted output and automatic rarity pricing.
- Integrated Character Sheet Crafting tab and complete Item snapshot reproduction.

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

## Item Piles

Crafting Core works without Item Piles. Item Piles is planned as the recommended integration for the complete corpse-harvesting experience: Crafting Core will decide and roll eligible materials, while Item Piles will only convert/use the corpse as the physical loot container and receive the generated Items.

Manual Creature Harvest and Environment Gathering are implemented in v0.0.4. Token HUD / Item Piles corpse harvesting remains a future integration.
