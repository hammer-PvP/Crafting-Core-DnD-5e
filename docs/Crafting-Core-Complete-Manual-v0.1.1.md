# Crafting Core (DnD 5e)
## Complete Manual - v0.1.1

Crafting Core is a GM-authoritative crafting, harvesting, material, and resource-generation framework for Foundry Virtual Tabletop using the D&D5e system.

It is designed around a simple principle: the GM defines the rules and the module executes them consistently. A Recipe can be a five-second conversion, a multi-rest Crafting Project with intermediate checks, or anything between those two extremes. The same module also provides a curated material library, Creature Harvest profiles, environmental gathering, Game Hunt generation, Knowledge Sources, and optional Item Piles integration.

This manual documents the features that exist in v0.1.1. It intentionally does not describe speculative or future systems.

## Contents

- Compatibility, requirements, and the Crafting Core model
- Part I - GM Recipe Authoring
- Part II - Crafting Projects
- Part III - Player Visibility and Character Crafting
- Part IV - Knowledge Sources
- Part V - Materials
- Part VI - Creature Scanner and Harvest Profiles
- Part VII - Token Harvest and Existing NPC Loot
- Part VIII - Generate Materials
- Part IX - Settings, support, and feedback
- Part X - Result dialogs and feedback
- Part XI - Practical workflows
- Part XII - Troubleshooting and FAQ
- Part XIII - Quick reference and support

---

## 1. Compatibility and requirements

### Foundry VTT
- Minimum: Foundry VTT 14
- Verified: Foundry VTT 14.365

### D&D5e system
- Required system: D&D5e
- Verified system version: 5.3.3
- The module metadata is intentionally pinned to D&D5e 5.3.3 for the v0.1.1 release line.

### Optional integration
- Item Piles is optional.
- Crafting Core works without Item Piles.
- When Item Piles is active, generated loot and harvested corpses can use Item Piles as the physical loot container.

### Permissions
- GM tools are GM-only.
- Players interact primarily through the Crafting tab added to their D&D5e Character Sheet and through Knowledge Source Items deliberately distributed by the GM.

---

## 2. The Crafting Core model

Crafting Core separates the system into a few clear concepts.

### Recipe
A Recipe is the GM-authored definition of a craft. It stores:

- what Items are consumed;
- what Item is produced;
- the output quantity;
- who may attempt the craft;
- relevant proficiencies;
- whether a final check is required;
- whether the craft is Timed or a persistent Crafting Project;
- project Work Periods, cadence, Progress Checks, Extra Effort, and failure behavior;
- what information the player is allowed to see.

Before publication, a Recipe Builder entry is a GM-only draft. After publication, the matching Item in the private Learn Sources Compendium becomes the authoritative definition that Characters know. The Builder remains the GM editor, but changes do not become official until **Update / Save to Compendium** is used.

### Knowledge Source
A Knowledge Source is a real D&D5e Item published from a Recipe. It can be labeled as:

- Recipe;
- Formula;
- Blueprint;
- Manual.

The published Item contains the authoritative Recipe snapshot. Copies can be distributed through Actors, loot, vendors, Item Piles, or other gameplay flows, but the original Compendium Item remains the official definition.

### Known Recipe
Learning a Knowledge Source records that Recipe on the Character together with its published-source identity. Crafting Core keeps the Character's cached definition synchronized with the authoritative Compendium source whenever the GM publishes an update.

A Character may also deliberately forget a known Recipe with **Unlearn Recipe**. This requires typing **I AGREE** and is blocked while that Recipe is currently being crafted.

### Material
A Crafting Core Material is a normal D&D5e Item, represented as Loot -> Trade Good. The module ships a curated catalog of 229 built-in materials, but any D&D5e Item can be used directly as a Recipe ingredient or output.

### Crafting Project
A Crafting Project is a persistent craft measured in Work Periods rather than seconds. It reserves materials, records progress on the Actor, and advances only when the player performs an available Work Attempt.

### Harvest Profile
A Harvest Profile is Crafting Core metadata tied to a source Actor. It describes automatic rarity pools, an Essence pool, and optional Pinpoint Overrides. The source Actor remains read-only.

---

## 3. Where to find the module

### Item Directory buttons
For a GM, Crafting Core adds launcher controls to the Item Directory:

- **Crafting Core** opens the main GM Recipe Builder.
- **Generate** opens Generate Materials directly.

### Game Settings
Open:
**Game Settings -> Configure Settings -> Module Settings -> Crafting Core**

The Crafting Core settings screen configures:

- Creature Scanner Actor sources and their priority;
- Token Harvest handling for existing NPC loot;
- optional firearm-to-crossbow normalization behavior;
- creator support and GitHub feedback links.

### Character Sheet
Eligible D&D5e Character Sheets receive a **Crafting** tab. This is the player-facing crafting interface.

