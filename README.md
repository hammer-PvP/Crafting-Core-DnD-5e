# Crafting Core (DnD 5e)

Crafting Core is a GM-authoritative crafting, harvesting, and material framework for Foundry Virtual Tabletop using D&D5e 5.3.3.

It supports simple timed crafts, persistent multi-rest Crafting Projects, native D&D5e crafting checks, Extra Effort, player-specific Recipe knowledge, a curated material catalog, Creature Harvest profiles, environmental resource generation, Game Hunt, and optional Item Piles integration.

## Highlights

- **GM-authored Recipes** with any D&D5e Item as ingredient or output.
- **Timed crafting** for simple second-based jobs.
- **Crafting Projects** with reserved materials, Work Periods, Short/Long Rest cadence, Progress Checks, configurable regression/failure, and Final Crafting Checks.
- **Extra Effort** as one optional second work attempt per Work Period, with its own Ability/Skill/Tool/Save check and optional progress-loss penalty.
- **Player Visibility** controls for ingredients, DCs, progress, consequences, descriptions, and more.
- **Knowledge Sources** published as Recipe, Formula, Blueprint, or Manual Items with a Learn Recipe Activity.
- **Learning eligibility** that can allow anyone or follow the Recipe's crafting eligibility.
- **229 curated built-in materials** stored as native D&D5e Loot -> Trade Good Items.
- **Three selectable Foundry Core icon candidates** for each curated material, with no Foundry artwork bundled by Crafting Core.
- **Stable material stacking** for supported incoming Crafting Core material flows while keeping the Ingredient Resolver tolerant of duplicate embedded stacks.
- **Creature Scanner** that analyzes configured Actor Compendiums without modifying source Actors.
- **Harvest Profiles** with rarity pools, separate Essence generation, and GM-authored Pinpoint Overrides.
- **Token Harvest** with configurable handling of existing NPC gear.
- **Generate Materials** for Manual Creature Harvest, Environment Gathering, and Game Hunt.
- **Preview-first generation** with World loot-folder output and optional Hidden Item Piles.
- **Drag generated loot directly to a Scene** to create a Hidden Item Pile at the drop location.
- **Centered Crafting Core result dialogs** for important Work, Extra Effort, Final Check, completion, and learning outcomes.

## Compatibility

- Foundry VTT: minimum 14, verified 14.365
- D&D5e: 5.3.3
- Item Piles: optional

Crafting Core is intentionally version-bound to the D&D5e system it was built and tested against.

## Quick Start

### 1. Open Crafting Core

As GM, use the **Crafting Core** button added to the Item Directory.

The main sidebar provides access to:
- Recipe Builder
- Materials
- Generate Materials
- Creature Scanner
- Learn Sources

### 2. Create a Recipe

Create a Recipe Draft, then:
1. choose **Timed / Seconds** or **Crafting Project**;
2. configure proficiency/access rules;
3. configure Project Work Periods, Progress Checks, Extra Effort, and Final Check if applicable;
4. choose what the player can see;
5. drag in ingredient Items and quantities;
6. drag in the crafted output Item and quantity;
7. publish a Knowledge Source.

### 3. Teach the Recipe

Give the published Knowledge Source Item to a Character and use its **Learn Recipe** Activity.

Knowledge can be configured as:
- **Anyone Can Learn**; or
- **Follow Crafting Eligibility**.

Rejected learning attempts do not consume the Knowledge Source.

### 4. Craft from the Character Sheet

Known Recipes appear in the Character Sheet **Crafting** tab.

Timed crafts use synchronized server time. Project crafts persist on the Actor, reserve their materials, and advance only through available Work Attempts.

A rest unlocks the next compatible Work opportunity; it does **not** add progress automatically.

## Crafting Projects

Project Recipes can configure:
- Required Work Periods
- Long Rest or Short Rest cadence
- optional Progress Checks
- Every Work Period or Midpoint timing
- Ability / Skill / Tool / Saving Throw checks
- No Progress, Regress, or Fail Project consequences
- optional material loss only when the Project itself fails
- optional Extra Effort
- optional Final Crafting Check
- Stay Ready, Regress Project, or Fail Project on final failure

