# Crafting Core (DnD 5e)

Crafting Core is a GM-authoritative crafting, harvesting, and material framework for Foundry Virtual Tabletop, built specifically for D&D 5e.

The module connects four parts of the game loop:

1. **Materials and Products** - ingredients, harvested resources, trade goods, and curated finished items.
2. **Recipes and Knowledge** - GM-authored crafting definitions published as learnable Items.
3. **Player Crafting** - timed crafts and persistent Crafting Projects directly from the Character sheet.
4. **Harvesting and Generation** - creature profiles, environment gathering, game hunting, and optional Item Piles output.

Crafting Core uses native D&D 5e Items throughout. Any Item can be an ingredient or an output, so the system can support ordinary materials, equipment, consumables, custom Item Creator content, or another crafted Product as part of a later Recipe.

## Compatibility

- **Crafting Core:** v0.5.7a
- **Foundry VTT:** minimum 14.367, verified 14.367
- **D&D 5e:** 6.0.0-6.0.999, verified 6.0.1
- **Item Piles:** optional integration for Item Pile generation and Token Harvest
- **DnD 5e Item Creator:** optional for the core module; **0.7.1+ is required for the official persistent Curated Food and Alcohol Products**

Crafting Core v0.5.7a closes the v0.5.7 compatibility cycle with quality-of-life feedback for long GM maintenance operations. Gameplay, Recipes, Products, Materials, Harvest logic, and the v0.5.7 D&D5e 6.x compatibility behavior are unchanged.

### Long-operation progress

v0.5.7a adds a reusable real-progress window for the maintenance actions that can take several seconds on established Worlds:

- Synchronize Materials;
- Reset Curated Material defaults;
- Restore the 58 Curated Culinary Products and Recipes;
- Install / Restore the optional Alchemy & Inscription library;
- Resync Material Sources.

The window reports the current phase, current Product/Recipe/Material, X/Y progress when available, elapsed time, live counters, and a persistent completion summary. A maintenance lock prevents a second long operation from starting while one is already running. The operation itself is not cancellable mid-write, avoiding intentionally half-applied restore states.

### D&D 5e 6.0.x normalization

v0.5.7 retains the compatibility cleanup built on the approved v0.5.6 behavior:

- Crafting Core-managed ActiveEffects persist changes in the D&D5e 6.x `system.changes` model;
- legacy movement effect targets are normalized to `system.attributes.movement.speeds.*`;
- 5.3.3-era Recipe/result snapshots are normalized when saved, transferred, or crafted;
- Resistance effect inspection reads `system.changes` first with a legacy fallback;
- Foundry v14 nested-map removals use `foundry.data.operators.ForcedDeletion()` rather than deprecated `-=key: null` update syntax.

No Recipes, drop rates, project rules, curated content, Scanner philosophy, lifecycle behavior, or Alchemy/Inscription design were intentionally changed by this patch.

## Core Workflow

### 1. Prepare Materials and Products

The private **Crafting Core - Materials** Compendium contains the built-in material catalog used by harvesting, gathering, generation, and Recipe building.

The core catalog contains **234 curated materials**. Installing the optional Curated Alchemy & Inscription library adds 23 more for **257 active built-in Materials**.

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


## Optional Curated Alchemy & Inscription

v0.5.5 adds an **optional GM-installed Curated Alchemy & Inscription library**. It is deliberately opt-in: Worlds that do not install it remain on the 234 core Materials and 58 Culinary Products.

Installing the library adds:

- **23 optional Materials**, normalized through the existing Material Sources ecosystem;
- **82 Products**: 43 SRD-based consumables, 34 Inscription variants, and 5 Inscription Inks;
- **97 published Recipe Learn Sources**;
- traditional, Elven, and Dwarven methods for the four Healing Potion tiers;
- utility, resistance, giant-strength, and advanced alchemical Recipes;
- Basic, Elaborate, and Elite Inscription Projects.

### SRD-only product policy