---

# Part I - GM Recipe Authoring

## 4. Main Crafting Core window

The main GM application is split into a left Recipe list and a right Recipe Builder workspace.

### Left sidebar
The sidebar contains:

- **New Recipe Draft**;
- **Materials**;
- **Generate**;
- **Scanner**;
- **Learn Sources**;
- the list of current Recipe Builder drafts.

Published drafts are labeled as published and show their Knowledge Source type. Timed Recipes display their crafting time. Project Recipes display their required Work Periods.

### Recipe Builder philosophy
The Builder is a GM workbench. Before publication, it is only a draft. When a Recipe is ready, publish it to the private Learn Sources Compendium and distribute copies from there.

After publication, the Builder becomes the editor for that published Recipe. **Save Editor Draft** stores the GM's current edits without changing player knowledge. Only **Update / Save to Compendium** writes those changes to the authoritative source and synchronizes Characters who already know the Recipe.

---

## 5. Identity and Crafting Mode

Every Recipe begins with its identity.

### Name
The Recipe name is the name used throughout the Crafting interface.

### Crafting Mode
Two modes exist.

#### Timed / Seconds
A Timed Recipe uses a duration in seconds. The player starts the craft, ingredients are consumed at the appropriate start point, and completion is based on synchronized Foundry server time. Closing and reopening the sheet does not reset the timer.

Use Timed mode for crafts such as:

- combining a few components;
- brewing a quick mixture;
- assembling an item that should take real-time seconds rather than rests.

#### Crafting Project
A Project uses Work Periods and rest-based opportunities. It is intended for crafting that should matter over multiple adventuring days or rest cycles.

### Recipe Image
The Recipe image is used in the Builder and player presentation.

### Additional Description
Optional lore, instructions, flavor, or crafting notes can be stored here. Player Visibility determines whether the player is allowed to see this text.

---

## 6. Proficiency and access - Who Can Craft

This block defines who is eligible and how proficiency affects the final craft.

### Relevant Proficiency
Up to two relevant proficiencies can be selected. Each can be a:

- Skill;
- Tool proficiency.

Examples:

- Alchemist's Supplies;
- Smith's Tools;
- Arcana;
- Survival;
- Arcana + Calligrapher's Supplies.

### If two are selected
- **Any one qualifies**: having either proficiency satisfies the Recipe.
- **Both are required**: the Character must satisfy both.

### Who can attempt
- **Anyone**: lack of proficiency does not block the craft.
- **Requires relevant proficiency**: the Actor must satisfy the configured proficiency rule.

### If proficient
- **Roll normally**: proficiency does not bypass a configured Final Crafting Check.
- **Automatic final success**: a qualifying proficient crafter automatically succeeds at the final validation when that policy applies.

These settings are separate from Learning Access. A Character may be allowed to learn a Recipe even when crafting eligibility is strict, or learning can be configured to follow crafting eligibility.

---

## 7. Final Crafting Check

The Final Crafting Check is the last validation before the output is created.

### Require a Final Crafting Check
When disabled, an eligible craft completes automatically once its other requirements are satisfied.

When enabled, the GM selects:

- Ability Check;
- Skill;
- Tool;
- Saving Throw;
- Difficulty Class (DC).

Crafting Core uses native D&D5e rolls for these checks.

### Timed Recipe failure
A failed final check ends the Timed crafting attempt. The GM can optionally configure material loss on that failure.

### Project Recipe failure
A Project has three possible final-failure outcomes.

#### Stay Ready
No project progress is lost. The Project remains complete and ready, but another compatible rest must unlock the next Final Check opportunity.

#### Regress Project
The Project moves backward by a GM-configured number of Work Periods.

#### Fail Project
The Project ends completely and must be restarted. The GM may optionally configure a percentage of reserved materials to be lost when the Project fails. Materials not lost are returned.

---

## 8. Ingredients and output

### Items Consumed
Drop any D&D5e Item into the ingredient area. Crafting Core does not restrict Recipes to its curated Materials Compendium.

Each ingredient has a required quantity.

The ingredient resolver aggregates equivalent inventory stacks. If a Character has two separate embedded stacks of the same material, the Recipe can count their combined quantity.

### Crafted Item
Drop the final D&D5e Item into the output area and set the output quantity.

Crafting Core freezes a complete Item snapshot. When the Character completes the craft, the output is recreated with its Item data, including Activities, Effects, flags, and other embedded configuration present in the source snapshot.

This is why Items authored with additional Foundry tooling can remain mechanically intact when used as Recipe outputs.

---

# Part II - Crafting Projects

## 9. Work Periods and cadence

Project Recipes add a Work Period configuration.

### Required Work Periods
This is the amount of successful project progress required before the Project reaches its final state.

### Cadence
Two cadence models exist.

#### Long Rest
Only a Long Rest unlocks the next normal Work Attempt.

