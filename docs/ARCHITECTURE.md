# Crafting Core (DnD 5e) — Architecture

## Supported baseline

- Foundry VTT 14.365
- D&D5e 5.3.3
- Official D&D5e CharacterActorSheet

Crafting Core is intentionally D&D5e-specific. System-agnostic adapters are not part of the project scope.

## Core document model

### Recipes
Recipes are world-level Crafting Core records. A recipe references real D&D5e Items; it does not create special ingredient/result Item types.

A Recipe stores:
- recipe id
- name and image
- 1..N required Item references with quantities
- one result Item reference with output quantity
- real-time crafting duration in seconds
- Recipe/Blueprint/Formula knowledge Item presentation data

Any D&D5e Item can be used as a requirement or as a result. For example, a Longsword and a Quarterstaff can be consumed to create an improvised Halberd.

### Character knowledge
Known recipes belong to the Character Actor, never the Foundry User. The Actor flag is the source of truth.

This intentionally gives character death/replacement mechanical weight: a new Actor does not inherit the old Actor's learned recipes.

Multiple Characters may learn the same world Recipe if multiple copies of its knowledge Item are obtained and used.

### Recipe / Blueprint Items
Knowledge Items are native D&D5e Consumables with a Utility Activity named `Learn Recipe`.

Using the Activity:
1. validates that the linked Recipe still exists;
2. blocks duplicate learning;
3. performs native Item use consumption;
4. adds the Recipe id to the Character Actor's known-recipe flag;
5. suppresses unnecessary Utility chat output.

The presentation label can be Recipe, Blueprint, Formula, Manual, or another future label. The underlying mechanic is the same.

### Crafting jobs
Crafting time uses synchronized server time rather than world time. Materials are committed at job start. The final Item is created at completion.

The player-facing Character Sheet shows only a silent progress bar while a job is active.

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

Crafted results receive a Crafting Core source UUID flag so they can later be used as ingredients in another Recipe without losing their source identity.

## Player interface

Players do not receive a standalone Crafting Core application.

The module adds a `Crafting` tab to the official D&D5e Character Sheet, immediately after the native `Effects` tab and before `Biography`.

The tab is populated from that Actor's learned Recipes and current inventory.

## GM interface

Only GMs receive the standalone Crafting Core management application. The initial entry point is the World Items Directory.

v0.0.1 provides Recipe management. Future GM tools build on this same application family.

## Crafting materials

Crafting Core may create its own material Items to populate the game world, but these are still normal D&D5e Items and are not required by the Recipe engine.

Generated crafting materials use:
- Item type: `loot`
- Trade Good subtype: `system.type.value = "trade"`
- default icon: `icons/containers/bags/coinpouch-simple-leather-silver-brown.webp`
- individually replaceable icons through the native File Picker

## Planned harvesting architecture

### Creature harvest scanner
The future scanner will inspect Actor compendiums and create a Harvest Profile linked to each source Actor without modifying the Actor or its compendium.

The scanner will infer useful anatomy/capabilities from structured Actor data where practical, including creature type, subtype, movement, attacks/features, damage traits, and other signals.

Every automatically generated creature profile has a maximum of four base material slots:
- Common
- Common
- Rare
- Legendary

The source creature's power/CR influences harvest chance and quantity rather than changing a material's intrinsic rarity.

GM pinpoint overrides can add specific materials to a particular Actor source with custom chance, including 100% quest materials. Pinpoint overrides do not consume one of the four base slots.

### Ingredient catalog
The module will ship with a fantasy material catalog organized primarily by the standard D&D5e creature types:
- Aberration
- Beast
- Celestial
- Construct
- Dragon
- Elemental
- Fey
- Fiend
- Giant
- Humanoid
- Monstrosity
- Ooze
- Plant
- Undead

Anatomy/capability requirements prevent nonsensical base matches (for example, Skeleton should not automatically yield Undead Flesh).

### Environment gathering
Environment gathering does not require an Actor. The GM selects a biome from a dropdown and presses Generate as many times as desired.

Biome pools are intended for flora, fungi, minerals, resins, salts, crystals, and other environmental crafting materials.

### Harvest output
Without Item Piles:
- generated material Items are placed in a dated/source-named Folder in the World Items Directory.

With Item Piles:
- an eligible dead Token receives a GM-only Token HUD action;
- one click rolls the Actor's Harvest Profile;
- the dead Token is converted to/used as an Item Pile;
- generated materials are inserted directly into the corpse for player looting.

Crafting Core decides the loot. Item Piles is only an optional physical-loot delivery integration.
