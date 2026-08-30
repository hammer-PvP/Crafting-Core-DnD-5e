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
- crafting mode: real-time seconds or rest-gated Project Work Periods;
- optional Progress Check and Final Crafting Check policies, including Project regression/failure consequences;
- Knowledge Source presentation type: Recipe / Formula / Blueprint / Manual.

Any D&D5e Item can be an input or output. There is no exclusive Ingredient Item or Product Item type.

### 2. Published Knowledge Source

A finished draft is published into the private **Crafting Core — Learn Sources** Compendium. The published Consumable contains the full recipe snapshot, not only a pointer to the Builder draft. **The Compendium source is the authoritative publication record for that stable Recipe ID.**

The GM application's **Knowledge Base** is not a second database. It is an administrative view over the actual Learn Sources Compendium. It can open the published Item, unpublish it, or load its snapshot back into the Recipe Builder. If the Builder draft was deleted, **Edit as Draft** reconstructs an editable draft from the Compendium while preserving the stable Recipe ID.

Therefore a published source remains valid if the Builder draft is deleted. Republishing a retained or reconstructed draft updates the same managed Compendium Item in place when possible, preserving its UUID while replacing its managed Recipe snapshot and canonical `Learn Recipe` Activity. Publication success is verified by re-reading the persisted Compendium state rather than relying on the return shape of Foundry's document update call.

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

When `Learn Recipe` completes, the Character records that stable Recipe ID and keeps a normalized Recipe snapshot as a **materialized read copy**. That Actor snapshot is necessary because Players may not have permission to read the private Learn Sources Compendium directly; it is not a second authority. The authoritative definition remains the published Compendium source.

Knowledge intentionally belongs to the Actor rather than the Foundry User. A replacement Character does not inherit a dead Character's recipes. Multiple Characters can learn the same source if multiple valid copies are acquired. If the GM republishes a revision under the same stable Recipe ID, Actor read snapshots are refreshed **from the persisted Compendium snapshot**, not from the Builder draft. Startup reconciliation repeats this derivation when required.

Distributed Recipe / Formula / Blueprint / Manual Items are teaching copies, not authorities. A copy is valid only while its Recipe ID is published and its stored snapshot matches the current published revision. An outdated copy is blocked before consumption. Deleting the authoritative Compendium source makes all remaining copies orphaned and removes that learned Recipe from Characters.

A Character may manually **Unlearn Recipe** with explicit confirmation. Manual unlearning is blocked while that Character has an active Crafting Project for the same Recipe. Unpublishing is different: learned knowledge is removed even when a Project exists, because the Project already owns an independent frozen snapshot.

v0.0.3 migrates legacy recipe-ID-only knowledge from v0.0.1/v0.0.2 into this self-contained Actor format whenever the referenced legacy draft still exists.

## Player interface

Players do not receive a standalone Crafting Core administration application.

The GM application separates **Drafts** (private authoring state) from **Knowledge Base** (published Compendium state). A draft may show `Draft only`, `Published · Up to date`, or `Published · Changes pending`. Saving a draft never alters the published source; only Publish / Update Published Source changes Learn Sources.

The module adds a `Crafting` tab to the official D&D5e Character Sheet after `Effects`. It reads the derived Recipe snapshots stored on that Actor, checks live Item quantities and shows `N×` crafts possible in the left Recipe list. The right-hand profession workspace presents the selected Recipe or active Project.

Recipes with zero possible crafts remain selectable so the player can inspect missing materials. While one Project is active, other Recipes remain inspectable for planning but cannot be started.

## Crafting transaction

The active GM is authoritative.

### Timed Recipes

1. Player requests a craft from the Character Sheet.
2. Active GM validates ownership, learned recipe, configured final check and current inventory.
3. Requirements are consumed at job start.
4. Crafting progress is based on synchronized server time.
5. At completion, the frozen output snapshot is embedded into the Character inventory.

Closing/reopening the sheet does not reset timed crafting.

### Crafting Projects

1. Player requests **Start Project**. The active GM validates the learned Recipe, proficiency access and required inventory.
2. Required materials are removed from normal inventory and persisted as reserved material snapshots inside one active Actor Project.
3. Starting immediately performs the first Work Attempt. Optional Progress Checks can stall, regress, or fail the Project according to the frozen Recipe policy.
4. A compatible D&D5e rest only unlocks the next Work Attempt; it never increments progress by itself.
5. Reaching the required Work Periods either completes automatically or enters the Final Crafting Check flow.
6. Success creates the frozen output snapshot. Project failure returns reserved materials minus any explicitly configured failure loss. Cancellation returns all still-reserved materials.

