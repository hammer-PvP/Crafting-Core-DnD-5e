---
title: "Crafting Core (DnD 5e)"
subtitle: "Complete Manual - v0.2.0"
author: "Hammer-PvP"
date: "Foundry VTT 14 / Dungeons and Dragons 5e 5.3.3"
---

# Contents

- About this manual and compatibility
- Part I - GM Recipe Authoring
- Part II - Knowledge Base and Learning
- Part III - Character Crafting
- Part IV - Crafting Projects
- Part V - Materials
- Part VI - Creature Scanner and Harvest Profiles
- Part VII - Token Harvest and Existing NPC Loot
- Part VIII - Generate Materials
- Part IX - Settings, support, and module ecosystem
- Part X - Result dialogs and feedback
- Part XI - Practical workflows
- Part XII - Troubleshooting and FAQ
- Part XIII - Quick reference and support
- Part XIV - Curated Content

# About this manual

Crafting Core is a GM-authoritative crafting, harvesting, material, and resource-generation framework for Foundry Virtual Tabletop using the D&D5e system.

The module is built around a clear separation of responsibilities:

- the **GM authors** crafting rules;
- the **Learn Sources Compendium** stores the authoritative published knowledge;
- **Characters learn** stable Recipe identities and receive player-readable derived data;
- **Crafting Projects freeze** the Recipe snapshot they started with;
- the **Materials Compendium** stores the module's curated crafting vocabulary;
- harvesting and gathering use the same material catalog rather than inventing a separate loot language.

This manual documents the frozen v0.1.0 stable foundation plus the official content layer introduced in v0.2.0. The v0.2.0 feature work does not rewrite the validated Recipe/Knowledge/Project mechanics; it adds Curated Culinary content, a Products Compendium, and an Item Creator-powered consumable integration.

# 1. Compatibility and requirements

## Foundry VTT

- Minimum: Foundry VTT 14
- Verified: Foundry VTT 14.365

## D&D5e system

- Required system: D&D5e
- Verified system version: 5.3.3
- The module metadata is intentionally pinned to D&D5e 5.3.3 for this release line.

## Optional integration

Item Piles is optional. Crafting Core works without Item Piles.

When Item Piles is active, generated material previews and harvested corpse loot can be materialized as physical Item Piles. Crafting Core still owns generation rules and quantities; Item Piles is the destination/container layer.

**DnD 5e Item Creator 0.7.1+** is recommended. Crafting Core's base Recipe, Materials, Harvest, Knowledge, and Project systems remain usable without it, but the official **Curated Culinary Library** is installed/synchronized only while Item Creator is active. Item Creator owns the persistent consumable-effect lifecycle for those Products.

## Permissions

GM authoring tools are GM-only. Players primarily interact through:

- the **Crafting** tab on a D&D5e Character Sheet;
- Knowledge Source Items deliberately distributed by the GM;
- normal D&D5e inventory and roll interfaces.

# 2. The Crafting Core model

## Recipe Draft

A Recipe Draft is the GM's private editable workbench record. It can be incomplete, experimental, or contain changes that are not yet ready for players.

Saving a Draft does not alter the published Recipe.

## Published Knowledge Source

A published Knowledge Source is a real D&D5e Item stored in the private **Crafting Core - Learn Sources** Compendium. It can be presented as a:

- Recipe;
- Formula;
- Blueprint;
- Manual.

The Learn Sources Compendium is the authoritative published database. The Knowledge Base inside Crafting Core is a management interface for that same Compendium, not a competing database.

## Stable Recipe identity

Each Recipe has a stable Crafting Core Recipe ID. Names may change and physical Item document IDs may change when Foundry copies an Item, but the stable Recipe ID identifies the knowledge itself.

This is why a Character cannot learn the same Recipe twice merely by receiving one copy directly from the Compendium and another copy through the World Item Directory.

## Known Recipe

A Character's Crafting Core knowledge records which stable Recipes the Character knows and stores derived player-readable data needed to use the private publication safely.

The Compendium remains authoritative. Derived Actor state can be refreshed or reconciled from the published source.

## Material

A Crafting Core Material is a normal D&D5e Item represented as **Loot -> Trade Good**. The curated catalog contains 229 built-in materials, but any D&D5e Item can still be used directly as a Recipe ingredient or output.

## Crafting Project

A Crafting Project is a persistent craft measured in Work Periods instead of seconds. It reserves materials, records progress on the Actor, and stores a frozen snapshot of the Recipe used when the Project began.

## Harvest Profile

A Harvest Profile is Crafting Core metadata associated with a source Actor. It describes inferred anatomy, rarity pools, an Essence pool, and optional Pinpoint Overrides. The source Actor and source Compendium remain read-only.

# 3. Where to find Crafting Core

## Item Directory

For a GM, Crafting Core adds launcher controls to the Item Directory.