#### Short Rest
A Short Rest or a Long Rest unlocks the next normal Work Attempt.

### Important rule: rest does not add progress
A rest only unlocks an opportunity. It never increments project progress by itself.

### Starting a Project
Starting a Project immediately performs the first normal Work Attempt. The player does not need to rest before the first attempt.

### One active Project per Actor
Crafting Core stores one active Project on the Actor. The Project contains a frozen Recipe snapshot and reserved materials.

---

## 10. Reserved materials

When a Project begins, required materials are removed from ordinary inventory and stored as reserved material snapshots inside the Project state.

This has several benefits:

- the same ingredients cannot be spent on another craft while the Project is active;
- later edits to the Builder do not change the active Project;
- cancellation can return reserved materials;
- project-failure rules can determine whether some reserved materials are lost.

### Cancel Project
Canceling returns the still-reserved materials to the Actor.

---

## 11. Progress Checks

Progress Checks are optional.

### Require Progress Checks
When disabled, each normal Work Attempt automatically adds +1 progress.

When enabled, the GM selects:

- when the check occurs;
- the roll type;
- the DC;
- the failure consequence.

### When
- **Every Work Period**: each normal Work Attempt is checked.
- **Midpoint Only**: the configured midpoint progression is the special checked stage.

### Check types
The Progress Check can use:

- Ability Check;
- Skill;
- Tool;
- Saving Throw.

### Failure always spends the Work Attempt
A failed Progress Check consumes that opportunity. The consequence determines what happens to the Project.

#### No Progress
The Project does not gain the normal +1. It remains at its current progress.

#### Regress Progress
The Project does not gain +1 and loses the configured number of Work Periods.

#### Fail Project
The entire Project ends. The GM may optionally configure a percentage of reserved materials to be lost. Remaining materials are returned.

Material loss is deliberately attached to Project failure. It is not an isolated penalty while the same Project simply continues.

---

## 12. Extra Effort

Extra Effort is an optional second work attempt for a Project cycle.

### Enable Extra Effort
When enabled, a successful or surviving normal Work Attempt makes **Extra Effort** available for that Work Period.

The player may use it once before the next rest cycle.

### Separate check
Extra Effort uses its own check, independent of the normal Progress Check. The GM selects:

- Ability Check, Skill, Tool, or Saving Throw;
- DC;
- Progress on Success.

This lets the GM model the kind of strain appropriate to the Recipe. Examples include Constitution for prolonged physical work, Intelligence for complex technical work, or a Tool check for demanding professional execution.

### Progress on Success
The GM chooses how much extra Work Progress is gained on a successful Extra Effort attempt. The normal default is +1.

### Failure
A failed Extra Effort:

- spends that Extra Effort opportunity;
- grants no extra progress;
- does not consume or reserve ingredients again.

By default, failure has no additional penalty.

### Lose Progress on Failure
This optional checkbox enables a harsher rule. When enabled, the GM selects how much existing Work Progress is lost on a failed Extra Effort.

### Rest and Extra Effort
If the player rests instead of using the available Extra Effort, that old Extra Effort opportunity is gone. The rest unlocks the next normal Work Attempt. A new Extra Effort opportunity only becomes available after that normal Work Attempt is performed.

---

## 13. Reaching the end of a Project

When completed Work reaches the required Work Periods:

- if no Final Crafting Check is required, the craft can complete automatically according to the Recipe rules;
- if a Final Crafting Check is required, the Project enters the final validation flow.

Extra Effort can provide the progress that reaches this threshold.

### Completion feedback
On success, Crafting Core displays a centered result dialog with an explicit OK button. When output visibility permits it, the message identifies:

- the crafted Item;
- the quantity created;
- that the result was added to the Actor inventory.

Work success, Work failure, regression, Extra Effort outcomes, Final Check outcomes, and Project failure use the same Crafting Core result-dialog language.

---

# Part III - Player Visibility and Character Crafting

## 14. Player Visibility

The GM can independently decide which Recipe details are shown to players. Hidden values remain stored and enforced by the module.

Visibility controls include:

- Output;
- Ingredients;
- Ingredient Quantities;
- Craftable Count;
- Relevant Proficiencies;
- Who Can Attempt;
- Crafting Time / Cadence;
- Current Project Progress;
- Progress Check;
- Progress DC;
- Progress Failure;
- Progress Material Loss percentage;
- Extra Effort;
- Extra Effort Check;
- Extra Effort DC;
- Extra Effort Failure;
- Final Crafting Check;
- Final Crafting DC;
- Final Failure Consequence;
- Final Material Loss percentage;
- Additional Description.

This system allows a GM to run anything from a fully transparent crafting system to Recipes whose exact risks and requirements remain partially unknown to the player.

---

## 15. Character Sheet - Crafting tab

