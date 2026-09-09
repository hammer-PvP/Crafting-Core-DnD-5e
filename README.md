# Crafting Core (DnD 5e)

## v0.5.3 Live-Test Repair - Native D&D5e Activity Mapping

- Fixes the remaining SRD clone failure revealed by live testing: D&D5e 5.3.3 stores `system.activities` in an `ActivitiesField`/mapping of pseudo-documents, so replacing the whole object can persist an empty Activity collection even when the SRD source snapshot is correct.
- Curated Alchemy Products, Potion variants, and every Inscription now restore Activities through the same per-Activity dotted update path used by native `Item5e#createActivity`, preserving SRD Activity IDs and types.
- Applies the same repair path to Alchemy & Inscription Recipe Learn Sources so their `Learn Recipe` Activity is also verified after persistence.
- Curated Alchemy schema v4 forces one automatic repair of v0.5.0-v0.5.2 installations. A successful repair should leave the catalog at **140 / 140 Curated Products**.
- Makes **Reset to Curated Defaults** for Materials idempotent: it now queues only curated-owned fields that actually differ, preserves World-derived Creature Sources, and should report `0 restored` when immediately repeated with no further changes.
- Content counts are unchanged: 234 core Materials + 23 optional Materials, 58 Culinary Products + 82 Alchemy/Inscription Products, and 97 optional Recipes.


Crafting Core is a GM-authoritative crafting, harvesting, and material framework for Foundry Virtual Tabletop, built specifically for D&D 5e.

The module connects four parts of the game loop:

1. **Materials and Products** - ingredients, harvested resources, trade goods, and curated finished items.
2. **Recipes and Knowledge** - GM-authored crafting definitions published as learnable Items.
3. **Player Crafting** - timed crafts and persistent Crafting Projects directly from the Character sheet.
4. **Harvesting and Generation** - creature profiles, environment gathering, game hunting, and optional Item Piles output.

Crafting Core uses native D&D 5e Items throughout. Any Item can be an ingredient or an output, so the system can support ordinary materials, equipment, consumables, custom Item Creator content, or another crafted Product as part of a later Recipe.

## Compatibility

- **Crafting Core:** v0.5.3
- **Foundry VTT:** minimum 14, verified 14.365
- **D&D 5e:** 5.3.3
- **Item Piles:** optional integration for Item Pile generation and Token Harvest
- **DnD 5e Item Creator:** optional for the core module; **0.7.1+ is required for the official persistent Curated Food and Alcohol Products**

Crafting Core is intentionally version-bound to the D&D 5e system version it was built and tested against.

## Core Workflow

### 1. Prepare Materials and Products

The private **Crafting Core - Materials** Compendium contains the built-in material catalog used by harvesting, gathering, generation, and Recipe building.

The core catalog contains **234 curated materials**. Installing the optional **Curated Alchemy & Inscription** library adds **23 more Materials** for a total of **257 active Materials** in that World. The catalog covers:

- Creature Harvest materials;
- magical Essences;
- Flora, Roots, Fungi, Wood & Resin, and Minerals & Geological resources;
- Food & Cooking, Metalworking, Leatherworking, Alchemy, and General Materials.

The Materials interface also exposes the official **Curated Products** library when DnD 5e Item Creator 0.7.1+ is active.

### 2. Create a Recipe Draft

Open **Crafting Core** from the Item Directory as GM and create a new Recipe Draft.

A Recipe can define:

- Timed crafting or a persistent Crafting Project;
- who may attempt the craft and which proficiencies are relevant;
- progress checks, failure behavior, Extra Effort, and Final Crafting Checks;
- Player Visibility rules;
- any D&D 5e Items as ingredients;
- a complete Item snapshot as the crafted output;
- a Knowledge Source type: Recipe, Formula, Blueprint, or Manual.

**Save Draft** only saves the private GM workbench state. It never changes the published Recipe used by players.

The unified **Proficiency, Access & Final Check** block defines the eligible Skill/Tool proficiencies and uses those same proficiencies for the optional Final Crafting Check. **Proficiency 1** is the primary/default option and **Proficiency 2** is an alternate eligible option. With `Anyone` + `Automatic final success`, a crafter who qualifies through the configured proficiency rule skips the final check; a non-qualified crafter may still attempt it normally. When a roll is required and two proficiencies are eligible, the crafter chooses which one to use before starting, with Proficiency 1 pre-selected. Crafting Projects freeze that choice in the Project snapshot.