- **Crafting Core** opens the main GM application.
- **Generate** opens Generate Materials directly.

## Main GM application

The main application contains two top-level workspaces:

- **Drafts** - private Recipe authoring;
- **Knowledge Base** - authoritative published sources from Learn Sources.

The sidebar also exposes Materials, Generate, Scanner, and Open Compendium actions.

## Game Settings

Open Foundry's Game Settings and locate Crafting Core.

The module presents:

- **Support the Creator** with a Buy Me a Coffee button;
- **Configure Crafting Core** for scanner and Token Harvest configuration;
- **More from Hammer-PvP**, highlighting complementary Foundry VTT modules.

## Character Sheet

D&D5e Character Sheets receive a **Crafting** tab. The tab contains that Character's learned Recipes and active crafting state.

# Part I - GM Recipe Authoring

# 4. Drafts and the Recipe Builder

## Draft philosophy

Drafts are safe authoring records. A GM can edit a Draft for as long as needed without changing what players currently know.

The normal authoring flow is:

1. create or open a Draft;
2. make changes;
3. click **Save Draft**;
4. when ready, click **Publish to Private Compendium** or **Update Published Source**.

In v0.1.0, the Publish action sits in the Builder footer beside Save Draft so the two-step authoring flow is visually explicit.

## Deleting a Builder Draft

Deleting a Builder Draft only removes the private workbench record. It does **not** remove an already published Knowledge Source and does not make Characters forget the Recipe.

If the published source still exists, the GM can later open it from Knowledge Base and use **Edit as Draft** to rebuild an editable Draft from the authoritative Compendium definition.

# 5. Recipe identity and Crafting Mode

Every Recipe starts with its identity and execution mode.

## Name

The Recipe name is the player-facing and GM-facing name used throughout Crafting Core.

Renaming does not replace the stable Recipe identity.

## Crafting Mode

### Timed / Seconds

Timed Recipes use a duration in seconds. They are useful for small transformations, quick brewing, assembly, or any craft that should resolve with synchronized real time rather than rest cycles.

Closing and reopening the Character Sheet does not reset the synchronized timer.

### Crafting Project

Project Recipes use persistent Work Periods, rest-based opportunities, optional progress checks, optional Extra Effort, and optional Final Crafting Checks.

Use Projects when the craft should matter over multiple work sessions or adventuring days.

## Recipe image and description

The Recipe can store an image and Additional Description. Player Visibility determines whether the description is visible to players.

# 6. Proficiency and crafting access

A Recipe can define up to two relevant proficiencies. These can be Skills or Tool proficiencies.

Examples include:

- Arcana;
- Survival;
- Smith's Tools;
- Alchemist's Supplies;
- Arcana + Calligrapher's Supplies.

## Multiple proficiencies

When two are selected, the GM chooses whether:

- **Any one qualifies**; or
- **Both are required**.

## Who can attempt

- **Anyone** - lack of proficiency does not block the craft.
- **Requires relevant proficiency** - the Character must satisfy the configured proficiency rule.

## If proficient

The GM can determine whether a qualifying proficient crafter:

- rolls normally; or
- receives automatic final success when the configured policy applies.

Crafting eligibility is separate from Learning Access. A Character may be allowed to learn a difficult Recipe without yet being qualified to craft it, or learning can be configured to follow crafting eligibility.

# 7. Final Crafting Check

A Final Crafting Check is the final validation before the output is created.

When enabled, the GM selects:

- Ability Check;
- Skill;
- Tool;
- Saving Throw;
- DC.

Crafting Core uses native D&D5e rolls.

## Timed Recipe failure

A failed final check ends the Timed attempt. The Recipe can optionally lose materials according to the configured policy.

## Project final failure

A Project can use one of three final-failure consequences.

### Stay Ready

The Project remains at its completed progress and waits for another compatible Final Check opportunity.

### Regress Project

The Project loses the configured amount of Work Progress.

### Fail Project

The Project ends. Reserved materials are returned except for any explicitly configured failure loss.

# 8. Ingredients and output

## Items Consumed

Drop any D&D5e Item into the ingredient area and set its required quantity.

Crafting Core does not restrict Recipes to the curated Materials Compendium.

The Ingredient Resolver can aggregate equivalent stacks, which means two separate embedded stacks of the same stable material can satisfy one Recipe together.

## Crafted Item

Drop the final D&D5e Item into the output area and set the output quantity.

Crafting Core freezes the complete output Item snapshot used by the Recipe. This preserves Activities, Effects, flags, and other Item configuration when the final output is created.

This makes Crafting Core naturally compatible with custom Items authored by other tools, including Item Creator, because the crafted output reproduces the Item snapshot rather than rebuilding a simplified approximation.

# 9. Player Visibility

The GM independently controls what the player can see. Hidden values remain stored and enforced.