The Character Sheet Crafting tab is the player's main crafting interface.

### Known Recipes list
The list shows Recipes learned by that Character.

When Craftable Count visibility is enabled, the list can display how many complete crafts are currently possible from the Character's inventory.

### Selected Recipe details
The right side of the interface shows the selected Recipe and only the information the GM has chosen to reveal.

Possible information includes:

- output;
- ingredients and available quantities;
- relevant proficiencies;
- crafting mode and cadence;
- checks and DCs;
- failure consequences;
- description;
- current Project state.

### Timed crafting
A Timed Recipe exposes the normal craft action and a synchronized progress bar while the timed job is active.

### Project crafting
A Project can expose actions such as:

- Start Project;
- Perform Work;
- Extra Effort;
- Final Check;
- Cancel Project.

Buttons appear or enable according to the current Project phase and opportunity state.

---

# Part IV - Knowledge Sources

## 16. Publishing a Recipe

The Recipe Builder can publish a Knowledge Source to the private **Crafting Core - Learn Sources** Compendium.

### Source Type
Choose:

- Recipe;
- Blueprint;
- Formula;
- Manual.

### Custom Item Name
The GM may override the generated Knowledge Source name.

### Knowledge Source Image
A separate image can be selected for the published source.

### Rarity and price
The Knowledge Source inherits rarity from the crafted output. Its price follows the module's D&D5e magic-crafting progression. Legendary Knowledge Sources use 100,000 gp.

### Idempotent publication
Updating an already published Recipe updates the same corresponding Compendium Item rather than deleting and recreating it. Its authoritative UUID remains stable, and Crafting Core reconciles the source to exactly one canonical **Learn Recipe** Activity.

### Draft versus authoritative publication
Once a Recipe is published, the Recipe Builder deliberately separates two save actions:

- **Save Editor Draft** saves the GM's current edits locally. Characters continue using the currently published version.
- **Update / Save to Compendium** writes the editor state to the authoritative Learn Sources Item. Characters who already know the Recipe are then synchronized automatically.

This boundary allows a GM to rebalance or rewrite a Recipe safely before making those changes live.

On startup, Crafting Core also reconciles the private library. If a published source from an older version still exists but its old Builder draft was deleted, the module recreates/relinks the Builder entry from the authoritative published snapshot so the GM can edit it again.

### Updating a known Recipe
When the authoritative Compendium source is updated:

- Characters who already know the Recipe receive the new published definition automatically;
- they do not need to learn the Recipe again;
- distributed Knowledge Source copies are synchronized to the current published snapshot;
- a Crafting Project that already started keeps its frozen start-time snapshot;
- future crafts and future Projects use the updated published definition.

### Deleting a published Recipe
Deleting the authoritative Knowledge Source from **Crafting Core - Learn Sources** removes that Recipe from Characters who know it. Distributed copies of that deleted source are invalidated and can no longer teach the Recipe.

If a Crafting Project was already in progress, its frozen Project snapshot remains visible and can still be completed or cancelled. The deleted Recipe does not return to the Character's known list afterward.

Deleting or consuming an ordinary inventory copy does **not** make a Character forget a Recipe that was already learned.

---

## 17. Learning Access

Two learning-access modes exist.

### Anyone Can Learn
The Character may learn the Recipe regardless of the Recipe's crafting proficiency eligibility.

### Follow Crafting Eligibility
Learning checks the same relevant-proficiency eligibility used by the Recipe's crafting access.

If the Character does not qualify:

- learning is rejected;
- the Knowledge Source is not consumed;
- a centered Crafting Core dialog explains why the Character cannot learn when the relevant information is allowed to be revealed;
- if the requirement is hidden by Player Visibility, the message remains generic and does not leak the hidden requirement.

### Learn Recipe Activity
Published Knowledge Sources include a one-use **Learn Recipe** Activity. A successful learning action records the current published Recipe definition on the Actor, links it to the authoritative source, and consumes the distributed copy according to its configured use behavior.

### Unlearn Recipe
Players and GMs can use **Unlearn Recipe** from the Character Crafting tab.

The confirmation warns that the Character may not be able to obtain the Recipe again and requires the exact phrase **I AGREE** before the Recipe is forgotten.

Unlearn is blocked while the same Recipe is involved in an active craft or Crafting Project. After a Recipe is forgotten, later Compendium updates do not cause that Character to relearn it automatically.

---

# Part V - Materials

## 18. Materials Compendium

Crafting Core manages a private world Item Compendium named:
**Crafting Core - Materials**

It is stored under the **Crafting Core** Compendium folder and is intended for GM management.

### Built-in catalog
v0.1.1 ships the same 229 curated built-in materials established in the v0.1.0 catalog.

The catalog families are:

- Creature Harvest;
- Essences;
- Gathering;
- Profession & Trade.

