# Crafting Core (DnD 5e) — Architecture

## Supported baseline

- Foundry VTT 14.365
- D&D5e 5.3.3
- Official D&D5e CharacterActorSheet

Crafting Core is intentionally D&D5e-specific. System-agnostic adapters are not part of the project scope.

## Responsibility boundary

Crafting Core owns how an Item is learned, sourced and fabricated. It does not own the runtime behavior of an output Item.

- **Item Creator / native D&D5e Item**: defines what the final Item does when used, including Activities, Effects, durations and other mechanics.
- **Crafting Core**: defines which Items are consumed, how long crafting takes, what Item is reproduced, and which Character Actors know the recipe.

The recipe result stores a frozen snapshot of the complete Item document. This preserves Activities, Effects and third-party flags without Crafting Core needing to understand their mechanics.

## Core document model

### Recipes

Recipes are world-level Crafting Core records stored in a hidden world setting. A recipe references real D&D5e Items; it does not create special ingredient/result Item types.

A Recipe stores:
- recipe id;
- name and image;
- 1..N required Item references with quantities;
- one result Item reference, frozen source snapshot and output quantity;
- real-time crafting duration in seconds;
- Recipe/Blueprint/Formula/Manual knowledge Item presentation data.

Any D&D5e Item can be used as a requirement or result. Materials from the managed catalog are optional conveniences for generation systems, not a restriction on Recipe inputs.

### Character knowledge

Known recipes belong to the Character Actor, never the Foundry User. The Actor flag is the source of truth.

This intentionally gives character death/replacement mechanical weight: a new Actor does not inherit the old Actor's learned recipes. Multiple Characters may learn the same world Recipe if multiple copies of its knowledge Item are obtained and used.

### Knowledge Items

Knowledge Items are native D&D5e Consumables with a Utility Activity named `Learn Recipe`.

Default presentation:
- Recipe: `icons/sundries/documents/document-gold.webp`
- Formula: `icons/sundries/scrolls/scroll-bound-leather-tan.webp`
- Manual: `icons/sundries/books/book-tooled-silver-blue.webp`
- Blueprint: `icons/commodities/tech/blueprint.webp`

Using the Activity validates the Recipe, blocks duplicate learning, lets D&D5e consume the one-use Consumable, records the Recipe id on the Character Actor, and suppresses unnecessary Utility chat output.

### Crafting jobs

Crafting time uses synchronized server time rather than world time. Materials are committed at job start. The final Item is created at completion.

The active GM is the transaction authority. Player requests are revalidated by the GM before materials are consumed.

## Item identity

Requirements and results reference source Items using a stable-source strategy:
1. Crafting Core source UUID flag;
2. D&D5e sourceId;
3. compendiumSource;
4. Core sourceId;
5. duplicateSource;
6. current Item UUID.

Matching falls back to D&D5e Item identifier + Item type and finally exact name + Item type for custom world Items without provenance metadata.

Crafted results receive a Crafting Core source UUID flag so they can later be used as requirements in another Recipe without losing source identity.

## Player interface

Players do not receive a standalone Crafting Core application.

The module adds a `Crafting` tab to the official D&D5e Character Sheet immediately after `Effects` and before `Biography`.

The dropdown is populated from that Actor's learned recipes and shows the number of crafts currently possible (`N×`) based on live inventory quantities. Recipes with zero available crafts remain selectable so the player can inspect missing requirements.

## GM interface

Only GMs receive standalone Crafting Core management applications.

- Recipe Builder: world Recipe authoring and Knowledge Item generation.
- Material Catalog: managed material Compendium, rarity defaults and custom material registration.

## Material Catalog

### Material Compendium

The module creates a world Item Compendium named `Crafting Core — Materials` on demand.

Catalog material Items are native D&D5e Items:
- Item type: `loot`;
- Trade Good subtype: `system.type.value = "trade"`;
- default icon: `icons/containers/bags/coinpouch-simple-leather-silver-brown.webp`;
- individually replaceable icon through Foundry's native File Picker.

The Compendium is world-owned rather than a static module pack so the GM can customize it safely. Synchronization identifies records using stable Crafting Core `materialId` flags, creates missing built-in materials and refreshes generation metadata without overwriting GM presentation edits such as name, image, description or weight. Removed/deprecated catalog entries are not automatically deleted.

### Material families

The v0.0.2 catalog establishes three broad families:

1. **Creature Harvest** — materials associated with the standard D&D5e creature types.
2. **Gathering Materials** — flora, fungi, minerals, resins, salts, crystals and other future biome-driven materials.
3. **Profession / Trade** — food staples, processed materials, smithing supplies, leather, cloth, reagents and similar trade goods.

Any normal D&D5e Item can still be dragged directly into a Recipe without registration. Registering an Item as a Crafting Core material only makes a Trade Good copy in the managed Compendium and attaches metadata intended for future automated generation systems.

### Rarity metadata

The current automatic material tiers are:
- Common;
- Rare;
- Legendary.

Rarity, price and drop chance are separate concepts. The Material Catalog exposes world defaults for GP value and generation chance, while future Harvest Profiles can override chance per material or per specific Actor.

## Planned harvesting architecture

### Creature harvest scanner

The scanner will inspect Actor compendiums and create a Harvest Profile linked to each source Actor without modifying the Actor or its compendium.

The scanner will infer useful anatomy/capabilities from structured Actor data where practical, including creature type, subtype, movement, attacks/features, damage traits, and other signals.

Every automatically generated creature profile has a maximum of four base material slots:
- Common;
- Common;
- Rare;
- Legendary.

Anatomy/capability requirements prevent nonsensical base matches (for example, Skeleton should not automatically yield Undead Flesh). GM pinpoint overrides can add specific materials to a particular Actor source with custom chance, including 100% quest materials, without consuming one of the four base slots.

### Environment gathering

Environment gathering does not require an Actor. The GM selects a biome from a dropdown and presses Generate as many times as desired. Biome pools use the same Material Catalog.

### Harvest output and Item Piles

Crafting Core decides the loot. Item Piles is only an optional physical-loot delivery integration.

Without Item Piles, generated material Items will be placed in a dated/source-named Folder in the World Items Directory.

With Item Piles, an eligible dead Token will receive a GM-only Token HUD action. One click will roll the Actor's Harvest Profile silently, convert/use the corpse as an Item Pile, and inject the generated Trade Goods directly into the corpse.

Crafting Core works standalone, but the planned complete corpse-looting experience is designed to be better with Item Piles installed.