Visibility can cover information such as:

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
- material-loss percentages;
- Extra Effort;
- Extra Effort Check and DC;
- Final Crafting Check and DC;
- Final Failure Consequence;
- Additional Description.

This supports both transparent crafting systems and discovery-oriented systems where some risks or requirements remain hidden.

# Part II - Knowledge Base and Learning

# 10. Publishing a Knowledge Source

The lower Knowledge Source block of the Recipe Builder configures the Item that will be published.

## Source Type

Choose:

- Recipe;
- Formula;
- Blueprint;
- Manual.

The label affects presentation, not the stable Recipe identity.

## Custom Item Name

The GM may override the generated Knowledge Source Item name.

## Knowledge Source Image

The published knowledge Item can use an image separate from the Recipe's normal presentation image.

## Rarity and price

The Knowledge Source inherits rarity from the crafted output. Its price follows Crafting Core's D&D5e magic-crafting cost progression. Legendary Knowledge Sources use 100,000 gp.

## Save Draft versus Publish

These actions are intentionally different.

### Save Draft

Stores the current private authoring state only.

Characters continue using the currently published definition.

### Publish to Private Compendium

Creates the authoritative Knowledge Source in **Crafting Core - Learn Sources**.

### Update Published Source

Updates the existing authoritative source in place. Crafting Core re-reads the Compendium after the write and verifies the persisted result instead of assuming that the return value of a Foundry document API proves success.

# 11. The Knowledge Base

The **Knowledge Base** workspace is a management view over the Learn Sources Compendium.

It shows the published authority, including:

- stable Recipe ID;
- source type;
- publication state;
- current published definition;
- whether an editable Draft exists or has pending unpublished changes.

## Edit as Draft / Continue Editing

If a Draft already exists, **Continue Editing** opens it.

If the Draft was previously deleted, **Edit as Draft** recreates a Draft from the published Compendium source while preserving the same stable Recipe ID.

Opening a published source for editing does not unpublish it and does not change players immediately.

## Open Published Item

Opens the real Item stored in Learn Sources.

## Unpublish

Unpublish is a global destructive action. The confirmation requires the GM to type **I AGREE** before the operation is enabled.

When confirmed:

- the authoritative Learn Sources Item is removed;
- Characters who know that stable Recipe forget it;
- ordinary distributed copies become orphaned and can no longer teach the Recipe;
- the Builder Draft can remain available for future editing and republication;
- already-started Projects remain intact because they use frozen Project snapshots.

Republishing the Draft later does **not** automatically reteach the Recipe to Characters who previously forgot it.

# 12. Learning a Recipe

Published Knowledge Sources contain a **Learn Recipe** Activity.

The GM can distribute a source through normal Foundry gameplay:

- drag directly from Learn Sources to an Actor;
- drag from Learn Sources to the World Item Directory and later to an Actor;
- put it in loot or a chest;
- place it in a vendor or Supplier workflow;
- use any other Item distribution path that preserves the Crafting Core knowledge flags.

Both direct Compendium and World Item intermediary paths are supported.

## Learning Access

### Anyone Can Learn

The Character may learn regardless of the Recipe's crafting proficiency eligibility.

### Follow Crafting Eligibility

Learning checks the same relevant-proficiency rule used by the Recipe's crafting access.

If the Character does not qualify:

- learning is rejected;
- the Knowledge Source is not consumed;
- the result dialog explains the failure without revealing hidden information forbidden by Player Visibility.

## Duplicate learning

A Character cannot learn the same stable Recipe twice, even if the physical copies came through different Foundry document paths.

## Outdated and orphaned copies

A genuinely old distributed copy can be rejected when it belongs to an older published revision. A copy whose authoritative source no longer exists is orphaned and cannot teach the Recipe.

# 13. Updating Recipes Characters already know

When the GM publishes an updated definition:

- Characters who already know the Recipe keep knowing it;
- the learned derived definition is refreshed from the authoritative publication;
- the player does not need to use Learn Recipe again;
- future crafts and future Projects use the updated definition.

If a player is currently looking at an older selected Recipe view, Crafting Core avoids silently performing a transaction from stale information. Before Craft or Start Project proceeds, the UI can refresh the current Recipe and require the player to review the new definition before clicking again.

# 14. Unlearn Recipe

A Character owner or GM can forget a learned Recipe from the selected Recipe header in the Crafting tab.

The compact **Unlearn** action uses a confirmation dialog with an **I agree** checkbox. The destructive confirmation button remains disabled until the checkbox is selected.

Crafting Core verifies persisted Actor state before reporting success.

## Active Project protection

A Recipe cannot be manually forgotten while that same Recipe has an active Project requiring its knowledge state.

The compact Unlearn button is disabled and explains why.

## Learning again later

After Unlearn succeeds, the Character may learn a valid copy of the Recipe again later.

# 15. Startup reconciliation and authority

The Learn Sources Compendium is the source of truth for published knowledge.