The catalog includes creature-type materials, flora, roots, fungi, wood and resin, wild foraging, minerals and geological resources, Game Hunt meats, cultivated and domestic goods, food/cooking materials, metalworking materials, leatherworking materials, alchemy materials, gemcutting/crystal materials, and general trade materials.

### Native Item format
Materials are normal D&D5e Items:

- Item type: Loot;
- Loot subtype: Trade Good.

### Core icon policy
Curated materials reference Foundry Core `icons/...` paths. Crafting Core does not bundle Foundry Core artwork.

Each curated built-in material offers three Core icon candidates and one selected default.

---

## 19. Material Catalog screen

Open **Materials** from the main Crafting Core sidebar.

### Sync Catalog
Synchronizes managed built-in materials into the private Compendium while preserving GM overrides where intended.

### Open Compendium
Opens the physical Materials Compendium.

### Reset to Curated Defaults
Resets built-in curated metadata/economy/icon choices to the shipped defaults while preserving custom registered materials.

This is a deliberate reset action, not ordinary synchronization.

### Rarity defaults
The GM can configure default:

- GP value;
- drop chance;
for Common, Uncommon, Rare, Very Rare, and Legendary curated materials.

Individual material edits can override these defaults.

### Register Existing Item
Drop any D&D5e Item into the registration area. Crafting Core copies it into the private Materials Compendium as Loot -> Trade Good so it can participate in Crafting Core material workflows.

### Filters
The catalog supports filtering/search by:

- text;
- family;
- nature;
- rarity.

### Core Icon - choose 1 of 3
Each curated row shows three native Foundry icon candidates. Selecting one immediately updates that material's curated icon choice without requiring a destructive full catalog reset.

---

## 20. Material stacking

Crafting Core materials use a stable material identity rather than the embedded Item UUID of a particular Actor copy.

### Why embedded UUIDs differ
When Foundry copies an Item into an Actor, it creates a new embedded document with a new `_id` and therefore a new UUID. Two copies of the same Compendium material can have different embedded UUIDs and still represent the same Crafting Core material.

### Forward-only auto-stacking
When a Crafting Core material enters an Actor through supported flows, the module can consolidate it into an existing equivalent stack instead of leaving a duplicate line.

The stable material identity is authoritative; the embedded UUID is not.

### Container context
Stacks are only consolidated when their container context is compatible. The module does not move a material out of one container merely because an equivalent material exists elsewhere on the Actor.

### Legacy duplicates
v0.1.0 does not perform a migration to normalize old duplicate stacks. This is intentional.

The Ingredient Resolver remains tolerant: if duplicate equivalent stacks exist, their quantities can still be aggregated for Recipe availability and consumption.

---

# Part VI - Creature Scanner and Harvest Profiles

## 21. Creature Scanner

Open **Scanner** from the main Crafting Core sidebar.

The Creature Scanner reads configured D&D5e Actor Compendiums and builds Crafting Core Harvest Profiles without modifying source Actors or source Compendiums.

### Configure Sources
Scanner sources are configured in Crafting Core Settings.

Installed system/module sources are grouped logically and resolve their Actor Compendiums. World Actor Compendiums can be selected as sources. Source order is also source priority.

### Scan
The Scanner:

- reads compatible Actor sources;
- analyzes creature identity and anatomy evidence;
- creates or updates Harvest Profiles;
- shows progress while scanning.

### Harvest Profile list
Stored profiles can be:

- searched;
- filtered by creature type;
- edited;
- reanalyzed from the source Actor;
- deleted without deleting the source Actor.

---

## 22. Harvest Profile editor

A Harvest Profile has four major sections.

### Inferred Anatomy
The analyzer stores anatomy tags and reasons. The GM can edit the comma-separated anatomy tags before saving.

The source Actor remains read-only.

### Rarity Pools
Automatic Creature Harvest uses rarity pools rather than one fixed material per slot.

Each pool contains:

- a Pool Chance percentage;
- zero or more selected candidate materials.

On harvest:

1. the pool chance is rolled once;
2. if successful, exactly one selected material from that pool is chosen;
3. having more candidate materials increases variety, not the number of drops from that pool.

This allows a creature such as a Griffon to have several plausible Common or Uncommon materials without dropping every one of them on every corpse.

### Essence Pool
The Essence pool is separate from rarity pools.

Profiles with relevant elemental/energy affinities can choose between:

- Arcane Essence;
- a specific Essence selected from the profile's affinity set.

Profiles without a specific affinity can use the Arcane/no-Essence fallback distribution.

### Pinpoint Overrides
Pinpoint Overrides are explicit GM-authored extra rolls for unique boss, quest, or guaranteed-special materials.

They do not consume a rarity-pool result and are rolled independently.

Each Pinpoint can define:

- material;
- chance;
- quantity.

---

# Part VII - Token Harvest and Existing NPC Loot

