# Crafting Core (DnD 5e) — Architecture

## Supported baseline

- Foundry VTT 14.365
- D&D5e 5.3.3
- Official D&D5e CharacterActorSheet

Crafting Core is intentionally D&D5e-specific.

## Responsibility boundary

Crafting Core owns sourcing, recipe knowledge, material consumption and fabrication. It does not own the runtime mechanics of the crafted output.

- **Item Creator / native D&D5e Item** defines what the final Item does when used, including Activities, Effects, duration, attacks, damage, spell access, resistances and similar mechanics.
- **Crafting Core** defines which Items are consumed, crafting time, the complete Item definition reproduced, and which Character knows how to produce it.

The crafted result is a frozen snapshot of the complete D&D5e Item. Third-party flags and Item Creator data are preserved without Crafting Core needing to interpret them.

## Three-stage Recipe lifecycle

### 1. Recipe Builder Draft

The Recipe Builder is a GM-only workbench. Drafts are temporary authoring records and contain:

- stable recipe ID;
- name/image;
- 1..N Item requirements and quantities;
- one complete result Item snapshot and output quantity;
- real-time crafting duration in seconds;
- Knowledge Source presentation type: Recipe / Formula / Blueprint / Manual.

Any D&D5e Item can be an input or output. There is no exclusive Ingredient Item or Product Item type.

### 2. Published Knowledge Source

A finished draft is published into the private **Crafting Core — Learn Sources** Compendium. The published Consumable contains the full recipe snapshot, not only a pointer to the Builder draft.

Therefore a published source remains valid if the Builder draft is deleted.

Knowledge Source rarity is always inherited from the crafted output. Price uses the D&D5e 5.3.3 2024 magic crafting cost progression:

- Common 50 gp
- Uncommon 200 gp
- Rare 2,000 gp
- Very Rare 20,000 gp
- Legendary 100,000 gp

Default source icons:

- Recipe: `icons/sundries/documents/document-gold.webp`
- Formula: `icons/sundries/scrolls/scroll-bound-leather-tan.webp`
- Manual: `icons/sundries/books/book-tooled-silver-blue.webp`
- Blueprint: `icons/commodities/tech/blueprint.webp`

The published Item uses a native D&D5e one-use Consumable / Trinket with a Utility Activity named `Learn Recipe`.

### 3. Character Learned Knowledge

When `Learn Recipe` completes, the entire normalized recipe snapshot is persisted on that Character Actor. The Actor no longer depends on:

- the Recipe Builder draft;
- the published Compendium source;
- the consumed physical Knowledge Item.

Knowledge intentionally belongs to the Actor rather than the Foundry User. A replacement Character does not inherit a dead Character's recipes. Multiple Characters can learn the same source if multiple copies are acquired. If the GM keeps a published draft and republishes a revision, learned snapshots with the same stable recipe ID are refreshed on Characters who already know it.

v0.0.3 migrates legacy recipe-ID-only knowledge from v0.0.1/v0.0.2 into this self-contained Actor format whenever the referenced legacy draft still exists.

## Player interface

Players do not receive a standalone Crafting Core administration application.

The module adds a `Crafting` tab to the official D&D5e Character Sheet after `Effects`. It reads the recipe snapshots stored on that Actor, checks live Item quantities and shows `N×` crafts possible in the Recipe dropdown.

Recipes with zero possible crafts remain selectable so the player can inspect missing materials.

## Crafting transaction

The active GM is authoritative.

1. Player requests a craft from the Character Sheet.
2. Active GM validates ownership, learned recipe and current inventory.
3. Requirements are consumed at job start.
4. Crafting progress is based on synchronized server time.
5. At completion, the frozen output snapshot is embedded into the Character inventory.

This means closing/reopening the sheet does not reset crafting time.

## Private Compendium libraries

Crafting Core creates a top-level **Crafting Core** folder in the Compendium Directory.

Managed packs:

- **Crafting Core — Materials**
- **Crafting Core — Learn Sources**

They are configured for GM-only access. PLAYER, TRUSTED and ASSISTANT roles receive NONE; GAMEMASTER receives OWNER. These libraries are not normal player-facing browsing sources.

A player learns about a material or Knowledge Source only when the GM deliberately exposes an Item through gameplay: Actor inventory, loot, chest, vendor, Supplier, or another permitted workflow.

## Material Catalog

### Curated defaults

The 119 shipped default materials are the **Crafting Core Built-in Curated Catalog**. They are not extracted from installed PHB, DMG, Monster Manual, Tasha or SRD packs.

The catalog is a crafting vocabulary used by future generation systems.

### Native Item representation

Materialized materials are native D&D5e Items:

- `type = "loot"`
- `system.type.value = "trade"`
- default icon `icons/containers/bags/coinpouch-simple-leather-silver-brown.webp`

Any D&D5e Item can still be used directly in a Recipe without registration. Registering an Item as a material simply makes it available to future automated Harvest/Gathering/region/vendor systems.

### Pack organization

**Creature Harvest**
- subfolder for each D&D5e creature type.

**Gathering**
- Flora
- Roots
- Fungi
- Wood & Resin
- Mineral

**Profession & Trade**
- Food & Cooking
- Metalworking
- Leatherworking
- Alchemy
- General Materials

### Material metadata

Catalog records can carry:

- stable material ID;
- family;
- nature;
- category;
- rarity;
- default drop chance;
- quantity formula;
- default value;
- tags;
- anatomy requirements;
- biome eligibility.

Built-in materials can be individually overridden from the GM Material Catalog. Overrides persist across sync and can be reset to curated defaults. Custom registered materials are edited directly in the private world pack.

## Future Harvest architecture

Harvest is intentionally not part of v0.0.3.

Planned order:

1. Manual Harvest Generator by Nature/Profile/count with silent independent rolls and aggregated Folder output.
2. Actor Compendium Scanner / anatomy analysis producing up to 2 Common + 1 Rare + 1 Legendary base slots per creature profile.
3. GM pinpoint overrides for quest-specific materials/chances.
4. Token HUD action for eligible dead Tokens.
5. Optional Item Piles integration: Crafting Core rolls the materials, Item Piles only converts/uses the corpse as the physical loot container and receives the result.
6. Environment Gathering by Biome + Resource Category + abundance.
7. Region/vendor generation using the same catalog.

Crafting Core works without Item Piles, but Item Piles is planned as the recommended integration for the complete corpse-looting experience.