Crafting Core uses startup reconciliation to repair derived state when needed. This includes removing ghost learned Recipe IDs left behind when an authoritative source no longer exists.

This rule is important:

> If internal caches, Actor-derived copies, and the Learn Sources Compendium disagree about whether a Recipe is officially published, the Compendium wins.

# Part III - Character Crafting

# 16. The Character Crafting tab

The Crafting tab shows learned Recipes for that Actor.

## Known Recipes list

The list can show craftable counts when Player Visibility allows them.

## Selected Recipe

The main panel displays only the information the GM has chosen to reveal.

Possible information includes:

- output;
- ingredients and available quantities;
- proficiency requirements;
- timing or Project cadence;
- checks and DCs;
- failure consequences;
- Additional Description;
- active Project state.

# 17. Timed crafting

A Timed Recipe runs against synchronized Foundry time.

General flow:

1. the player selects the Recipe;
2. eligibility and materials are validated;
3. the craft starts;
4. the interface shows progress;
5. the frozen output snapshot is created when the craft completes successfully.

Closing and reopening the sheet does not reset the timer.

# Part IV - Crafting Projects

# 18. Starting a Project

Starting a Project:

1. validates Recipe knowledge and eligibility;
2. validates required inventory;
3. removes required materials from ordinary inventory;
4. stores reserved material snapshots inside the Project;
5. stores a complete frozen Recipe snapshot;
6. immediately performs the first normal Work Attempt.

A rest is not required before the first Work Attempt.

Crafting Core supports one active Project per Actor in the current stable foundation.

# 19. Reserved materials

Reserved materials cannot be spent by another craft while the Project is active.

This also isolates the Project from later Recipe edits.

## Cancel Project

Canceling returns all still-reserved materials to the Actor.

## Project failure

If a Project failure rule loses a configured percentage of reserved materials, the remaining reserved materials are returned.

# 20. Work Periods and cadence

## Required Work Periods

This is the amount of successful Project progress needed to reach completion.

## Cadence

### Long Rest

Only a Long Rest unlocks the next normal Work Attempt.

### Short Rest

A Short Rest or Long Rest unlocks the next normal Work Attempt.

## Rest never adds progress

A rest only unlocks the next opportunity. It never increments Project progress automatically.

# 21. Progress Checks

Progress Checks are optional.

When disabled, a normal Work Attempt can advance the Project automatically according to the Recipe rules.

When enabled, the GM chooses:

- check timing;
- Ability / Skill / Tool / Saving Throw;
- DC;
- failure consequence.

## Timing

- **Every Work Period**
- **Midpoint Only**

## Failure consequences

### No Progress

The Work Attempt is spent but no progress is gained.

### Regress Progress

The Work Attempt is spent and the Project loses configured progress.

### Fail Project

The Project ends and material-loss policy is resolved.

# 22. Extra Effort

Extra Effort is an optional second attempt in a Project cycle.

After a normal Work Attempt, a Recipe may expose one Extra Effort opportunity.

The GM configures:

- Ability / Skill / Tool / Saving Throw;
- DC;
- progress gained on success;
- optional **Lose Progress on Failure**;
- amount of progress lost if that penalty is enabled.

A failed Extra Effort always spends the Extra Effort opportunity and grants no extra progress. It does not reserve or consume the ingredients again.

If the player rests without using the available Extra Effort, that old Extra Effort opportunity expires. The new rest cycle first unlocks the next normal Work Attempt.

# 23. Final Project validation

When required progress is reached:

- a Project without a Final Crafting Check can complete according to its Recipe rules;
- a Project with a Final Check enters the configured final validation flow.

Final failure can:

- Stay Ready;
- Regress Project;
- Fail Project.

# 24. Frozen Project snapshots

An active Project is intentionally insulated from Knowledge lifecycle changes.

If the GM updates or unpublishes the Recipe after a Project starts:

- the Project keeps its frozen start-time definition;
- its reserved materials remain valid;
- it can still be completed or cancelled;
- future new crafts use the current published definition, if one exists.

This prevents a GM balance edit from rewriting work already performed by a Character.

# Part V - Materials

# 25. Materials Compendium

Crafting Core manages a private world Item Compendium named **Crafting Core - Materials**.

The v0.1.0 curated catalog contains **229** built-in materials:

- 92 Creature Harvest materials;
- 11 Essences;
- 77 Gathering materials;
- 49 Profession & Trade materials.

The catalog includes creature components, flora, roots, fungi, wood and resin, wild foraging, minerals and geological resources, Game Hunt resources, cultivated/domestic goods, food/cooking materials, metalworking materials, leatherworking materials, alchemy materials, gemcutting/crystal materials, and general crafting goods.

## Native Item representation

Materialized Crafting Core materials are normal D&D5e Items:

- Item type: Loot;
- Loot subtype: Trade Good.

Curated materials reference Foundry Core icon paths. Crafting Core does not bundle Foundry Core artwork.

