# Crafting Core (DnD 5e)

Crafting Core is a GM-authoritative crafting, harvesting, and material framework for Foundry Virtual Tabletop, built specifically for D&D5e 5.3.3 on Foundry VTT 14.

v0.1.0 remains the consolidated stable foundation. v0.2.4 is the current Curated Culinary test candidate, continuing the clean v0.2.3 rebuild while fixing Curated Learn Source persistence/folder organization and the Curated Products catalog rendering issue without changing the validated Crafting, Project, Harvest, or Knowledge engines.


## v0.2.4 Curated Culinary persistence & catalog fix

- **Builder Draft deletion never suppresses a published Curated Recipe.** Published Learn Sources remain authoritative and independent from private Builder drafts.
- Curated Recipe suppression is now recorded only after the Knowledge lifecycle confirms an actual Unpublish/direct Learn Sources deletion; republishing clears stale suppression.
- The first v0.2.4 migration restores the official 15-Recipe set once to repair test worlds affected by the v0.2.0-v0.2.3 persistence regression.
- Learn Sources are organized within the supported three-level hierarchy `Crafting Core Curated → Culinary → <Culture> Cuisine`.
- The **Curated Products (15)** catalog now renders its Dwarven/Elven/Common rows and three icon choices instead of being hidden by the Materials-only search filter.


- Adds the private **Crafting Core — Products** Compendium with 15 official Culinary consumables: 5 Dwarven, 5 Elven, and 5 Common dishes.
- Adds 15 official **Recipe** Learn Sources under `Crafting Core Curated -> Culinary -> <Culture> Cuisine`.
- Curated Culinary Products require active **DnD 5e Item Creator 0.7.1+**. Core Crafting Core functionality remains independent.
- Hearty meals grant **5 Temporary Hit Points** through a native D&D5e Heal Activity using `temphp`.
- Energizing meals grant **+5 ft Walking Speed** through the Item Creator consumable runtime until the next Long Rest.
- Complete meals combine both benefits. Movement benefits use a shared replacement key and do not stack with one another.
- All 15 official Culinary Recipes use **10 seconds** crafting time.
- Prepared Product price is **2x the current ingredient value**, keeping crafting economically preferable to buying the finished dish.
- The Materials application now includes **Materials (229)** and **Curated Products (15)** tabs. Each Product offers three Foundry Core icon choices.
- **Restore Curated Culinary Defaults** repairs missing/legacy official Products and Learn Sources. Product effects are updated with the same safe embedded-Effect strategy used by Item Creator, avoiding the invalid legacy `duration.value = null` parent-update path.
- Official content tracks a baseline for presentation/Recipe fields so later module upgrades can advance unchanged defaults while preserving GM customizations.

## Highlights

- **GM-authored Recipes** using any D&D5e Item as an ingredient or output.
- **Private Drafts** for safe editing without changing the live published Recipe.
- **Knowledge Base** backed by the private **Crafting Core - Learn Sources** Compendium.
- **Stable Recipe identity** so published updates remain the same Recipe even when the source Item is updated.
- **Edit / Continue Editing** from the Knowledge Base, including recreation of a deleted Builder draft from the published source.
- **Publish / Update Published Source** as a deliberate action separate from Save Draft.
- **Learn Recipe** through a distributed Recipe, Formula, Blueprint, or Manual Item.
- **Direct Compendium -> Actor** and **Compendium -> Item Directory -> Actor** learning workflows.
- **Unlearn Recipe** with a lightweight confirmation and verified Actor cleanup.
- **Unpublish** with a stronger typed safeguard because it removes the authoritative source and makes Characters forget the Recipe.
- **Timed crafting** for simple second-based jobs.
- **Crafting Projects** with reserved materials, Work Periods, Short/Long Rest cadence, Progress Checks, configurable regression/failure, Extra Effort, and Final Crafting Checks.
- **Frozen Project snapshots** so an active Project is not rewritten by later Recipe edits or unpublication.
- **Player Visibility** controls for ingredients, DCs, progress, consequences, descriptions, and more.
- **229 curated built-in materials** stored as native D&D5e Loot -> Trade Good Items.
- **Creature Scanner** and editable Harvest Profiles with rarity pools, Essence generation, and GM Pinpoint Overrides.
- **Generate Materials** for Manual Creature Harvest, Environment Gathering, and Game Hunt.
- **Preview-first generation** with World Item output and optional Hidden Item Piles.
- **Stable material stacking** for supported Crafting Core material flows.

## Compatibility

- **Foundry VTT:** minimum 14, verified 14.365
- **D&D5e:** 5.3.3
- **Item Piles:** optional

Crafting Core is intentionally version-bound to the D&D5e system version it was built and tested against.

## Quick Start

### 1. Open Crafting Core

As GM, open the Item Directory and click **Crafting Core**.

The main application provides:

- Drafts / Recipe Builder
- Knowledge Base
- Materials
- Generate
- Creature Scanner
- Learn Sources

### 2. Build a Recipe Draft

Create a draft, then configure the craft:

1. choose **Timed / Seconds** or **Crafting Project**;
2. configure proficiency and crafting access;
3. configure checks, failure rules, Work Periods, Extra Effort, and Final Check as needed;
4. choose Player Visibility;
5. drag in ingredient Items and quantities;
6. drag in the output Item and quantity;
7. click **Save Draft**.

