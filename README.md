# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.6 — Rarity & Harvest Profile Foundation

This development release completes the material rarity model before the future Creature Scanner / Actor Analyzer starts generating per-Actor Harvest Profiles.

### Full five-tier material rarity

Crafting Core materials now use the complete project rarity ladder:

- **Common** — 65% default drop chance, 5 gp default value
- **Uncommon** — 35%, 25 gp
- **Rare** — 15%, 100 gp
- **Very Rare** — 5%, 500 gp
- **Legendary** — 1%, 1,000 gp

These are Material Catalog defaults, not hard rules. The GM can edit rarity, chance, value, and quantity per material. Very Rare is presented in purple throughout the Crafting Core UI.

The built-in curated catalog still contains exactly **119 materials**. Existing Creature Harvest, Gathering, and Profession / Trade records were redistributed across the five tiers rather than adding artificial duplicate materials merely to fill rarity bands.

### Four-slot Harvest Profile model

Creature Harvest keeps the established maximum of **four automatic material candidates per source**. The default slot pools are now:

1. `Common`
2. `Common or Uncommon`
3. `Rare`
4. `Very Rare or Legendary`

A material can occupy only one slot in a source roll. After slot selection, its own configured drop chance and quantity formula are rolled exactly as before. This structure is intentionally scanner-ready: a future per-Actor Harvest Profile can choose whether its high-tier slot resolves to Very Rare or Legendary without increasing the four-material limit.

### Generator workflow unchanged

The live-validated v0.0.5 workflow remains intact: **Generate Materials** creates only an in-memory Preview; **Generate Again** replaces it; **Create Loot Folder** materializes exactly the accepted preview without rerolling. Creature Harvest and Environment Gathering continue to share the same generation engine.

## Existing generation foundation

- **Creature Harvest** — Creature Type, coarse manual Profile, and independent Sources/Bodies. Each source uses four candidate slot pools — Common, Common/Uncommon, Rare, and Very Rare/Legendary — and then applies each Material Catalog chance/quantity.
- **Environment Gathering** — Biome, Resource and Abundance. Biome/Resource pools are derived from Material Catalog metadata. Nature/Survival checks remain GM adjudication outside the module.
- Materials remain eligible even when no current Recipe consumes them.
- The same `MaterialGenerationService` is intended to power the future Token HUD / Item Piles corpse destination.

## Private libraries

Crafting Core maintains GM-only `Crafting Core — Materials` and `Crafting Core — Learn Sources` world Compendiums. The Materials catalog is explicitly a built-in curated fantasy material library plus GM custom entries. Published Knowledge Sources and learned Actor recipe snapshots remain self-contained.

The top-level Crafting Core Compendium folder defaults to `#8de901` and Crafting Core-created structures use Manual sorting by default while preserving later GM changes.

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

## Item Piles

Crafting Core works without Item Piles. Item Piles remains the planned/recommended integration for the complete corpse-harvesting experience. Crafting Core will roll the same material result already used by the manual generator; Item Piles will only provide the individual corpse/container destination.