# 26. Material Catalog screen

The Material Catalog is the GM management interface for curated and registered materials.

Common actions include:

- **Sync Catalog**;
- **Open Compendium**;
- **Reset to Curated Defaults**;
- register an existing D&D5e Item;
- search/filter materials;
- edit material metadata;
- choose among native Core icon candidates.

## Sync versus Reset

**Sync Catalog** is intended to preserve GM customization where supported.

**Reset to Curated Defaults** deliberately restores shipped built-in defaults while preserving custom registered materials according to the module's reset rules.

# 27. Stable material stacking

Foundry creates new embedded Item IDs when Items are copied into Actors. Crafting Core therefore does not use the embedded Actor Item UUID as material identity.

Crafting Core materials carry stable material metadata.

Supported incoming Crafting Core material flows can consolidate equivalent material into an existing compatible stack.

## Container context

Equivalent materials are only consolidated when their container context is compatible. Crafting Core does not move a material between containers merely to merge quantities.

## Legacy duplicate stacks

v0.1.0 does not perform a destructive migration of old duplicate stacks. Existing duplicates remain valid, and the Ingredient Resolver can aggregate them when evaluating or consuming a Recipe requirement.

# Part VI - Creature Scanner and Harvest Profiles

# 28. Creature Scanner

The Creature Scanner reads configured Actor sources and creates or updates Crafting Core Harvest Profiles.

Source Actors and source Compendiums remain read-only.

The Scanner uses configured source priority and analyzes D&D5e Actor data to infer useful anatomy and harvest context.

Profiles can be searched, filtered, edited, reanalyzed, or deleted without deleting their source Actors.

# 29. Harvest Profile structure

## Inferred Anatomy

The analyzer stores anatomy tags and reasoning. The GM can edit the inferred tags before saving.

## Rarity Pools

Automatic Creature Harvest uses rarity pools:

- Common;
- Uncommon;
- Rare;
- Very Rare / Legendary.

Each pool has:

- one Pool Chance;
- zero or more candidate materials.

When a pool succeeds, exactly one candidate is selected. More candidates increase variety, not the number of automatic drops from that pool.

## Essence Pool

The fifth automatic pool is reserved for Essence logic.

Actors with relevant elemental or energetic affinity can produce either:

- a specific supported Essence; or
- Arcane Essence.

The distribution is designed so Arcane Essence remains common in the long run while each individual specific Essence stays relatively scarce.

Actors without a relevant affinity use the Arcane/no-Essence fallback behavior.

## Pinpoint Overrides

Pinpoint Overrides are explicit GM-authored extra rolls for unique bosses, quests, or special materials.

They are separate from the automatic rarity-pool limit and can define material, chance, and quantity.

# Part VII - Token Harvest and Existing NPC Loot

# 30. Token Harvest

Crafting Core can harvest eligible dead Tokens.

General flow:

1. resolve the Token's Harvest Profile;
2. roll rarity pools;
3. resolve Essence;
4. resolve Pinpoint Overrides;
5. handle existing NPC Items according to Token Harvest settings;
6. materialize the result, optionally through Item Piles.

Crafting Core owns the harvesting rules. Item Piles is a physical destination integration.

# 31. Existing NPC Loot settings

Crafting Core Settings provides modes for how existing NPC Items are handled during corpse harvesting.

Available strategies include:

- **Normalize from Compendiums**;
- **Remove All Existing Items**;
- **Keep Physical Gear / Remove Natural & Features**;
- **Keep All Existing Items**.

Normalize mode uses configured Item Compendium priority and deliberately avoids dangerous fuzzy matching for unique monster gear.

An optional homebrew behavior can replace detected firearms with a random crossbow category resolved from the configured normalization sources.

# Part VIII - Generate Materials

# 32. Generate Materials overview

Generate Materials is the GM-facing resource-generation tool for situations that are not tied directly to a specific corpse Token.

It uses a preview-first model:

1. configure the generation request;
2. generate a preview;
3. inspect the exact result;
4. materialize that accepted result without rerolling.

# 33. Manual Creature Harvest

Manual Creature Harvest lets the GM generate harvest results without requiring a specific Token.

The interface can combine Creature Types, compatible Harvest Profiles, source/body count, and Essence context.

Use this when the narrative has a creature source but the normal Token Harvest workflow is not appropriate.

# 34. Environment Gathering

Environment Gathering is an abstract GM generation tool.

The GM selects combinations of:

- Biomes;
- Resource Categories;
- Abundance bands;
- Gather Attempts.

Biomes and Resources broaden the candidate pool. Selecting more compatible contexts does not multiply loot linearly; Attempts remain the primary control for how many opportunities are resolved.

Crafting Core does not require an internal gathering skill roll. The GM may resolve narrative checks elsewhere and use the generator to materialize the resource result.

# 35. Game Hunt