### 3. Publish the Knowledge Source

Once a draft exists, use **Publish to Private Compendium** in the Builder footer.

The published source is stored in **Crafting Core - Learn Sources** and appears in the **Knowledge Base**. That Compendium Item is the authoritative published definition.

Later edits remain private until **Update Published Source** is used.

### 4. Teach the Recipe

Distribute the published Knowledge Source to a Character through:

- direct Compendium drag-and-drop;
- the World Item Directory;
- Actor inventory;
- loot or a chest;
- a vendor or Supplier workflow.

Use the Item's **Learn Recipe** Activity. A Character cannot learn the same stable Recipe twice.

### 5. Craft from the Character Sheet

Known Recipes appear in the Character Sheet **Crafting** tab.

Timed crafts use synchronized server time. Project crafts persist on the Actor, reserve their materials, and advance through explicit Work Attempts. A compatible rest unlocks a new normal Work opportunity; it never adds progress by itself.

## Drafts, Knowledge Base, and Published Sources

Crafting Core deliberately separates authoring from publication.

- **Drafts** are the GM workbench.
- **Knowledge Base** is a management view of the actual Learn Sources Compendium.
- **Save Draft** never changes what players currently know.
- **Publish / Update Published Source** writes the draft to the authoritative Compendium source.
- Deleting a Builder draft does **not** unpublish the Recipe.
- A published source can be opened with **Edit as Draft / Continue Editing**. If its old Builder draft no longer exists, Crafting Core rebuilds a draft from the published definition.
- **Unpublish** removes the authoritative source and removes that Recipe from Characters who know it.
- Republishing later does **not** automatically reteach the Recipe to Characters who previously forgot it.

Internal indexes and Actor copies are derived data. If they ever disagree with the Learn Sources Compendium, the Compendium is authoritative and reconciliation repairs the derived state.

## Crafting Projects

Project Recipes can configure:

- Required Work Periods
- Long Rest or Short Rest cadence
- optional Progress Checks
- Every Work Period or Midpoint timing
- Ability / Skill / Tool / Saving Throw checks
- No Progress, Regress, or Fail Project consequences
- optional material loss when a Project fails
- optional Extra Effort
- optional Final Crafting Check
- Stay Ready, Regress Project, or Fail Project on final failure

A Project stores a frozen Recipe snapshot when it starts. Later edits, publication updates, Unlearn, or Unpublish do not rewrite an active Project.

## Materials

Crafting Core manages the private **Crafting Core - Materials** world Compendium.

The curated catalog contains **229 built-in materials** across:

- Creature Harvest
- Essences
- Gathering
- Profession & Trade

Any D&D5e Item can still be used directly in a Recipe without belonging to the curated catalog.

## Creature Harvest and Generate Materials

The Creature Scanner reads configured Actor sources and stores editable Harvest Profiles without modifying the source Actors.

Profiles can contain:

- inferred anatomy;
- Common, Uncommon, Rare, and Very Rare / Legendary rarity pools;
- pool drop chances;
- multiple candidate materials per pool;
- a separate Essence pool;
- GM-authored Pinpoint Overrides.

The Generate tool supports:

- **Manual Creature Harvest**
- **Environment Gathering**
- **Game Hunt**

Generation is preview-first. Accepted previews can become World Items or optional Hidden Item Piles.

## Game Settings

The Crafting Core Game Settings area includes:

- **Support the Creator** with a Buy Me a Coffee button;
- **Configure Crafting Core** for Creature Scanner and Token Harvest settings;
- **More from Hammer-PvP**, highlighting other modules that complement the same Foundry workflow.

## Documentation

The complete manual is maintained in the repository under `docs/`:

**[Open the Complete Crafting Core Manual (PDF)](docs/Crafting-Core-Complete-Manual-v0.1.0.pdf)**

## More from Hammer-PvP

Crafting Core is part of a growing set of Foundry VTT tools designed to complement one another. Depending on your table, these modules can add character creation, custom item authoring, economy management, and audio tools around the same game workflow.

- [DnD 5e Character Builder](https://github.com/hammer-PvP/DnD-5e-Character-Builder)
- [DnD 5e Item Creator](https://github.com/hammer-PvP/DnD-5e-Item-Creator)
- [DnD 5e Currency Manager](https://github.com/hammer-PvP/DnD-5e-Currency-Manager)
- [Enhanced Audio Player](https://github.com/hammer-PvP/Enhanced-Audio-Player)

## Support the Creator

Thank you for using Crafting Core. If the module helps your table and you would like to support continued development, you can do so through Buy Me a Coffee:

https://buymeacoffee.com/hammer.pvp

## Bugs and Feature Requests

GitHub Issues:

https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues

When reporting a bug, please include the Crafting Core, Foundry, and D&D5e versions, reproduction steps, relevant console errors, and a screenshot when useful.

## AI-Assisted Development

Crafting Core is an original project designed and directed by its creator. AI tools were used to assist with code, documentation, review, and debugging. The module's concepts, mechanics, design decisions, testing, and final implementation choices remain under the creator's responsibility.

## License

See `LICENSE`.