## 23. Token Harvest

Crafting Core adds a Harvest action for eligible dead Tokens.

The concrete-corpse workflow is:

1. select/use an eligible dead Token;
2. Crafting Core resolves its Harvest Profile;
3. rarity pools, Essence, and Pinpoint rolls are resolved by Crafting Core;
4. existing NPC loot is handled according to the configured normalization mode;
5. when Item Piles is available, the corpse can become the physical loot container and receive the generated result.

Item Piles does not own Crafting Core's harvest RNG. Crafting Core resolves the materials; Item Piles is the destination/container integration.

---

## 24. Existing NPC Loot settings

Open Crafting Core Settings to configure how physical NPC Items are handled when a corpse is harvested.

### Normalize from Compendiums
Recommended mode. Physical candidate Items are replaced with the first safe base match from the configured normalization sources.

The resolver uses safe identity matching such as identifier/base identity or exact name + Item type. It deliberately does not fuzzy-match unique monster gear.

Unmatched physical candidate Items are removed. Generated Harvest materials, Essences, and Pinpoints are preserved.

### Remove All Existing Items
Removes the Actor's existing Items from the corpse-loot result while keeping Crafting Core generated loot.

### Keep Physical Gear / Remove Natural & Features
Keeps physical equipment while filtering natural attacks/features and similar non-loot Actor content.

### Keep All Existing Items
Keeps the existing NPC Item content in addition to generated harvest loot.

### Normalization source priority
The GM selects Item Compendiums and orders them from highest to lowest priority. Crafting Core supports a bounded list of normalization sources.

### Optional Homebrew - Convert Firearms to Random Crossbows
When enabled under Normalize from Compendiums, a weapon identified as a Firearm is replaced by a randomly selected Hand Crossbow, Light Crossbow, or Heavy Crossbow resolved from the configured normalization sources. One result is used for the whole stack.

---

# Part VIII - Generate Materials

## 25. Generate Materials overview

Generate Materials is the GM-facing abstract resource generator. It is appropriate when the world does not contain a specific corpse/token representing the source.

The screen has three origins:

- Manual Creature Harvest;
- Environment Gathering;
- Game Hunt.

All generation is preview-first. The preview is the accepted result; creating a World loot folder or Item Pile materializes that same result rather than rerolling it.

---

## 26. Manual Creature Harvest

Manual Creature Harvest provides an abstract alternative to Token Harvest.

The GM can select multiple:

- creature types/natures;
- coarse Harvest Profiles;
- Essence affinities.

**Sources / Bodies** controls the number of harvest opportunities.

Selecting more creature contexts broadens the candidate pool. It is not intended as a simple linear multiplier of loot merely because multiple filters are selected.

Essence affinity selection supports the same Arcane/specific Essence philosophy used by automatic profiles.

---

## 27. Environment Gathering

Environment Gathering is an abstract GM generation tool.

### Biomes
Up to three Biomes can be selected at once.

### Resources
Select one or more resource categories available in the chosen Biomes. Categories include the gathering families represented in the catalog, such as Flora, Roots, Fungi, Wood & Resin, Wild Foraging, and Minerals & Geological resources.

### Abundance
Up to two abundance bands can be selected.

Abundance affects the generation opportunity/richness model. Selecting only a richer band does not silently inject another band.

### Gather Attempts
Controls the number of gathering opportunities.

### Pool philosophy
Biomes and Resources broaden the candidate pool. Selecting more contexts does not multiply loot linearly. Attempts are the primary control for how many opportunities are resolved.

Crafting Core does not require an internal gathering skill roll here. The GM can resolve narrative checks outside the generator and use this screen to materialize the resource result.

---

## 28. Game Hunt

Game Hunt represents abstract hunting rather than harvesting a specific monster Actor.

### Hunt Biomes
Up to three compatible Biomes can be selected.

### Abundance
Up to two Game Hunt abundance bands can be selected.

### Hunt Attempts
Each attempt is one hunting opportunity. Mixed Biomes share the attempts rather than multiplying them.

### Game catalog
The curated Game Hunt material set includes Rabbit, Hare, Game Bird, Wild Boar, Wild Goat, Deer, and Elk meat in Basic, Rich, and Premium quality tiers.

These are real Items in the Materials Compendium and can be used in Recipes like any other Item.

---

## 29. Generation preview and destinations

After generation, the Preview lists each Item and quantity.

### Generate Again
Rerolls using the current configuration.

### Create Loot Folder
Creates the exact preview as World Items in a generated loot folder.

### Item Piles - Drag Generated Loot to Scene
When Item Piles is active, the preview card can be dragged directly onto the Scene.

The generated pile:

- appears at the drop position;
- is Hidden by default;
- receives the complete generated item list and quantities.

The GM can reveal the pile later when the players should discover it.

