# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.2 — Material Foundation

- Keeps the live-validated v0.0.1 crafting cycle intact.
- Adds a managed world Compendium: **Crafting Core — Materials**.
- Adds a built-in material catalog covering Creature Harvest, environmental Gathering, and Profession / Trade materials.
- Materialized catalog entries are native D&D5e `loot` Items with `system.type.value = "trade"`.
- Materials use the Core Data bag icon `icons/containers/bags/coinpouch-simple-leather-silver-brown.webp` by default.
- Synchronization preserves GM presentation edits such as item names, icons, descriptions, and weight.
- GMs can register any existing D&D5e Item into the Materials Compendium; the registered copy becomes a Trade Good and receives Crafting Core generation metadata.
- Common / Rare / Legendary default value and generation chance are configurable in the Material Catalog UI.
- Recipe, Formula, Manual, and Blueprint knowledge Items now use the agreed Core Data default icons.
- Icon browsing opens from Foundry Core Data `icons/`.
- The Character Crafting recipe dropdown now shows how many times the Actor can currently craft each known recipe.
- Recipe output stores a frozen Item snapshot so complex Items (including Item Creator outputs) can be reproduced even if the original source is later unavailable.
- Recipe Builder sidebar selection/scroll alignment received a visual polish pass.

## Knowledge Item default icons

- Recipe: `icons/sundries/documents/document-gold.webp`
- Formula: `icons/sundries/scrolls/scroll-bound-leather-tan.webp`
- Manual: `icons/sundries/books/book-tooled-silver-blue.webp`
- Blueprint: `icons/commodities/tech/blueprint.webp`

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

## Item Piles

Crafting Core works without Item Piles. The planned full harvesting experience is designed to be better with Item Piles installed: Crafting Core will decide and roll eligible materials, while Item Piles will only provide the physical corpse/container looting experience. v0.0.2 lays the material-data foundation for that integration; automatic corpse harvesting is not enabled yet.