Game Hunt represents abstract hunting rather than harvesting a specific monster Actor.

The GM configures compatible Biomes, Abundance, and Hunt Attempts.

Game Hunt materials are real Items in the Materials Compendium and can be consumed by Recipes like any other material.

# 36. Preview destinations and Item Piles

After generation, the Preview lists each Item and quantity.

Possible actions include:

- Generate Again;
- create a World Item loot folder;
- create a Hidden Item Pile at Scene center when Item Piles is available;
- drag the generated preview onto the Scene to create a Hidden Item Pile at the exact drop position.

Generated Item Piles are hidden by default so the GM can prepare the result before revealing it to players.

# Part IX - Settings, support, and module ecosystem

# 37. Configure Crafting Core

The GM-only configuration screen manages settings such as:

- Creature Scanner Actor sources and priority;
- Token Harvest existing-loot behavior;
- normalization Item Compendium sources and priority;
- optional firearm normalization behavior.

These settings are functional configuration and are deliberately separate from creator support.

# 38. Support the Creator

The main Game Settings entry for Crafting Core places **Support the Creator** immediately above **Configure Crafting Core**.

The Buy Me a Coffee button opens:

https://buymeacoffee.com/hammer.pvp

Keeping the support block outside the functional settings application saves configuration space and creates a consistent location that can be reused across Hammer-PvP modules.

# 39. More from Hammer-PvP

Crafting Core is part of a growing family of Foundry VTT tools designed to complement one another.

The Game Settings entry highlights:

- DnD 5e Character Builder;
- DnD 5e Item Creator;
- DnD 5e Currency Manager;
- Enhanced Audio Player.

These modules remain independent; Crafting Core does not require them. The purpose of the block is discovery: for example, Item Creator can provide mechanically rich Items that Crafting Core then reproduces as crafted outputs, while other modules cover adjacent character, economy, or table-management needs.

# Part X - Result dialogs and feedback

# 40. Crafting result messages

Important outcomes use centered Crafting Core dialogs rather than relying only on transient notifications.

Examples include:

- Work Period success or failure;
- Project regression or failure;
- Extra Effort success or failure;
- Final Check outcomes;
- successful craft completion;
- learning rejection;
- Recipe Forgotten.

The exact facts shown are filtered through Player Visibility so hidden DCs, requirements, or penalties are not leaked.

# Part XI - Practical workflows

# 41. Example: simple Timed Recipe

Goal: convert two components into one output after a short timer.

1. Open Crafting Core.
2. Create a new Recipe Draft.
3. Set Crafting Mode to Timed / Seconds.
4. Set the crafting duration.
5. Drop the required Items into Items Consumed and set quantities.
6. Drop the output Item into Crafted Item.
7. Configure proficiency/final check rules if desired.
8. Configure Player Visibility.
9. Configure the Knowledge Source type.
10. Click Save Draft.
11. Click Publish to Private Compendium.
12. Distribute the Knowledge Source to the Character.
13. Use Learn Recipe.
14. Select the Recipe in the Character Crafting tab and craft it.

# 42. Example: multi-rest Project with Extra Effort

Goal: a difficult craft requiring four Work Periods and optional extra work.

1. Set Crafting Mode to Crafting Project.
2. Set Required Work Periods to 4.
3. Choose Long Rest or Short Rest cadence.
4. Enable Progress Checks if desired.
5. Configure the Progress Check and DC.
6. Choose the failure consequence.
7. Enable Extra Effort.
8. Configure the Extra Effort check and DC.
9. Set progress gained on Extra Effort success.
10. Optionally enable Lose Progress on Failure.
11. Configure a Final Crafting Check if desired.
12. Save Draft and publish.
13. Teach the Recipe.
14. Start the Project. The first normal Work Attempt happens immediately.
15. Use Extra Effort if available.
16. Rest to unlock the next normal Work Attempt.
17. Continue until the required Work Periods are reached.
18. Resolve the Final Check if required.
19. On success, the frozen output snapshot is added to inventory.

# 43. Example: edit a published Recipe safely

1. Open Knowledge Base.
2. Select the published Recipe.
3. Click Edit as Draft or Continue Editing.
4. Change ingredients, quantities, duration, visibility, checks, or output as needed.
5. Click Save Draft.
6. Characters continue using the old published definition.
7. Review the changes.
8. Click Update Published Source in the Builder footer.
9. Characters who already know the Recipe receive the new published definition.
10. Active Projects continue using their frozen old snapshot.

# 44. Example: delete a Draft without unpublishing

1. Publish a Recipe.
2. Delete Builder Draft.
3. Confirm that the source remains in Knowledge Base and Learn Sources.
4. Characters continue knowing the Recipe.
5. Select the published source in Knowledge Base.
6. Click Edit as Draft.
7. Crafting Core recreates a Draft from the authoritative published source.

# 45. Example: Unpublish and republish

