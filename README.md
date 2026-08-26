# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.5 — Generator UX Refinement

This release keeps the validated v0.0.4 material-generation rules intact and improves the GM workflow used during live sessions.

### Preview first, materialize second

`Generate Materials` no longer writes to the Item Directory when the GM rolls. Creature Harvest or Environment Gathering first produces an in-memory **Preview**. The GM may reroll as often as desired. Only **Create Loot Folder** materializes that exact preview as real D&D5e Items under `Crafting Core — Generated Loot`; accepting a preview does not reroll it.

This preserves GM control during play and also matches the planned future corpse workflow: the shared generation engine decides the result first, then a destination adapter chooses where the accepted Items go.

### One-click session launcher

The Item Directory GM launcher is split into two controls:

- **Crafting Core** — opens the complete GM authoring/library workbench.
- **Generate** — opens Generate Materials directly for session use.

Players do not receive these administrative launchers.

### Compact generator

The Material Generator now uses a smaller default window and a denser layout. The green d20, title, and context occupy a compact header; Source and generation parameters use a smaller configuration block; the remaining height is reserved for Preview results. When many materials are generated, only the result list scrolls so the generation/materialization controls remain reachable on smaller displays.

### Recipe Builder sidebar polish

The saved Recipe list now consumes the remaining sidebar height and only scrolls when the number of drafts actually exceeds that space, removing the unnecessary scrollbar/clipping seen with a single Recipe.

## Existing generation foundation

- **Creature Harvest** — Creature Type, coarse manual Profile, and independent Sources/Bodies. Each source uses up to 2 Common, 1 Rare and 1 Legendary candidate slots and then applies each Material Catalog chance/quantity.
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
