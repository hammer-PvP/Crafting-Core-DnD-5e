# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.3 — Library & Publication Foundation

This release keeps the live-validated crafting cycle intact and turns the GM authoring data into safe, organized world libraries.

### Recipe lifecycle

The Recipe Builder is now a temporary GM workbench:

1. Create and adjust a Recipe draft.
2. Test the crafting result.
3. Publish the finished Recipe/Formula/Blueprint/Manual to the private **Crafting Core — Learn Sources** Compendium.
4. The published Knowledge Source contains a complete frozen recipe definition.
5. The Builder draft may then be deleted without breaking the published source or Characters who learned it. If a retained published draft is revised and republished, Characters who already know that recipe receive the revised snapshot automatically.

When a Character uses `Learn Recipe`, the complete learned definition is persisted on that Character Actor. Learned knowledge no longer depends on the Recipe Builder or on the physical Knowledge Source continuing to exist.

v0.0.1/v0.0.2 Character knowledge is migrated to the self-contained format by the active GM when possible.

### Private GM libraries

Crafting Core creates a top-level **Crafting Core** folder in the Compendium Directory and keeps its managed packs GM-only:

- **Crafting Core — Materials**
- **Crafting Core — Learn Sources**

PLAYER, TRUSTED and ASSISTANT roles receive no Compendium ownership. The libraries are not intended to expose future materials, recipes or crafting possibilities to players. Players only see Items the GM deliberately distributes through an Actor, loot, chest, vendor, Supplier, or another gameplay flow.

### Materials library

The 119 default materials are explicitly labeled as the **Built-in Curated Catalog**. They are authored by Crafting Core; they are not imported from the GM's PHB, DMG, Monster Manual, Tasha, or SRD Compendiums.

The Materials pack is automatically organized into folders:

- Creature Harvest → creature type
- Gathering → Flora / Roots / Fungi / Wood & Resin / Mineral
- Profession & Trade → Food & Cooking / Metalworking / Leatherworking / Alchemy / General Materials

The Material Catalog now provides search, family/nature/rarity filters, and individual material editing. Built-in overrides persist across synchronization and can be reset to curated defaults. Custom D&D5e Items can still be registered into the library as Loot → Trade Goods.

### Knowledge Source rarity and price

Recipe, Formula, Blueprint and Manual rarity always inherits the crafted output Item's rarity. Crafting Core does not provide a separate rarity override for the source.

Knowledge Source price follows the D&D5e 5.3.3 2024 magic crafting cost progression:

- Common: 50 gp
- Uncommon: 200 gp
- Rare: 2,000 gp
- Very Rare: 20,000 gp
- Legendary: 100,000 gp

This lets Supplier or other Compendium-driven vendor tools treat crafting knowledge as normal rarity-priced merchandise without Crafting Core-specific vendor logic.

### Knowledge Item default icons

- Recipe: `icons/sundries/documents/document-gold.webp`
- Formula: `icons/sundries/scrolls/scroll-bound-leather-tan.webp`
- Manual: `icons/sundries/books/book-tooled-silver-blue.webp`
- Blueprint: `icons/commodities/tech/blueprint.webp`

Icon browsing begins at Foundry Core Data `icons/`.

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

## Item Piles

Crafting Core works without Item Piles. Item Piles is planned as the recommended integration for the complete corpse-harvesting experience: Crafting Core will decide and roll eligible materials, while Item Piles will only convert/use the corpse as the physical loot container and receive the generated Items.

Harvest generation is not implemented in v0.0.3; this release makes the material and knowledge libraries stable enough for that next phase.