1. Open Knowledge Base.
2. Select a published Recipe.
3. Click Unpublish.
4. Type I AGREE and confirm.
5. The authoritative source is removed.
6. Characters forget the Recipe.
7. Existing active Projects remain available through their frozen snapshots.
8. Keep or edit the remaining Builder Draft.
9. Publish again later if desired.
10. Characters who previously forgot the Recipe do not relearn it automatically; distribute a valid Knowledge Source again.

# Part XII - Troubleshooting and FAQ

# 46. A Character still knows a Recipe after its source was deleted

v0.1.0 startup reconciliation treats Learn Sources as the authority. If an old world contains ghost learned Recipe IDs from a previous build, the active GM reconciliation removes those orphaned entries.

If the problem remains, confirm that the source was actually removed from **Crafting Core - Learn Sources** and review the console for reconciliation errors.

# 47. The Character cannot learn a Knowledge Source

Check:

- whether the Character already knows the same stable Recipe;
- whether Learning Access follows crafting eligibility;
- whether the copy is outdated;
- whether the authoritative source still exists;
- whether the Item still contains the Crafting Core Learn Recipe Activity and flags.

A rejected eligibility attempt should not consume the Knowledge Source.

# 48. A published edit did not affect an active Project

This is expected. Projects intentionally freeze their Recipe definition at Project start.

The updated publication affects future crafts and Projects, not work already in progress.

# 49. Deleting a Builder Draft did not make players forget

This is expected. Builder Drafts are private authoring records.

Use **Unpublish** from Knowledge Base to remove the authoritative publication and make Characters forget it.

# 50. Republishing did not make a Character know the Recipe again

This is expected. Publication and Character knowledge are separate states.

After Unlearn or Unpublish removed the knowledge, distribute a valid Knowledge Source and use Learn Recipe again.

# 51. Two material stacks have different Actor Item IDs

This is normal Foundry behavior. Embedded document IDs are not Crafting Core material identity.

Crafting Core uses stable material metadata and can aggregate equivalent stacks for Recipe requirements.

# 52. A generated Item Pile is hidden

This is intentional. Generated piles are hidden by default so the GM can place and prepare them before revealing them to players.

# Part XIII - Quick reference and support

# 53. Knowledge lifecycle quick reference

**Draft:** private editing state.

**Save Draft:** save only the private editing state.

**Publish:** create the authoritative Learn Sources Item.

**Update Published Source:** make current Draft changes live.

**Knowledge Base:** manage actual published Learn Sources Items.

**Learn Recipe:** teach one stable Recipe to a Character.

**Unlearn:** remove that Character's learned Recipe after checkbox confirmation.

**Unpublish:** remove the global authoritative source after typed I AGREE confirmation and remove the Recipe from Characters.

**Delete Builder Draft:** delete private editing state only.

**Project snapshot:** immutable craft definition for an already-started Project.

# 54. Core managed Compendiums

- **Crafting Core - Materials**
- **Crafting Core - Learn Sources**
- **Crafting Core - Products** (created when the Curated Culinary library is installed with Item Creator active)

All are GM-managed private world libraries. Materials and Learn Sources remain core stores; Products is the distribution library for ready-to-buy/use Curated final Items.

# 55. Documentation and project links

Repository:

https://github.com/hammer-PvP/Crafting-Core-DnD-5e

Complete Manual:

https://github.com/hammer-PvP/Crafting-Core-DnD-5e/blob/main/docs/Crafting-Core-Complete-Manual-v0.2.0.pdf

Issues:

https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues

Buy Me a Coffee:

https://buymeacoffee.com/hammer.pvp

# 56. More from Hammer-PvP

- DnD 5e Character Builder
- DnD 5e Item Creator
- DnD 5e Currency Manager
- Enhanced Audio Player

Crafting Core is designed to remain useful by itself. These modules are optional companions that can extend adjacent parts of the Foundry VTT workflow.

# 57. Release philosophy

v0.1.0 remains the frozen stable mechanical foundation. v0.2.0 builds on that foundation by adding official content and a Product distribution layer without reopening the validated Recipe/Knowledge/Project lifecycle.

Future feature work should continue to build outward from this foundation rather than rewriting the stable Knowledge lifecycle without a specific regression or design reason.

# Part XIV - Curated Content

# 58. Curated Culinary Library

v0.2.0 introduces the first official Crafting Core Curated Content library. It contains fifteen Common culinary Recipes built from the existing canonical Materials catalog. No new generic ingredients such as "Common Meat" or "Common Herbs" are introduced.

The library is divided evenly into:

- 5 Dwarven Cuisine Recipes;
- 5 Elven Cuisine Recipes;
- 5 Common Cuisine Recipes.

Each culture contains two Hearty Meals, two Energizing Meals, and one Complete Meal.

## Meal benefits

**Hearty Meal** grants 5 Temporary Hit Points.