### 3. Publish the Knowledge Source

Use **Publish to Private Compendium** or **Update Published Source** from the Recipe Builder footer.

Published Knowledge Sources live in the private **Crafting Core - Learn Sources** Compendium. The Compendium Item is the authoritative published definition.

The **Knowledge Base** is a management view of those real Compendium Items. It can:

- open a published source;
- create or continue a Builder Draft from the published definition;
- show whether a Draft has unpublished changes;
- Unpublish a Recipe with a strong confirmation safeguard.

Deleting a Builder Draft does **not** delete or Unpublish the corresponding Knowledge Source.

### 4. Teach the Recipe

Distribute a published Knowledge Source through any normal Foundry workflow:

- Compendium -> Actor;
- Compendium -> Item Directory -> Actor;
- loot or chests;
- NPC inventories;
- vendors and Supplier-style stock workflows.

The Item's **Learn Recipe** Activity teaches the stable Recipe identity to the Character. A Character cannot learn the same Recipe twice from different physical copies.

Characters may **Unlearn** a Recipe from the Crafting tab. Unpublish is different: it removes the authoritative source globally and reconciles Character knowledge.

### 5. Craft from the Character Sheet

Known Recipes appear in the Character sheet **Crafting** tab.

Crafting Core supports two workflows:

#### Timed Crafting

- validates Recipe access and inventory;
- consumes the required ingredients;
- uses synchronized server time for the configured duration;
- creates the frozen output Item when the craft completes.

#### Crafting Projects

Projects are persistent and designed for work across rests.

A Project can use:

- Required Work Periods;
- Short Rest or Long Rest cadence;
- Progress Checks every Work Period or at the midpoint;
- Ability, Skill, Tool, or Saving Throw checks;
- No Progress, Regress, or Fail Project consequences;
- optional material loss on Project failure;
- **Extra Effort** as an optional second attempt in a work cycle;
- an optional **Final Crafting Check** with configurable failure behavior.

Starting a Project reserves its materials and immediately performs the first normal Work Attempt. A compatible rest unlocks the next normal Work Attempt; a rest does not add progress by itself.

An active Project stores a frozen Recipe snapshot. Later Recipe edits, Unlearn, or Unpublish do not rewrite work already in progress.


## Recipe Transfer Between Worlds

Crafting Core includes a GM-only **Recipe Transfer** workflow under **Game Settings -> Crafting Core -> Configure Crafting Core**. Administrative transfer controls stay out of the normal crafting UI.

- **Export Recipes** lists Builder drafts with checkbox selection and click-to-inspect rows.
- A Recipe bundle contains the Recipe definition plus a complete snapshot of its Result Item, including Activities, Effects, flags, and output quantity when present.
- Ingredient references are exported semantically. Canonical Crafting Core Materials are resolved by stable Material identity in the destination World rather than by the source World's UUID. Generic D&D Base Items retain a `Base Item` match (for example, `Maul` may be satisfied by a valid Maul derivative), while custom/specific Items retain an `Exact Item` identity so a Recipe requiring that specific Item cannot be satisfied by an unrelated Item from the same base family.
- **Import Recipes** validates the JSON content/schema, previews dependencies and conflicts, and imports selected entries as private Builder drafts. Import never publishes Knowledge Sources automatically.
- Imported Result Items are materialized in **Crafting Core - Products -> Custom Items**. Official Curated Products are never overwrite targets for imported custom content.
- Existing Recipe/Result conflicts are reviewed explicitly: update, use existing, import a new copy/new Recipe ID, or skip.
- Missing custom ingredient dependencies are reported before import and block that individual entry until the dependency exists in the destination World.
- Icon portability uses a safe fallback chain: original resolvable icon -> compatible bundled asset when appropriate -> Base Item icon -> generic Item-type icon. Image binaries are not embedded into Recipe JSON files.
- Export uses a native **Save As** dialog where the browser supports it. The suggested filename is only a convenience; import validation never depends on the filename.

## Knowledge Lifecycle

Crafting Core deliberately separates authoring, publication, Character knowledge, and active work.

- **Builder Draft:** private GM editing state.
- **Save Draft:** saves only that private state.
- **Learn Sources Compendium:** authoritative published Knowledge Sources.
- **Knowledge Base:** management UI for the actual Learn Sources Compendium.
- **Learn Recipe:** adds a stable Recipe to one Character.
- **Unlearn:** removes the Recipe from that Character only.
- **Unpublish:** removes the global published authority and makes Characters forget it.
- **Project Snapshot:** frozen definition used by an already-started Project.