Canonical consumable Products are never rebuilt from hand-authored Activities and no premium Player's Handbook Item data is bundled. Crafting Core resolves Items only from the installed D&D5e **SRD 5.2 / SRD 5.1 CC-BY-4.0** Compendiums, imports the complete native Item through D&D5e's own Compendium conversion path, and then stores that native result in `Crafting Core - Products`.

This preserves the canonical D&D5e Item's Activities, Effects, uses, consumption, formulas, targeting, and compatibility with other modules. If the SRD does not provide a redistributable Product, Crafting Core does not ship the corresponding Curated Recipe. `Potion of Comprehension` and `Potion of Fire Breath` are therefore not included in this library.

### Inscription presentation variants

An Inscription is the same functional SRD consumable presented and crafted in a different form. Crafting Core first persists the complete SRD clone and **only then** changes presentation such as name, icon, flavor, folder, and Crafting Core metadata. It does not transplant or reconstruct the Item's Activities.

- **Basic** Inscriptions use a simple document icon and require 1 Work Period.
- **Elaborate** Inscriptions use a more developed manuscript icon and require 2 Work Periods.
- **Elite** Inscriptions use a book/tome presentation and require 3 Work Periods.
- Work cadence is Short Rest based. Extra Effort uses INT DC 12; success adds one extra progress beyond the normal Work Period.
- Inscription crafting accepts **Calligrapher's Supplies OR Arcana**. Inscription Ink accepts **Calligrapher's Supplies OR Alchemist's Supplies**.
- Curated recipes use Automatic Success when a valid configured proficiency qualifies; otherwise the final attempt uses DC 8 and failure can lose approximately 50% of the attempt's Materials.

The five Ink tiers are Common, Uncommon, Rare, Very Rare, and Legendary. Each Ink has two alternative pigment Recipes and yields two Ink units.

### Fixed Potion of Resistance variants

The SRD `Potion of Resistance` is a template that determines a resistance type rather than a ready-made Fire/Cold/etc. final Item. Crafting Core therefore treats Resistance as the one controlled materialization exception to the ordinary clone-and-reskin rule.

The module imports the native SRD template, keeps the original native Utility Activity, uses D&D5e's public Item Activity API to remove the random-table roll, retains exactly one canonical resistance ActiveEffect, and links that fixed effect to the Activity. The library provides ten final Potion variants and ten matching Inscriptions: Acid, Cold, Fire, Force, Lightning, Necrotic, Poison, Psychic, Radiant, and Thunder. Their descriptions are specific to the selected damage type and the effect lasts **1 hour**.

### Installation order and creature sources

New Gathering Materials participate automatically once the optional library is installed. New Creature Harvest Materials also participate in Scanner v2 eligibility. If Alchemy & Inscription is installed after a World has already scanned its Actor sources, run **Creature Scanner once more** so those new Materials can be added to World-specific Harvest Profiles, then use Material Sources Resync as normal.

Scanner candidate storage is expanded to **7 candidates per automatic rarity pool** to support the larger catalog. This increases eligible variety without increasing the number of final drops generated by a successful rarity pool.

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

234 core curated crafting materials plus GM-registered material content. When Curated Alchemy & Inscription is installed, 23 additional source-normalized Materials are activated for a total of 257 built-ins.

### Crafting Core - Learn Sources

Published Recipe, Formula, Blueprint, and Manual Items. This is the authoritative published Knowledge database.

The official Curated Recipe library is organized by Product family and culture under `Crafting Core Curated`, with separate branches for **Culinary Meals**, **Alcoholic Drinks**, and **Non-Alcoholic Drinks**.

### Crafting Core - Products

Created and maintained when the Curated Product library is available. Contains the 58 ready-to-buy/use official Meals, Alcoholic Drinks, and Non-Alcoholic Drinks. When Curated Alchemy & Inscription is installed, the same Compendium also contains 82 optional Products (43 SRD-based consumables, 34 Inscription presentation variants, and 5 Inscription Inks), for 140 Curated Products total.

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
