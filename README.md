# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.7 — Creature Scanner & Actor Analyzer

This development release connects the live-validated curated Material Catalog to the GM's actual creature Compendiums. It does not hard-code loot by monster name and it does not modify source content. Instead, Crafting Core reads native D&D5e Actor data, infers generic fantasy anatomy, and builds editable per-Actor Harvest Profiles.

### Creature Scanner

Open **Crafting Core → Creature Scanner**, choose one or more Actor Compendiums, and scan. The scanner first reads Compendium indexes to discard non-NPC documents, then loads eligible Actors in small batches for the detailed pass. Source Actors and Compendiums remain read-only.

The scanner stores Crafting Core metadata for each source Actor UUID. Profiles can be searched, filtered by creature type, edited, reanalyzed individually, or deleted without touching the source Actor.

### Actor Analyzer

The Analyzer combines D&D5e creature type with generic signals from subtype/name, movement, Items, Activities, attacks, and damage data. It can infer tags such as `bone`, `flesh`, `claw`, `feather`, `scale`, `venom`, `incorporeal`, `amorphous`, `plant`, `mechanical`, and related anatomy.

Important special cases are deliberately conservative. A Skeleton can resolve to bone-compatible materials without Undead Flesh; Ghost-like Undead resolve to incorporeal anatomy; Constructs distinguish flesh, stone/mineral, crystal, metal/mechanical, and generic cases when the Actor data supports it.

### Per-Actor Harvest Profiles

The Analyzer proposes no more than four automatic materials:

1. **Common**
2. **Common / Uncommon**
3. **Rare**
4. **Very Rare** by default, or **Legendary** when high-tier source data is present (CR 17+, Legendary Actions/Resistance, or Lair data)

A material is eligible only when its curated anatomy requirements are satisfied. Missing compatible materials leave a slot empty rather than inventing an anatomically wrong result. The GM can replace any slot material and edit its chance or quantity formula. Anatomy tags themselves are also editable.

### Pinpoint Overrides

Harvest Profiles now support extra **Pinpoint Overrides** for boss or quest materials. A Pinpoint material does not consume one of the four automatic slots, defaults to a 100% roll, can use any registered Crafting Core material, and is preserved when the source Actor is reanalyzed.

The shared material engine already exposes profile-based generation internally. The next Token HUD / Item Piles layer can therefore resolve an Actor's stored profile and send the same result to a corpse without creating a second loot algorithm.

### Recipe Builder space

The Recipe Builder sidebar now reserves a wider dedicated area for saved Recipes. GM tool launchers are compacted into a 2×2 block, freeing additional vertical space for the Recipe list.

### Deliberately not included yet

- Item Piles integration
- Token HUD Harvest action
- corpse conversion or auto-harvest on death
- Region/Vendor generation
- Knowledge Codex
- general-purpose release migrations during the current internal testing phase

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