### Extra Effort

When enabled, one Extra Effort opportunity can become available after the normal Work Attempt for a Work Period.

The GM configures:
- the Extra Effort check;
- DC;
- progress gained on success;
- optional **Lose Progress on Failure**.

A failed Extra Effort always spends that Extra Effort opportunity and grants no extra progress. With the optional penalty disabled, it does not regress the Project. Extra Effort never consumes the reserved ingredients again.

## Materials

Crafting Core manages the private **Crafting Core - Materials** world Compendium.

The v0.1.0 curated catalog contains 229 built-in materials across:
- Creature Harvest
- Essences
- Gathering
- Profession & Trade

Gathering includes Flora, Roots, Fungi, Wood & Resin, Wild Foraging, Minerals & Geological resources, and Game Hunt. Profession & Trade includes Cultivated & Domestic goods, Food & Cooking, Metalworking, Leatherworking, Alchemy, Gemcutting & Crystals, and General Materials.

Any D&D5e Item can still be used directly in a Recipe without being part of the curated catalog.

## Creature Harvest

The Creature Scanner reads configured Actor sources and stores editable Crafting Core Harvest Profiles.

Profiles contain:
- inferred anatomy;
- rarity pools;
- pool drop chances;
- multiple candidate materials per pool;
- a separate Essence pool;
- optional Pinpoint Overrides.

A successful rarity pool produces exactly one selected candidate from that pool. More candidates increase variety, not automatic drop count.

Source Actors and Compendiums remain read-only.

## Generate Materials

The GM-facing generator supports:
- **Manual Creature Harvest**
- **Environment Gathering**
- **Game Hunt**

Generation is preview-first. The accepted preview can then be sent to:
- a generated World Item folder;
- a Hidden Item Pile at Scene center;
- a Hidden Item Pile created by dragging the preview to an exact Scene location.

Item Piles is a destination integration; Crafting Core remains responsible for generation rules and quantities.

## Existing NPC Loot

Crafting Core Settings provides Token Harvest handling modes:
- Normalize from Compendiums
- Remove All Existing Items
- Keep Physical Gear / Remove Natural & Features
- Keep All Existing Items

Normalize mode uses configured Item Compendium priority and intentionally avoids fuzzy matching unique monster gear.

An optional homebrew setting can convert detected Firearms to a random Hand, Light, or Heavy Crossbow resolved from the normalization sources.

## Material Stacking

Embedded Actor Item UUIDs are not used as material identity. Crafting Core materials use stable material metadata.

Supported incoming Crafting Core material flows can consolidate equivalent materials into an existing stack when the container context matches.

No legacy-stack migration is performed. Existing duplicate stacks remain valid, and the Ingredient Resolver can aggregate them when evaluating or consuming Recipe requirements.

## Documentation

The complete v0.1.0 manual covers every current screen and workflow in detail:
- Recipe Builder
- Knowledge Sources
- Player Visibility
- Character Crafting
- Timed crafts
- Crafting Projects
- Progress Checks
- Extra Effort
- Final Checks
- Materials
- Creature Scanner
- Harvest Profiles
- Token Harvest
- Generate Materials
- Environment Gathering
- Game Hunt
- Item Piles
- Settings and troubleshooting

## Support the Creator

Thank you for using Crafting Core! If you enjoy the module and would like to support its continued development, you can do so through **Buy Me a Coffee**. Your support helps me dedicate more time to creating, testing, and improving tools for Foundry VTT.

https://buymeacoffee.com/hammer.pvp

## Bugs and Feature Requests

Found a bug or have an idea for an improvement? Please use GitHub Issues:

https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues

When reporting a bug, please include the Crafting Core, Foundry, and D&D5e versions, reproduction steps, relevant console errors, and a screenshot when useful.

## Repository

https://github.com/hammer-PvP/Crafting-Core-DnD-5e

## License

See `LICENSE`.