### Create Hidden at Scene Center
Provides the same generated result as a Hidden Item Pile at the center of the viewed Scene.

---

# Part IX - Settings, support, and feedback

## 30. Crafting Core Settings screen

The Settings screen is divided into the following areas.

### Creature Scanner - Actor Sources & Priority
Choose the Actor sources the Scanner is allowed to read and order selected sources by priority.

### Token Harvest - Existing NPC Loot
Configure the loot-handling mode, optional firearm homebrew behavior, and Item Compendium normalization sources.

### Support the Creator
The settings screen includes a **Buy Me a Coffee** button for players/GMs who want to support continued development.

The button opens:
`https://buymeacoffee.com/hammer.pvp`

### Report a Bug / Request a Feature
A dedicated footer button opens the Crafting Core GitHub Issues page. Use it to report reproducible bugs or request improvements.

---

# Part X - Result dialogs and feedback

## 31. Crafting result messages

Important crafting outcomes use centered Crafting Core dialogs rather than relying only on temporary notifications.

Examples include:

- Work Period succeeded and progress advanced;
- Work Period failed with no progress;
- Work Period failed and the Project regressed;
- Project failed;
- Extra Effort succeeded;
- Extra Effort failed without penalty;
- Extra Effort failed and regressed progress;
- Final Check failed and stayed ready;
- Final Check regressed the Project;
- Final Check failed the Project;
- craft completed and output was added to inventory;
- Knowledge Source learning was rejected.

The exact facts shown are filtered through Player Visibility so a failure message does not reveal GM-hidden DCs, requirements, or material-loss percentages.

---

# Part XI - Practical workflows

## 32. Example: simple Timed Recipe

Goal: turn two ingredients into one consumable after a short timer.

1. Open Crafting Core.
2. Create a new Recipe Draft.
3. Set Crafting Mode to **Timed / Seconds**.
4. Set Crafting Time.
5. Drop the required Items and quantities into **Items Consumed**.
6. Drop the output Item into **Crafted Item**.
7. Decide whether a Final Crafting Check is required.
8. Configure Player Visibility.
9. Choose Recipe/Formula/Blueprint/Manual and publish the Knowledge Source.
10. Give the Knowledge Source to the Character.
11. The player uses **Learn Recipe**.
12. The Recipe appears in the Character Crafting tab.
13. The player starts the craft.
14. On completion, the frozen output Item is added to inventory.

---

## 33. Example: multi-rest Project with Extra Effort

Goal: a difficult craft requiring four Work Periods, one normal attempt per Long Rest, and optional Extra Effort.

1. Set Crafting Mode to **Crafting Project**.
2. Set Required Work Periods to 4.
3. Set Cadence to Long Rest.
4. Enable Progress Checks if desired and configure the check/DC.
5. Choose Progress failure behavior.
6. Enable Extra Effort.
7. Configure the Extra Effort check and DC.
8. Set Progress on Success to 1.
9. Leave **Lose Progress on Failure** unchecked for a risk-free extra attempt, or enable it and set the regression amount.
10. Configure a Final Crafting Check if desired.
11. Publish and teach the Recipe.
12. The player starts the Project. Starting immediately performs Work Attempt 1.
13. If the Project survives and Extra Effort is enabled, the player may attempt Extra Effort for that cycle.
14. A Long Rest unlocks the next normal Work Attempt. The rest itself does not add progress.
15. Repeat until the Project reaches 4/4.
16. Resolve the Final Check if required.
17. On success, Crafting Core creates the output and reports completion in a centered dialog.

---

## 34. Example: restrictive learning

Goal: only Characters with Alchemist's Supplies may learn and craft a Formula.

1. Set Relevant Proficiency to Alchemist's Supplies.
2. Set **Who can attempt** to **Requires relevant proficiency**.
3. Set Learning Access to **Follow Crafting Eligibility**.
4. Publish the Formula.
5. Give it to a Character without Alchemist's Supplies.
6. When the Character attempts **Learn Recipe**, Crafting Core rejects the learning action.
7. The source is not consumed.
8. If the proficiency requirement is visible, the dialog explains that the Character is missing Alchemist's Supplies. If the requirement is hidden, the dialog gives a generic eligibility message.

---

## 35. Example: corpse harvest with Item Piles

1. Configure Scanner Actor sources.
2. Scan the creature source Compendiums.
3. Review or edit the relevant Harvest Profile.
4. Configure Existing NPC Loot handling in Crafting Core Settings.
5. Defeat an eligible creature represented by a Token.
6. Use the Crafting Core Harvest action.
7. Crafting Core resolves rarity pools, Essence, Pinpoints, and existing loot normalization.
8. With Item Piles active, the corpse/pile receives the resulting Items.
9. Players loot the physical container through the normal Item Piles workflow.

---

# Part XII - Troubleshooting and FAQ