If a player is viewing an older Recipe revision when the GM publishes an update, Crafting Core refreshes the view before allowing a new Craft or Project transaction. No materials, reservations, rolls, or progress are changed by that refresh.

## Materials and Material Economy

Built-in Materials are native D&D 5e `loot` Items with Trade Good type and stable Crafting Core metadata.

Default rarity economy:

| Rarity | Default Value | Default Drop Chance |
| --- | ---: | ---: |
| Common | 5 gp | 65% |
| Uncommon | 25 gp | 35% |
| Rare | 100 gp | 15% |
| Very Rare | 500 gp | 5% |
| Legendary | 1,000 gp | 1% |

The GM can override built-in material presentation and values. Curated defaults can be restored without affecting unrelated custom Items.

Any D&D 5e Item can still be used directly in a Recipe even if it is not registered in the Materials catalog.

## Curated Products and Batch Crafting

With **DnD 5e Item Creator 0.7.1+** active, Crafting Core maintains an official vendor-ready library of **58 Curated Products** and **58 matching Recipe Knowledge Sources**. Products remain ordinary D&D 5e consumable Items in **Crafting Core - Products**, while their learnable Recipes live in **Crafting Core - Learn Sources**.

The library is divided into three families.

### Meals - 15 Products

- 5 Dwarven, 5 Elven, and 5 Common dishes;
- each Recipe produces **1 to 4 servings** depending on the dish;
- each Product Item represents one serving and is priced/sold individually;
- **Hearty:** 5 Temporary Hit Points;
- **Energizing:** +5 ft Walking Speed;
- **Complete:** +5 Maximum Hit Points and +5 ft Walking Speed;
- persistent Food benefits last **up to 6 hours or until the next Short Rest, whichever happens first**; a Long Rest also removes them;
- one Curated Food replaces another Curated Food rather than stacking with it.

### Alcoholic Drinks - 28 Products

The initial alcohol library contains Mundane, Dwarven, Elven, and Cane Spirit traditions. Recipes are produced in economic batches: **100 servings for Cheap**, **20 for Proper**, and **10 for Reserve** drinks.

Alcohol follows a deliberately risky tradeoff model:

- Cheap alcohol applies a single **-1 Ability Score** penalty;
- Proper/Reserve alcohol normally applies **+2 to one Ability Score and -4 to another**;
- alcohol never grants a positive Constitution bonus;
- positive INT/WIS options are reserved for mild, contemplative drinks;
- Ability Scores cannot be raised above 20 or reduced below 1 by Curated Alcohol;
- one Curated Alcohol replaces another Curated Alcohol rather than stacking with it;
- Alcohol and Food are separate families, so **one Food benefit and one Alcohol effect may coexist**;
- alcohol lasts **up to 6 hours or until the next Short Rest, whichever happens first**; a Long Rest also removes it.

The v0.3.0 material catalog also adds **Sugar Cane** as a Common cultivated Material for cane spirits and future culinary/brewing Recipes.

### Non-Alcoholic Drinks - 15 Products

The non-alcoholic library contains 5 Mundane, 5 Dwarven, and 5 Elven drinks. These deliberately avoid a persistent subsystem:

- **Simple:** restore 1 HP, 100 servings per craft;
- **Prepared:** restore 2 HP, 40 servings per craft;
- **Specialty:** restore 3 HP, 30 servings per craft.

The healing is instantaneous, never exceeds maximum HP, creates no persistent Active Effect, and uses normal D&D 5e healing semantics.

### Economy and Recipe Yield

Curated Products use batch/serving economics. The total value of the batch targets approximately:

`2 x current ingredient cost`

The unit price is therefore:

`(2 x ingredient cost) / Recipe yield`

This lets crafted meals and drinks be produced in sensible quantities while taverns, vendors, loot, and Supplier-style inventories continue to buy, sell, and store individual Product units.

All official Curated Product Recipes use **10 seconds** of crafting time. Each Product offers three curated icon candidates through the Materials & Products interface, mixing bundled Crafting Core artwork with compatible Foundry/D&D5e-native assets while preserving GM-selected icons. **Restore Curated Product Defaults** repairs missing official Products and matching Recipe Sources while preserving unrelated GM content and supported presentation customizations.

## Optional Curated Alchemy & Inscription