**Energizing Meal** grants +5 ft Walking Speed until the next Long Rest.

**Complete Meal** grants both benefits.

These effects are intentionally small. The food library is meant to stay relevant as repeatable low-impact adventuring preparation rather than compete with Potions, Elixirs, Spells, or higher-rarity magic consumables.

All fifteen official Products and Recipes are Common.

# 59. Products Compendium and Item Creator

When DnD 5e Item Creator 0.7.1+ is active, the active GM synchronizes the official Product library into the private **Crafting Core - Products** world Compendium. The Products are grouped under Culinary and then by culture.

The Products are not generic placeholder Items. They carry the same runtime identity that Item Creator v0.7.1 expects for managed Consumables:

- `flags.dnd5e-item-creator.created = true`;
- schema version 17;
- `itemType = consumable`;
- a managed Consume Activity flagged `consumableUse`;
- `runtime.consumable` duration/stacking configuration;
- persistent movement effects stored as `consumableBlueprint` Active Effects.

Crafting Core does not implement a competing duration engine. Item Creator applies and removes the persistent movement benefit.

Hearty/Complete meals use a native D&D5e Heal Activity with temporary-hit-point healing. Complete Meals use that same managed activity and also carry the Item Creator movement blueprint.

All official movement meals share the runtime source key `crafting-core:culinary:movement-benefit` with replacement stacking. Consuming another official movement meal therefore replaces the existing official culinary movement benefit instead of accumulating +10, +15, or +20 ft.

If Item Creator is not active, Crafting Core itself still loads and all stable v0.1.0 systems remain available, but the Curated Culinary library is not installed/synchronized.

# 60. Curated Recipe Knowledge Sources

Each Product has a matching official Recipe source in **Crafting Core - Learn Sources**.

All fifteen culinary Knowledge Sources are:

- Source Type: **Recipe**;
- Rarity: **Common**;
- Icon: `icons/sundries/documents/document-gold.webp`;
- linked to a stable official Recipe ID;
- grouped under Recipe -> Crafting Core Curated -> Culinary -> culture.

The source contains the Recipe snapshot, including canonical Materials and the final Product snapshot. It therefore follows the same validated Learn Recipe flow as GM-authored content.

Deleting an official Product or Recipe Source is remembered as a GM suppression. A normal startup does not blindly recreate a deliberately removed official record. The GM API exposes Curated sync/restore methods when the official library needs to be restored.

# 61. Culinary Products and Supplier metadata

Curated Products carry metadata intended for vendor discovery and future Supplier profiles:

- category: `culinary`;
- subcategory: `meal`;
- culture: `dwarven`, `elven`, or `common`;
- rarity: `common`;
- meal type: `hearty`, `energizing`, or `complete`;
- stable Product ID;
- stable Recipe ID;
- curated/source identity;
- up to three native Foundry icon candidates.

The 229-material catalog is not expanded or reclassified by this release. Instead, Products form a separate commercial layer. For Supplier analysis, the v0.2.0 portable catalog exposes 229 Materials + 15 Products = 244 material/product stock entries, with the 15 Recipe Knowledge Sources available as a separate recipe-selling pool.

The official content handoff did not specify exact menu price or crafting time. v0.2.0 therefore uses implementation defaults pending live approval: 5 sp and 10 minutes for Hearty/Energizing Meals, and 1 gp and 20 minutes for Complete Meals. These defaults can be revised in a later content version without changing the stable Crafting Core engine.

## Official Recipe list

### Dwarven Cuisine

- Forge Stew - Hearty - Basic Wild Boar Meat, Potato, Carrot
- Hot-Stone Ribs - Hearty - Basic Deer Meat, Salt, Seasonings
- Khaz Marchbread - Energizing - Flour, Barley, Honey
- Miner's Hand Pie - Energizing - Flour, Bitter Fungus, Basic Wild Boar Meat
- Hot-Stone Feast - Complete - Basic Wild Boar Meat, Potato, Bitter Fungus, Bread

### Elven Cuisine

- Silverdew Fruits - Hearty - Apple, Grapes, Honey
- Stillleaf Broth - Hearty - Elvenleaf Herb, Common Root, Bitter Fungus
- Lightleaf Cakes - Energizing - Flour, Honey, Elvenleaf Herb
- Greenway Salad - Energizing - Cabbage, Apple, Elvenleaf Herb
- Table of the Star Roads - Complete - Apple, Grapes, Honey, Elvenleaf Herb

### Common Cuisine

- Roadside Stew - Hearty - Basic Hare Meat, Potato, Carrot
- Farmer's Pie - Hearty - Flour, Basic Game Bird Meat, Potato
- Messenger's Bread - Energizing - Bread, Honey, Apple
- First Bell Eggs - Energizing - Eggs, Bread, Seasonings
- Adventurer's Breakfast - Complete - Eggs, Basic Game Bird Meat, Bread, Potato