The Project stores a complete Recipe snapshot, so later Builder edits, publication revisions, manual knowledge changes, or unpublication do not rewrite an active Project. If the Recipe is unpublished while its Project is active, the Project remains visible and continues from its frozen snapshot until completion or cancellation.

## Private Compendium libraries

Crafting Core creates a top-level **Crafting Core** folder in the Compendium Directory.

Managed packs:

- **Crafting Core — Materials**
- **Crafting Core — Learn Sources**

They are configured for GM-only access. PLAYER, TRUSTED and ASSISTANT roles receive NONE; GAMEMASTER receives OWNER. These libraries are not normal player-facing browsing sources.

A player learns about a material or Knowledge Source only when the GM deliberately exposes an Item through gameplay: Actor inventory, loot, chest, vendor, Supplier, or another permitted workflow.

## Material Catalog

### Curated defaults

The 229 shipped default materials are the **Crafting Core Built-in Curated Catalog**. They are not extracted from installed PHB, DMG, Monster Manual, Tasha or SRD packs.

The catalog is a crafting vocabulary used by future generation systems.

### Native Item representation

Materialized materials are native D&D5e Items:

- `type = "loot"`
- `system.type.value = "trade"`
- curated built-ins reference one of three native Foundry Core `icons/...` candidates; custom/unmapped fallbacks may still use the generic Crafting Core pouch

Any D&D5e Item can still be used directly in a Recipe without registration. Registering an Item as a material simply makes it available to future automated Harvest/Gathering/region/vendor systems.

### Pack organization

**Creature Harvest**
- subfolder for each D&D5e creature type.

**Gathering**
- Flora
- Roots
- Fungi
- Wood & Resin
- Minerals & Geological

Gathering categories are not biome-exclusive. A biome may expose several categories when its material metadata supports them; for example, Forest can contain Flora, Roots, Fungi, Wood/Resin, and selected mineral/crystal deposits.

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

## Harvest roadmap

Manual Creature Harvest and Environment Gathering are implemented in v0.0.4 through the shared generation engine below. Remaining planned order:

1. Actor Compendium Scanner / anatomy analysis producing precise per-creature profiles from the existing curated material catalog.
2. GM pinpoint overrides for quest-specific materials/chances.
3. Token HUD action for eligible dead Tokens.
4. Optional Item Piles integration: Crafting Core rolls the materials, Item Piles only converts/uses the corpse as the physical loot container and receives the result.
5. Region/vendor generation using the same catalog.

Crafting Core works without Item Piles, but Item Piles is planned as the recommended integration for the complete corpse-looting experience.

## v0.0.4 Manual Material Generation

`MaterialGenerationService` is the single material roll engine for manual generation and future token/corpse integration.

### Creature Harvest

Input: creature nature, coarse manual profile, number of sources.

For every source independently:

1. Resolve eligible Creature Harvest materials from the Material Catalog.
2. Apply coarse profile anatomy filtering when configured.
3. Resolve up to four unique candidate slots from the current rarity pools: Common; Common/Uncommon; Rare; Very Rare/Legendary.
4. Roll each selected material's configured drop chance silently.
5. Roll each successful material's configured quantity formula silently.
6. Aggregate duplicate material IDs across all sources.

### Environment Gathering

Input: biome, resource category, abundance.

1. Resolve Gathering materials whose biome metadata contains the chosen biome and whose category matches the chosen resource.
2. Roll each eligible material's configured chance silently.
3. Limit distinct successful material types according to abundance.
4. Roll quantity and apply the abundance quantity factor.
5. Aggregate the result.

The GM resolves any skill check outside Crafting Core. Materials are eligible whether or not a current Recipe consumes them.

### Output sinks

v0.0.4 implements the world-folder sink only: one timestamped subfolder beneath `Crafting Core — Generated Loot`.

Future Item Piles support must reuse `MaterialGenerationService` and replace only the output sink: selected corpse/token -> pile -> generated material Items. Item Piles must not own generation rules.

## v0.0.5 Preview / Destination Boundary

Manual generation is now explicitly split into two phases:

1. `MaterialGenerationService.generate(request)` resolves pools, chances and quantities and returns a pure preview result without world writes.
2. A destination materializes that accepted result. The v0.0.5 manual destination is `createWorldLoot(result)`, which creates a world Item folder. Future Token HUD / Item Piles integration should call the same `generate()` method and provide a corpse/pile destination instead of duplicating generation rules.

This boundary also guarantees that `Create Loot Folder` persists the exact preview the GM saw; materialization must never reroll the request.

## v0.0.6 Five-Tier Rarity / Harvest Slot Foundation