Crafting Core v0.5.x adds an **optional** Curated Alchemy & Inscription library. Existing Worlds are not silently expanded: the GM installs or restores it from **Crafting Core - Materials**.

When enabled, the library adds:

- **23 normalized Materials** integrated with Gathering, Creature Harvest, Material Sources, and Scanner v2 where appropriate;
- **82 Products**: 43 ready-to-use canonical SRD-based consumables, 34 Inscription presentation variants, and 5 Inscription Inks;
- **97 Recipes**, including cultural Healing preparations, utility/alchemical consumables, Resistance, Giant Strength, advanced potions, Ink recipes, and Inscription recipes.

### SRD-only Product policy

Canonical Alchemy Products are resolved at runtime only from the installed D&D5e **SRD 5.2 / SRD 5.1** Compendium packs and must carry the expected **CC-BY-4.0** source license. Crafting Core does not require or redistribute Player's Handbook premium Items for this curated library. If an SRD source cannot be resolved, that Product/Recipe is not fabricated from a premium fallback.

`Potion of Comprehension` and `Potion of Fire Breath` are intentionally not distributed by this library because they are absent from the supplied SRD 5.1/5.2 packs used for the v0.5.x implementation baseline.

The SRD `Potion of Resistance` is a configurable template containing all ten resistance Active Effects. Crafting Core materializes ten ready-to-use curated variants (Acid, Cold, Fire, Force, Lightning, Necrotic, Poison, Psychic, Radiant, and Thunder), each retaining only the matching canonical Active Effect. Their Inscription counterparts use the same filtered SRD mechanics.

### Inscription

An **Inscription** is not a Spell Scroll and does not reimplement a consumable's mechanics. It is a presentation variant of the same canonical SRD Item. Crafting Core clones the SRD source and changes only the curated presentation such as name, icon, flavor, and Crafting Core metadata; the original D&D5e **Activities, Active Effects, formulas, targets, uses/consumption, and rules data remain authoritative**.

Inscription recipes use **Parchment + Inscription Ink + a thematic ingredient** and persistent Crafting Projects:

| Tier | Work Periods | Visual family |
| --- | ---: | --- |
| Basic | 1 | simple document / parchment |
| Elaborate | 2 | bound or multi-page document |
| Elite | 3 | book / tome |

Project cadence is based on Short Rest work periods. Extra Effort uses **INT DC 12**; success adds one extra progress step on top of the normal work period, while failure keeps the normal progress. Inscription qualification is **Calligrapher's Supplies OR Arcana**.

### Inscription Inks

Five Ink Products are included: Common, Uncommon, Rare, Very Rare, and Legendary Inscription Ink. Each tier has two alternative pigment Recipes that produce the same Ink Product. Ink crafting uses **Calligrapher's Supplies OR Alchemist's Supplies**.

### Curated final-check rule

Alchemy/Inscription Recipes use two proficiencies as alternatives (`Any one qualifies`). A crafter proficient in either configured option receives automatic final success. A non-proficient crafter may still attempt the Recipe and makes a **DC 8 Final Crafting Check**; on failure the Product is not created and approximately **50% of the attempt's Materials are lost**. Rarity pressure comes primarily from ingredient access, rarity gates, workload, and cost rather than increasing the default DC.

### Larger Harvest pools without larger automatic loot

Scanner v2 automatic rarity pools may retain up to **7 eligible candidates per pool** instead of 5. This gives the expanded Material catalog more room to remain discoverable without increasing the number of final automatic Harvest drops per creature.

## Creature Scanner and Harvest Profiles

The **Creature Scanner** analyzes configured D&D 5e Actor Compendiums without modifying source Actors or source packs.

Scanner source selection and priority are configured in **Game Settings -> Crafting Core -> Configure Crafting Core**.

Stored Harvest Profiles can contain:

- inferred anatomy and structural tags;
- four automatic rarity pools;
- multiple candidate materials per pool;
- a separate fifth **Essence Pool**;
- per-pool chance and quantity rules;
- GM-authored **Pinpoint Overrides** for boss, quest, or guaranteed special materials.

Pinpoint Overrides are extra rolls and never consume one of the four normal rarity-pool results.

### Essence Pool

Essence is separate from the four physical/thematic rarity pools.

Profiles with valid non-physical affinity can generate Arcane Essence or a specific Essence associated with the source Actor. Profiles without a supported affinity use the Arcane/no-Essence fallback behavior defined by the analyzer.

## Generate Materials