## 36. Why do two copies of the same material have different UUIDs?

Because Actor Items are embedded documents. Foundry creates a new embedded `_id` when an Item is copied into an Actor. Crafting Core therefore does not treat the embedded UUID as the stable identity of a material.

Equivalent Crafting Core materials can still be recognized by their stable material metadata, stacked in supported incoming flows, and aggregated by the Ingredient Resolver.

---

## 37. Why can the Character see less information than the GM configured?

Check the Recipe's **Player Visibility** section. Hidden settings remain mechanically active but are intentionally omitted from the player-facing Recipe details and result facts.

---

## 38. Why did a rest not advance my Project?

This is intentional. A compatible rest unlocks the next Work Attempt. The player must press the Work action to actually resolve that stage and gain progress.

---

## 39. Why is Extra Effort unavailable after a rest?

Extra Effort belongs to the current Work Period after its normal Work Attempt. A rest starts the next opportunity cycle and removes an unused previous Extra Effort opportunity. Perform the new normal Work Attempt first; if the Recipe allows Extra Effort and the Project is still active, the new Extra Effort opportunity becomes available afterward.

---

## 40. Does Extra Effort consume ingredients again?

No. Extra Effort never reserves or consumes the Recipe ingredients a second time.

---

## 41. Why could a Character learn a Recipe without the listed proficiency?

Check both settings:

- **Who can attempt** controls crafting eligibility.
- **Learning Access** controls learning eligibility.

If Learning Access is **Anyone Can Learn**, the Character may learn even when the Recipe later restricts who may craft it.

If Learning Access is **Follow Crafting Eligibility**, learning uses the Recipe's relevant-proficiency eligibility.

---

## 42. What happens if I edit a Recipe while a Project is active?

The active Project uses a frozen Recipe snapshot. Editing the Builder does nothing immediately, and even publishing an updated Compendium definition does not rewrite that Project in progress. Future crafts use the newly published definition.

---

## 43. What happens if I delete the published Knowledge Source?

The Learn Sources Compendium Item is authoritative after publication. Deleting that authoritative source removes the Recipe from Characters who know it and invalidates distributed copies of that deleted source.

Deleting or consuming a normal inventory copy does not remove already learned knowledge.

---

## 44. Do I have to use Crafting Core materials in every Recipe?

No. Any D&D5e Item can be an ingredient or output. The Materials Compendium is an organized curated vocabulary for harvesting, generation, and reusable crafting resources.

---

## 45. Does Generate Materials create loot automatically when I click Generate?

No. Generation first creates a preview. The GM then chooses a destination such as a World loot folder or Item Pile. This separation guarantees that the destination materializes the result the GM actually previewed rather than rerolling it.

---

## 46. Is Item Piles required?

No. Item Piles is optional. Without it, Crafting Core still supports its crafting system, material catalog, scanner, Harvest Profiles, and World loot-folder generation. Item Piles adds physical pile/corpse destination workflows.

---

## 47. Reporting problems

For bug reports, include:

- Crafting Core version;
- Foundry version;
- D&D5e version;
- whether Item Piles is active when relevant;
- steps to reproduce;
- console error text if present;
- a screenshot when the issue is visual.

Use the GitHub Issues page:
`https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues`

---

# Part XIII - Quick reference

## 48. GM checklist for a new Recipe

1. Create Recipe Draft.
2. Choose Timed or Project mode.
3. Configure access/proficiency.
4. For Projects, configure Work Periods and cadence.
5. Configure Progress Checks if desired.
6. Configure Extra Effort if desired.
7. Configure Final Crafting Check if desired.
8. Configure Player Visibility.
9. Drop ingredients and set quantities.
10. Drop output and set quantity.
11. Choose Knowledge Source type and Learning Access.
12. Publish.
13. Distribute the Knowledge Source through gameplay.
14. If the published Recipe is later revised, use **Update / Save to Compendium** to make the revision authoritative and synchronize known Recipes.

## 49. Player checklist for a Project

1. Learn the Recipe.
2. Open the Crafting tab.
3. Select the Recipe.
4. Confirm available ingredients and visible requirements.
5. Start Project.
6. Resolve the first Work Attempt.
7. Use Extra Effort if available and desired.
8. Take the compatible rest when another Work opportunity is needed.
9. Perform Work after the rest.
10. Repeat until ready for final validation.
11. Resolve Final Check if required.
12. Receive the crafted Item on success.

---

## 50. Support the creator

If Crafting Core helps at your table and you would like to support continued development, testing, and improvement of Foundry VTT tools:

**Buy Me a Coffee:**
`https://buymeacoffee.com/hammer.pvp`

**Project repository:**
`https://github.com/hammer-PvP/Crafting-Core-DnD-5e`

**Bug reports and feature requests:**
`https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues`

Thank you for using Crafting Core.