Material rarity is normalized to the D&D5e keys `common`, `uncommon`, `rare`, `veryRare`, and `legendary`. The Material Catalog owns display labels and default economy/chance values for those keys.

Creature Harvest intentionally remains capped at four automatic material candidates per source. `MaterialGenerationService.DEFAULT_HARVEST_SLOTS` defines the default candidate pools:

1. `[common]`
2. `[common, uncommon]`
3. `[rare]`
4. `[veryRare, legendary]`

Each slot selects at most one material and a material cannot be selected twice for the same source. Anatomy/profile filtering happens before slot construction, so a profile may legitimately produce fewer than four candidates when its body plan excludes available materials.

The final high-tier pool is deliberately shared between Very Rare and Legendary in the manual generator. The future Actor Scanner / precise Harvest Profile layer can narrow that slot based on the specific creature without changing the four-slot result contract.

## v0.0.7 — Creature Scanner / Harvest Profiles

Creature source documents are read-only. `HarvestProfileService` scans Actor Compendium indexes, loads eligible NPCs in bounded batches, infers generic anatomy from D&D5e Actor data, and stores per-Actor profiles in the hidden world `harvestProfiles` setting. Profiles reference the source Actor UUID and contain up to four automatic material rows plus zero or more Pinpoint Overrides. Material IDs always point back to the shared Material Catalog.

`MaterialGenerationService.generateHarvestProfile()` is the single profile-roll path reserved for the next Token HUD / Item Piles integration. Item Piles must remain an output sink only; it must not implement a separate loot RNG model.

## v0.0.8 — Analyzer Evidence Hierarchy / Scanner Source Settings

Actor analysis no longer uses one undifferentiated text corpus. `HarvestProfileService` separates evidence into identity, structural features, attack/activity data, equipment, and weak incidental item/spell text. Morphology is inferred from stronger layers first; weak magical language can explain context but cannot independently establish anatomy.

Strong incorporeal classification is reserved for explicit identity or structural features such as `Incorporeal Movement`. Corporeal Undead fall back to physical remains unless strong contrary evidence exists; skeletal identities remain bone-focused. Construct material is likewise evidence-driven rather than defaulting blindly to metal/mechanical.

Creature Scanner source selection is stored in the hidden world `scannerSources` setting and edited through the GM-only Crafting Core settings submenu. Installed module/system sources are grouped at package level and automatically resolve only compatible Actor Compendiums. World Actor Compendiums are exposed individually. Selected order is retained as source priority metadata; complex duplicate-creature reconciliation is intentionally deferred.

Generic family materials may have no anatomy requirements and act as coherent fallback candidates after anatomy-specific materials. v0.0.8 adds Funerary Dust and Necrotic Essence to broaden Undead fallback coverage without introducing fake body tags.

---

## v0.2.0 Curated Content Layer

The v0.1.0 Recipe/Knowledge/Project lifecycle remains the mechanical foundation. v0.2.0 adds an outward content layer rather than a second crafting engine.

### Canonical stores

- `Crafting Core — Materials`: 229 canonical ingredient/material Items.
- `Crafting Core — Learn Sources`: authoritative published Knowledge Items, including 15 official Curated Culinary Recipe sources.
- `Crafting Core — Products`: ready-to-distribute final Curated Products. Created/synchronized only while DnD 5e Item Creator 0.7.1+ is active.
- Curated Recipe definitions live as module data records and are materialized into the normal Learn Sources architecture.

### Item Creator boundary

Crafting Core does not own persistent meal-effect expiration. Curated Products carry the Item Creator v0.7.1 Consumable runtime contract (`created`, schema 17, managed `consumableUse` Activity, `runtime.consumable`, and blueprint effects). Item Creator remains the effect-lifecycle authority.

Temporary HP uses the native D&D5e Heal Activity. Movement uses an Item Creator Active Effect blueprint and `longRest` duration. Every movement-granting official meal shares the source key `crafting-core:culinary:movement-benefit` with `replace` stacking.

### Supplier boundary

Products expose stable Crafting Core metadata (`productId`, category, subcategory, culture, rarity, mealType, curated identity, and icon candidates). Learn Sources retain stable Recipe identity. Supplier can consume the world Compendiums or the portable catalog export without depending on Crafting Core's editor internals.

### Deletion semantics

Official content is synchronized by content version, not rewritten on every startup. Deleting a managed Product or Curated Recipe Source records a suppression in the hidden world setting `curatedContentState`; later startup does not automatically undo the GM's deletion. `game.craftingCore.curated` exposes sync/restore operations for explicit recovery.