The GM-only **Generate Materials** tool uses the shared material generation engine and supports:

- **Creature Harvest**;
- **Environment Gathering**;
- **Game Hunt**.

Generation is preview-first. The GM sees the rolled result before choosing a destination. Before materializing the result, the GM can edit each generated stack quantity or remove an individual Material from the current batch without changing the Material Catalog or generation Profile.

For **Environment Gathering**, abundance now controls discovery pressure rather than stack inflation: richer environments produce more discovery opportunities and modestly improve the rarity mix, while each individual occurrence keeps the Material's own quantity formula.

Accepted results can become:

- a timestamped World Item folder under **Crafting Core - Generated Loot**;
- an optional **Hidden Item Pile** when Item Piles is active.

The preview is the exact result that gets materialized; choosing a destination does not reroll it.

## Token Harvest and Item Piles

When Item Piles is active, Crafting Core can harvest eligible dead Tokens using their stored Harvest Profile.

Crafting Core owns the harvest rules and generated materials. Item Piles is used as the physical loot-container integration.

The Token Harvest settings include four existing-NPC-loot modes:

- **Normalize from Compendiums** - recommended; physical gear is replaced with safe base matches from configured Item Compendiums;
- **Remove All Existing Items**;
- **Keep Physical Gear / Remove Natural & Features**;
- **Keep All Existing Items**.

Normalization sources are prioritized and exact/safe matching is used rather than fuzzy replacement of unique monster gear. An optional homebrew setting can convert firearm gear to a random Hand, Light, or Heavy Crossbow during normalization.

## Managed Compendiums

Crafting Core uses private world Compendiums as durable content stores and interoperability boundaries.

### Crafting Core - Materials

234 core curated crafting materials plus GM-registered material content. The optional Alchemy & Inscription library adds 23 more normalized Materials only after explicit GM installation, for 257 active curated Materials in that World.

### Crafting Core - Learn Sources

Published Recipe, Formula, Blueprint, and Manual Items. This is the authoritative published Knowledge database.

The official Curated Recipe library is organized by Product family and culture under `Crafting Core Curated`, with separate branches for **Culinary Meals**, **Alcoholic Drinks**, and **Non-Alcoholic Drinks**.

### Crafting Core - Products

Created and maintained when the Curated Product library is available. Contains the 58 ready-to-buy/use official Meals, Alcoholic Drinks, and Non-Alcoholic Drinks, organized by family and culture for vendor, loot, drag-and-drop, and Supplier-style stock generation.

## Game Settings

The Crafting Core Game Settings area contains:

- **Support the Creator** and Buy Me a Coffee;
- **Configure Crafting Core**;
- **More from Hammer-PvP**.

Configure Crafting Core currently manages:

- Creature Scanner Actor sources and source priority;
- Token Harvest existing-loot handling;
- Gear Normalization Item Compendiums and priority;
- optional Firearms-to-Crossbows normalization.

## Documentation

The repository keeps one current manual in `docs/`:

**[Open the Complete Crafting Core Manual](docs/Crafting-Core-Complete-Manual.pdf)**

Release history belongs in **[CHANGELOG.md](CHANGELOG.md)**. The README is intentionally maintained as a current overview of the module rather than as a second changelog.

## More from Hammer-PvP

Crafting Core is part of a set of Foundry VTT tools designed to complement one another:

- [DnD 5e Character Builder](https://github.com/hammer-PvP/DnD-5e-Character-Builder)
- [DnD 5e Item Creator](https://github.com/hammer-PvP/DnD-5e-Item-Creator)
- [DnD 5e Currency Manager](https://github.com/hammer-PvP/DnD-5e-Currency-Manager)
- [Enhanced Audio Player](https://github.com/hammer-PvP/Enhanced-Audio-Player)

## Support the Creator

If Crafting Core helps your table and you would like to support continued development:

[Buy Me a Coffee](https://buymeacoffee.com/hammer.pvp)

## Bugs and Feature Requests

Use [GitHub Issues](https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues) for bug reports and feature requests.

For bug reports, include the Crafting Core, Foundry VTT, and D&D 5e versions, reproduction steps, relevant console errors, and screenshots when useful.

## AI-Assisted Development

Crafting Core is an original project designed and directed by its creator. AI tools were used to assist with code, documentation, review, and debugging. The module's concepts, mechanics, design decisions, testing, and final implementation choices remain under the creator's responsibility.

## License

See `LICENSE`.
