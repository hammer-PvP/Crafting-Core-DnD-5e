# Crafting Core Architecture - v0.1.1

This document describes the current runtime boundaries of Crafting Core. It is intentionally limited to implemented behavior.

## Runtime principles

- GM-authoritative writes for Recipe, crafting, material, scanner, and harvest state.
- D&D5e-native Item documents for ingredients, outputs, materials, and Knowledge Sources.
- The private Learn Sources Compendium is authoritative after publication; Actor knowledge is a synchronized cache. Active Crafting Projects remain frozen snapshots.
- Stable Crafting Core identities for materials; embedded Actor Item UUIDs are not treated as material identity.
- Preview-first material generation.
- Item Piles is an optional destination/container integration, not the authority for Crafting Core generation rules.

## Major services

### RecipeService
Owns Recipe normalization, persistence, proficiency/access configuration, Project configuration, Extra Effort configuration, Player Visibility, and learning eligibility helpers.

### CraftingService
Owns timed crafting and Crafting Project runtime behavior:
- request validation and GM execution;
- ingredient availability and consumption;
- material reservation/return;
- Work opportunities;
- Progress Checks;
- Extra Effort;
- Final Crafting Checks;
- Project failure/cancellation/completion;
- output Item creation;
- player-facing result feedback data.

### KnowledgeItemService
Owns the published Recipe lifecycle: Knowledge Source publication/update, stable authoritative-source identity, Learn Recipe Activities, Actor known-Recipe cache synchronization, distributed-copy synchronization/invalidation, Unlearn Recipe, published-source deletion cleanup, learning eligibility enforcement, and legacy/orphan reconciliation.

### MaterialCatalogService
Owns the 229-entry curated catalog, private Materials Compendium, folder organization, rarity/economy defaults, curated overrides, three-icon curation, custom material registration, synchronization, and curated reset behavior.

### MaterialStackService
Owns forward-only auto-stacking for Crafting Core materials entering Actors through supported flows. Matching is based on stable material identity plus compatible container context. It does not run a legacy duplicate-stack migration.

### MaterialGenerationService
Owns resource-generation math and preview results for:
- Manual Creature Harvest;
- Environment Gathering;
- Game Hunt;
- Harvest Profile resolution used by concrete creature harvest.

Generation returns a result before a destination is chosen.

### HarvestProfileService
Owns scanner sources, Actor analysis, stored Harvest Profiles, rarity-pool migration, anatomy metadata, Essence metadata, and Pinpoint Overrides. Source Actors remain read-only.

### TokenHarvestService
Owns the concrete dead-Token harvest entry point. It requests Crafting Core harvest generation, coordinates existing NPC loot handling, and passes the resolved result to the appropriate destination integration.

### GearNormalizationService
Owns Existing NPC Loot settings and safe physical-item normalization against prioritized Item Compendiums, including the optional firearm-to-crossbow homebrew setting.

### ItemPilesBridge
Owns optional Item Piles boundaries:
- detection of Item Piles availability;
- generated-loot drag/drop payloads;
- creation of Hidden generated piles;
- population of a created pile through Item Piles APIs;
- validation of generated pile contents;
- Token Harvest pile interactions.

Crafting Core remains the authority for generated items and quantities.

### CharacterSheetService
Owns the D&D5e Character Sheet Crafting-tab injection and player actions. It renders known Recipes, craftability, active Project state, and binds Craft/Start/Work/Extra Effort/Final/Cancel/Unlearn actions.

Important result feedback is displayed through ResultDialog after the sheet refresh has completed, preventing the Actor Sheet from stealing foreground focus.

### ResultDialog
A reusable centered Crafting Core DialogV2 presentation for important crafting and learning outcomes. Facts are supplied by the runtime after Player Visibility filtering.

## Persistent data boundaries

### World settings
World settings store:
- Recipe Builder drafts;
- material economy and overrides;
- Harvest Profiles;
- scanner source configuration;
- gear-normalization configuration.

### Actor flags
Actor flags store:
- synchronized known Recipe snapshots plus the authoritative published-source UUID;
- timed crafting state when applicable;
- the single active Crafting Project and its frozen Recipe/material state.

### Private world Compendiums
Crafting Core manages:
- `Crafting Core - Materials`
- `Crafting Core - Learn Sources`

They are GM-oriented libraries. Players receive Items only when the GM deliberately distributes them through gameplay.

For Learn Sources, publication creates the authority boundary. Recipe Builder edits remain local until the GM explicitly updates the Compendium. Updating the authoritative source synchronizes Characters who know that Recipe; deleting it removes that knowledge and invalidates distributed copies. Startup reconciliation can recover/relink Builder entries from existing published sources created under older semantics. A Project already in progress is unaffected because its Recipe snapshot was frozen at project start; the Character Sheet keeps that frozen Project visible even if the published Recipe is removed.

## Crafting Project state machine

A Project is created after access and inventory validation. Required ingredients are reserved and the first normal Work Attempt is resolved immediately.

A compatible rest does not increment progress. It unlocks the next normal Work opportunity.

A normal Work Attempt may:
- succeed and advance;
- fail with no progress;
- fail and regress;
- fail the Project.

If Extra Effort is enabled and the Project survives the normal Work Attempt, one Extra Effort opportunity can become available for that Work Period. Extra Effort uses an independent configured check and never reserves or consumes ingredients again.

At required progress, the Project either completes or enters Final Check behavior. Final failure can stay ready, regress, or fail the Project.

## Material identity and inventory behavior

Crafting Core materials carry a stable material ID. Copies placed on Actors receive normal embedded Item IDs/UUIDs from Foundry, but those embedded UUIDs are not used as Crafting Core material identity.

The Ingredient Resolver can aggregate equivalent stacks. MaterialStackService reduces future duplicate lines in supported incoming flows without rewriting pre-existing legacy stacks.

## UI boundaries

- Main Crafting Core app: Recipe authoring and launchers.
- Materials: curated/custom material management.
- Generate Materials: abstract generation and destinations.
- Creature Scanner: source analysis and Harvest Profile management.
- Harvest Profile Editor: anatomy, rarity pools, Essence, Pinpoints.
- Settings: Scanner sources, Existing NPC Loot normalization, support/feedback links.
- Character Sheet Crafting tab: player workflow.

## External links

Support:
https://buymeacoffee.com/hammer.pvp

Issues:
https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues
