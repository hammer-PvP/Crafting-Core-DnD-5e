# Crafting Core (DnD 5e)

## v0.0.21 — Knowledge Lifecycle Stabilization

v0.0.21 stabilizes the complete Recipe knowledge cycle without changing the validated crafting engine. The private **Crafting Core — Learn Sources** Compendium is now the publication authority: Builder drafts remain editable workbench records, published sources update in place, learned Characters receive published revisions, distributed copies are validated against the current revision, and deleting the authoritative source cleanly unpublishes the Recipe.

The Character Crafting tab deliberately keeps the Recipe revision a player is currently reading. If the GM publishes a newer revision, Crafting Core warns before any transaction, reloads the new definition, and requires a second Craft/Start click. Active Projects remain frozen to the snapshot captured when they began. Character owners and GMs can also **Unlearn Recipe** with an `I AGREE` confirmation, except while that Recipe has an active Project.

Startup reconciliation repairs interrupted publication sync, removes knowledge whose authoritative source no longer exists, and preserves active Project snapshots. v0.0.21 does not change material costs, Project progress, rests, Extra Effort, harvesting, gathering, or generation mathematics.

## v0.0.20a — Extra Effort Failure UX Polish

v0.0.20a is a focused UI follow-up to v0.0.20. The Extra Effort mechanics are unchanged, but the Recipe Builder now presents failure configuration as a single optional **Lose Progress on Failure** checkbox. With it unchecked, a failed Extra Effort simply spends that opportunity and grants no extra progress; with it checked, the GM configures how much existing Work Progress is lost.

## v0.0.20 — Extra Effort, Material Stacking & Result Feedback

v0.0.20 adds **Extra Effort** to the live-validated Crafting Project loop. After the normal Work Attempt for a Work Period, a Recipe may allow one optional Extra Effort attempt using its own GM-configured Ability, Skill, Tool, or Saving Throw check. Success grants configurable extra Work Progress; failure normally grants no extra progress and can optionally regress progress. Extra Effort never consumes the reserved ingredients again.

Crafting Project outcomes now use centered Crafting Core result dialogs with an explicit **OK** button instead of relying on transient notifications for important Work/Final results. Learning rejection also uses this dialog and explains the unmet requirement when Player Visibility allows it.

Crafting Core materials now stack forward-only by their stable `materialId` when they enter an Actor inventory. Embedded Actor Item UUIDs remain naturally unique; they are no longer treated as the material identity. Existing duplicate stacks are not migrated, and the Ingredient Resolver continues to aggregate them correctly.


## v0.0.19f2 — Generated Item Pile Population Hotfix

v0.0.19f2 is rebuilt directly from the clean v0.0.19f baseline. It keeps the approved popover UX and hidden drag-to-scene workflow unchanged while correcting the shared generated-loot Item Piles transaction.

The current Item Piles API returns an object containing `tokenUuid` and `actorUuid` when a pile is created on a Scene. Crafting Core now creates the pile empty, resolves that exact Token, and then populates its synthetic Actor through `game.itempiles.API.addItems()` using one `{ item, quantity }` entry per generated material. After population, Crafting Core verifies that every Preview material and quantity exists on the resulting pile. If population is incomplete, the pile is removed instead of leaving an empty or partial result on the Scene.

This hotfix does not retune gathering, Game Hunt, Attempts, rarity pools, Essence, or Crafting Projects.

## v0.0.19f — Popover UX & Hidden Drag-to-Scene Loot

v0.0.19f keeps the approved Generate Materials 2.0 mathematics intact and polishes the session workflow. Multi-select selectors now behave like real dropdowns: the closed field stays compact and its checkbox list opens in an anchored top-layer popover, so choosing Biomes, Resources, Abundance, Creature Types, Harvest Profiles, Essence Affinities, or rarity-pool materials no longer stretches the Application.

When Item Piles is active, a successful Generate Materials preview now exposes a **draggable Generated Loot card**. Drag it onto the Scene and Crafting Core creates the pile at the exact drop location. Generated piles are **Hidden by default**, allowing the GM to prepare gathering or hunting results while players are roleplaying and reveal them only when appropriate. A secondary `Create Hidden at Scene Center` action remains available as a fallback.

No yield or generation tuning is included in this patch: Game Hunt, mixed-biome Environment Gathering, Attempts, rarity pools, Essence rules, and Crafting Projects behave as in v0.0.19e. Extra Effort remains reserved for **v0.0.20** after further live validation of normal Project crafting.

## v0.0.19e — Generate Materials 2.0

v0.0.19e turns **Generate Materials** into the GM-facing Resource Gathering tool for situations that are not handled directly on a corpse Token. Creature Harvest, Environment Gathering, and Game Hunt now share compact checkbox multi-select controls. Mixed biomes and mixed resource categories expand the candidate pool, while explicit Attempts remain the main control over how many gathering opportunities are resolved.

- **Manual Creature Harvest:** mix Creature Types and compatible Harvest Profiles, set Sources/Bodies, and select multiple Essence affinities.
- **Environment Gathering:** combine up to three Biomes, multiple Resource Categories, up to two Abundance bands, and a Gather Attempts count.
- **Game Hunt:** combine up to three Biomes, up to two Abundance bands, and Hunt Attempts.
- **Item Piles:** when Item Piles is active, a non-empty preview can be materialized directly as an Item Pile on the viewed Scene.
- **Materials Catalog:** `Sync Catalog` preserves GM customization; `Reset to Curated Defaults` deliberately restores the built-in Crafting Core catalog while preserving custom registered materials.
- **UI polish:** Scanner counters and the Harvest Profile editor are slightly more compact without changing rarity-pool mechanics.

Extra Effort remains reserved for **v0.0.20** after the normal Crafting Project flow receives more live testing.

## v0.0.19d — Harvest Rarity Pools & Game Hunt

v0.0.19d deepens harvesting without changing the stable Crafting Project engine. Scanned Creature Harvest Profiles no longer store one fixed material in each of four slots. They now expose **Common, Uncommon, Rare, and Very Rare / Legendary rarity pools**, and each pool can contain several plausible materials selected through a checkbox multi-select. The fifth Essence Pool remains separate.

A rarity pool rolls its configured chance once. If it succeeds, Crafting Core chooses **exactly one** checked material with equal probability. Four Common candidates under a 65% Common pool therefore still produce at most one Common drop; the four candidates only diversify which Common material can appear. Existing v0.0.19c profiles migrate automatically into the new pool schema.

Creature Scanner normalization is broader and more anatomy-aware. Natural Weapon/Activity names such as Beak, Claw, Bite, Talon, and Sting can establish anatomy when the D&D5e Actor stores those clues outside descriptive traits. Monstrosities gain additional bridge materials — Monstrous Flesh, Monstrous Blood, Monster Fang, Monstrous Bone, Monstrous Eye, and Monstrous Gland — while specialty materials remain gated: Monstrous Venom Gland requires poison/venom evidence and Arcane Organ requires an arcane signal. Scanner rows show active pools and total material candidates so sparse profiles are easier to notice.

**Game Hunt** is now a dedicated manual generation origin, separate from both targeted Creature Harvest and ordinary Environment Gathering. It represents abstract time spent hunting a biome rather than harvesting a selected Actor. Seven prey species are included: Rabbit, Hare, Game Bird, Wild Boar, Wild Goat, Deer, and Elk. Every species has Basic (Common), Rich (Rare), and Premium (Very Rare) meat, stored as normal Items in nested `Gathering → Game Hunt` Compendium folders for Recipes, manual drag-and-drop, and future Vendor/Supplier use.

Abundance affects whether prey is found, the chance of Small/Medium/Large game, and meat quality. Standard Environment Gathering deliberately excludes Game Hunt categories, so meat is only generated through the dedicated hunting flow.

The built-in Material Catalog now contains **229 materials**, every one retaining the three-candidate Core Icon curation model. Crafting Core references native Foundry `icons/...` paths only and does not redistribute Core artwork.

**Extra Effort remains scoped for v0.0.20.**

## v0.0.19c — Cultivated, Trade & Refinement Catalog

v0.0.19c continues the visual/catalog consolidation of the stable v0.0.19 Crafting Projects line. It does not change Project, Progress Check, Harvest, Scanner, Essence, Item Piles, or gear-normalization mechanics.

The curated Material Catalog now contains **202 built-in materials**. A new **Cultivated & Domestic** Profession group provides ordinary farm, orchard, livestock, and apiary goods for markets and future Supplier/Vendor profiles: Wheat, Corn, Barley, Rice, Oats, vegetables, fruit, Milk, Eggs, and ordinary Honey. Environment Gathering receives a separate **Wild Foraging** group with Wild Berries, Wild Nuts, and **Wild Honey**, keeping natural discovery distinct from farm/vendor supply.

Environment distribution is also refined for exploration variety. Resource families overlap biomes instead of being hard-locked, but each biome keeps an identity. In particular, Fungi are intentionally asymmetric: Forest has one dependable fungus, Mountain four, Cave five, Swamp three, and Grassland only one very-rare fungus. Elven Root joins the Roots pool as a Forest/Ravine botanical find.

Profession & Trade is substantially deeper. Alchemy now includes Alcohol, Distilled Extract, Binding Agent, and Alchemical Catalyst. General Materials adds Thread, Cloth, Twine, and Wax. Gemstone/crystal refinement has its own **Gemcutting & Crystals** group, and Metalworking now closes the raw-ore endpoints with Copper, Gold, Mithral, and Adamantine Ingots. `Coal` and `Charcoal` remain distinct materials. Steel remains a processed material intended for a straightforward `Iron Ingot + carbon source → Steel Ingot` Recipe; the module deliberately does not invent Steel Ore or automatically create GM Recipes.

The Materials search field has also been fixed for human typing. Text filtering now happens in the existing DOM instead of rerendering the application on every keystroke, so focus, caret, open groups, and scroll position remain stable while the GM types names such as `salts` or `undead`.

As in v0.0.19a/b, every built-in material has exactly **three** curated Foundry Core icon candidates with one default, and Crafting Core stores only native `icons/...` references. No Foundry Core artwork is distributed inside the module.

Game Hunt remains scoped for **v0.0.19d**. Extra Effort remains scoped for **v0.0.20**.

## v0.0.19b — Environment Catalog Expansion

v0.0.19b expands the wild **Environment Gathering** vocabulary while keeping the stable v0.0.19 Crafting Project engine, Harvest pipeline, Scanner, Essence rules, Item Piles integration, and gear normalization unchanged.

The built-in curated Material Catalog grows from **132 to 165 materials**. Gathering now contains **51** built-in records across Flora, Roots, Fungi, Wood & Resin, and **Minerals & Geological**. Biome metadata deliberately overlaps resource families: a Forest can expose mineral/crystal resources, Mountains can expose flora/fungi, and similar mixed pools are derived from the Material Catalog rather than from a one-biome/one-resource assumption.

The geological chain is broader for future crafting/refinement recipes. Existing Iron, Copper, and Silver Ore are joined by **Coal, Quartz Cluster, Rough Gemstone, Obsidian, Sulfur, Gold Ore, Mithral Ore, Adamantine Ore, and Gem-Bearing Geode**. Steel remains a **refined** Profession & Trade material rather than a naturally gathered ore, preserving the intended future `raw ore → refinement Recipe → ingot/alloy → crafted item` chain.

Wild plant resources are expanded with additional Herbs/Flora, Mushrooms/Fungi, Roots, Timber, and Resins. The Profession & Trade family receives only two intentionally small leather gaps in this build — **Leather Piece** and **Refined Leather** around the existing Leather Straps — while the broader Cultivated/Domestic and profession catalog remains scoped for v0.0.19c. Game Hunt remains scoped for v0.0.19d.

The v0.0.19a icon-curation UI remains intact. Every built-in material, including all 33 new records, has exactly **three Foundry Core icon candidates** with one default. Default curation now prefers the next equivalent candidate where practical instead of repeatedly using the same image; the shipped v0.0.19b default selection uses a distinct icon path for each of the 165 built-ins. Several v0.0.19a defaults were refined from live feedback: Neural Fragment/Psychic Gland are distinct, Primal Beast Essence is explicitly beast-themed, Arcane Gear/Conductor/Runic Core are more magical, repeated Marrow/Essence defaults are reduced, Charcoal is darker and more readable, and Salt/Seasonings are no longer the same default. Existing GM icon choices remain authoritative.

All visual assets are still referenced only by native `icons/...` paths; Crafting Core bundles no Foundry Core artwork.

## v0.0.19a — Material Icon Curation

v0.0.19a is a visual-refinement build on the stable v0.0.19 Crafting Projects line. The GM Materials catalog now offers **three curated Foundry Core icon candidates for every existing built-in material**, with one candidate preselected. The selection is made directly in the Materials table and persists to the private Materials Compendium.

All artwork remains native to Foundry: Crafting Core stores only `icons/...` paths and does not bundle or redistribute the Core image files. Legacy managed materials still using the generic brown pouch are migrated to the curated default, while any non-default image chosen by the GM is preserved.

The Materials window is wider, redundant per-row Nature data has been removed where the surrounding group already communicates it, and the reclaimed space is used for the three visual candidates. This build intentionally leaves the v0.0.19 Project/Rest/Progress mechanics unchanged.

The larger material expansion remains staged: **v0.0.19b Environment**, **v0.0.19c Cultivated/Domestic + Profession/Trade**, and **v0.0.19d Game Hunt**.

## v0.0.19 — Crafting Projects & Rest Progress

v0.0.19 adds persistent, rest-gated Crafting Projects while retaining the existing seconds-based Timed crafting path and the live-validated v0.0.18a resolution/visibility behavior. The Harvest, Scanner, Essence, Item Piles and gear-normalization pipeline remains unchanged.

A Project is measured in **Work Periods**. Starting a Project is already the first Work Attempt; later compatible rests only unlock one new opportunity to work, which the player can spend at any appropriate point afterward. Long-Rest Projects require a Long Rest for the next opportunity, while Short-Rest Projects can be unlocked by either Short or Long Rest. One Character can have one active Project at a time, but other known Recipes remain browsable for planning.

Project ingredients are reserved from the Actor at Start and stored with a frozen Recipe snapshot. Cancelling returns the reserved materials. Optional native D&D5e **Progress Checks** can run Every Work Period or at the midpoint. A failed Progress Check either stalls, regresses a configurable number of Work Periods, or fails the Project. Materials can only be lost when the Project itself fails, with a GM-configured percentage; otherwise they return.

The existing v0.0.18 **Final Crafting Check** remains a separate final validation. In Project mode, failure can stay ready for a later attempt, regress the Project, or fail it with optional material loss. A retry that stays ready requires another compatible rest. Relevant-proficiency Automatic Success still applies to the Final Crafting Check, while Progress Checks remain independent.

The Character Crafting tab now uses a profession-style two-column workspace: known Recipes on the left and a selected Recipe/active Project panel on the right. The live **`N×` craftable count** is restored beside each known Recipe. The player can inspect another Recipe during an active Project, but cannot start it until the current Project completes or is cancelled. Project details, checks, DCs, consequences, materials, output, cadence and progress continue to obey the GM's Player Visibility settings.

Knowledge Source publication is also idempotent in this release. Republishing or renaming the same stable Recipe updates the existing managed Compendium Item when possible and reconciles its Activities to exactly one canonical **Learn Recipe**, repairing previously accumulated duplicates.

**Extra Effort is deliberately not part of v0.0.19.** The voluntary acceleration minigame remains the scoped target for v0.0.20.

## v0.0.17 — Immersive Corpse Loot hotfix

v0.0.17 keeps the user-validated v0.0.16 baseline and fixes the two immersive Existing NPC Loot modes without refactoring the stable **Remove All** or **Keep All** paths.

**Keep Physical Gear / Remove Natural & Features** now trusts the physical gear that Item Piles already transferred to the corpse. Crafting Core removes only disallowed live transferable entries and appends Harvest; it does not re-add the retained gear, preventing duplicate Holy Maces, Scimitars, armor, and similar items.

**Normalize from Compendiums** now performs an explicit live replacement. After Item Piles converts the corpse with `deleteWhenEmpty` temporarily disabled, Crafting Core reads the current transferable pile Items, snapshots them for rollback, removes those current pile IDs, and inserts exactly one final payload containing normalized gear plus Harvest. This avoids equivalent-item stacking such as Light Hammer x3 becoming x6 while still allowing stat-block variants such as Holy Mace to become their official base Mace.

### Optional Homebrew — Firearms to Crossbows

Game Settings → Crafting Core → Existing NPC Loot now includes **Convert Firearms to Random Crossbows**. It is **off by default** and only affects **Normalize from Compendiums**. When enabled, each Firearm stack is replaced by one randomly selected **Hand Crossbow**, **Light Crossbow**, or **Heavy Crossbow** from the configured normalization sources. The original stack quantity is preserved. If the first random choice is unavailable, the other crossbows are tried before the firearm is treated as unmatched.

## v0.0.16 — Stable-baseline Token Harvest rebuild

This build deliberately returns to the stable v0.0.9 codebase and reapplies only the proven Token Harvest features plus a new atomic gear-normalization path. Token Harvest is always an explicit GM action; Crafting Core never generates corpse loot automatically on death.

When Item Piles is active, an eligible dead Token with a stored Harvest Profile receives a compact loot-bag control in the Token HUD. Multiple controlled corpses can be harvested in one action, with each Token resolving its own last scanned/reanalyzed profile.

Existing NPC loot can be kept, filtered, removed, or normalized against up to four ordered Item Compendiums. The normalization pipeline never uses fuzzy matching and never separately empties an Item Pile: Item Piles performs removal of its transferable inventory and addition of the final normalized gear + Crafting Core materials in one `addItems(..., { removeExistingActorItems: true })` transaction.

Manual Creature Harvest also includes the Essence Affinity controls introduced in the original v0.0.10 line.

## v0.0.9 — Essence Harvest Layer

This release adds the magical fifth slot to scanned Harvest Profiles while preserving the live-validated four-slot creature-material model. Pinpoint Overrides remain separate and continue to be controlled explicitly by the GM.

### Essence catalog

The curated Material Catalog now contains **132** built-in materials. The Essence family contains eleven **Uncommon** materials: Arcane, Acid, Cold, Flame, Force, Lightning, Necrotic, Poison, Psychic, Radiant, and Thunder Essence. The former Undead-only **Necrotic Essence** keeps its stable material ID and is promoted into this universal Essence family; a new **Necrotic Residue** material replaces its old role in the Undead four-slot pool.

### Slot 5 — Essence

Every newly scanned or reanalyzed Actor receives a separate Essence slot in addition to the four existing automatic material slots. The Analyzer reads structured D&D5e data instead of guessing from arbitrary descriptive text:

- non-spell Attack / Save / Damage Activities can establish a damage affinity;
- native damage resistance and immunity can establish an affinity;
- bludgeoning, piercing, and slashing are ignored;
- a prepared spell by itself does not turn the creature into an elemental harvesting source.

If the Actor has at least one supported non-physical affinity, each harvested source rolls **45% Arcane Essence / 55% specific Essence**. If several specific affinities are supported, that 55% side is distributed by evidence weight. If the Actor has no supported affinity, the fifth slot rolls **50% Arcane Essence / 50% no Essence**.

Essence is rolled when Harvest is generated, not permanently selected when the Compendium is scanned. This keeps Arcane Essence close to the combined supply of all specific Essences over long play while making each individual specific Essence substantially scarcer.

Existing v0.0.8 profiles are not silently reclassified. Rescan or Reanalyze them to enable the new fifth slot from the real source Actor data.

## v0.0.8 — Actor Analyzer Intelligence & Scanner Settings

This development release strengthens the entire Creature Scanner inference framework before Token HUD / Item Piles integration. The scanner still never changes source Actors or source Compendiums; it only creates Crafting Core Harvest Profile metadata.

### Actor Analyzer v2

The Analyzer no longer treats every piece of Actor text as equally trustworthy. It now evaluates evidence in layers:

1. **Identity / morphology** — creature type, name, subtype, and custom type.
2. **Structural features** — features that describe the creature's actual form or movement.
3. **Anatomical attacks / activities** — Bite, Claw, Talon, Beak, Horn, Tentacle, Venom delivery, and similar body evidence.
4. **Physical equipment interaction** — weapons/equipment support corporeal interaction but do not invent anatomy.
5. **Incidental magic / spell language** — weak context only; it cannot redefine morphology by itself.

This prevents a spell such as `Spirit Shroud`, `Phantom Steed`, or another spectral-named ability from turning a physical creature into an incorporeal one. Explicit identity such as Ghost/Specter/Wraith/Banshee or a structural feature such as `Incorporeal Movement` remains strong evidence.

Undead physical fallbacks are intentionally practical for harvesting. Lich, Mummy Lord, Death Knight, Undead Knight, Zombie/Ghoul/Vampire/Wight/Revenant-style sources can resolve flesh/bone remains when no strong incorporeal evidence exists. Skeleton/Demilich-style sources remain bone-focused. True incorporeal Undead continue to exclude physical anatomy.

The same evidence hierarchy applies beyond Undead. Constructs no longer default blindly to metal/mechanical bodies; stone/mineral, crystal, flesh, and metal/mechanical forms require supporting Actor evidence. Amorphous and Elemental morphology likewise use stronger structural signals.

When a preferred automatic slot has no exact-rarity match, the Analyzer performs a second deterministic **family fallback** pass. It may use another unused, anatomically coherent material from the same creature family at the same-or-lower tier. This is specifically intended to fill profiles more completely without fabricating anatomy or upgrading an ordinary creature into a higher rarity tier.

### Undead generic fallback materials

The curated Material Catalog now contains **121** built-in materials. Two generic Undead materials were added:

- **Funerary Dust** — Common; no flesh/bone requirement.
- **Necrotic Essence** — Uncommon; no flesh/bone requirement.

These materials let a true incorporeal Undead have more than only Ectoplasm/Spiritual Residue without inventing a physical body. Anatomy-specific materials still score higher when their requirements are satisfied.

### Crafting Core Game Settings

Creature Scanner content sources are now configured through **Game Settings → Crafting Core**. The GM selects content at the source/package level instead of manually selecting every internal pack.

- Selecting a module/system source automatically includes only its compatible **Actor Compendiums**.
- Item, Journal, RollTable, and other pack types are ignored.
- World Actor Compendiums appear as individual selectable sources.
- Selected sources can be reordered; the order is saved as source priority for future equivalent-creature resolution.

The Creature Scanner itself now shows only a compact source summary plus Scan, leaving more room for Harvest Profiles.

### Search behavior

Creature Scanner search no longer rerenders while each letter is typed. Type the complete query, then apply it with **Enter**, the **magnifying glass**, or by leaving the field. The explicit Clear button resets the filter.

### Recipe Builder space

The saved Recipe column is widened again to a 380px default and the main Crafting Core GM window opens wider, giving the Recipe list a dedicated readable area rather than a narrow utility strip.

### Deliberately not included yet

- Item Piles integration
- Token HUD Harvest action
- corpse conversion / automatic death handling
- Region or Vendor generation
- Knowledge Codex
- general-purpose migration support during the current single-tester development phase

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.7 — Creature Scanner & Actor Analyzer

This development release connects the live-validated curated Material Catalog to the GM's actual creature Compendiums. It does not hard-code loot by monster name and it does not modify source content. Instead, Crafting Core reads native D&D5e Actor data, infers generic fantasy anatomy, and builds editable per-Actor Harvest Profiles.

### Creature Scanner

Open **Crafting Core → Creature Scanner**, choose one or more Actor Compendiums, and scan. The scanner first reads Compendium indexes to discard non-NPC documents, then loads eligible Actors in small batches for the detailed pass. Source Actors and Compendiums remain read-only.

The scanner stores Crafting Core metadata for each source Actor UUID. Profiles can be searched, filtered by creature type, edited, reanalyzed individually, or deleted without touching the source Actor.

### Actor Analyzer

The Analyzer combines D&D5e creature type with generic signals from subtype/name, movement, Items, Activities, attacks, and damage data. It can infer tags such as `bone`, `flesh`, `claw`, `feather`, `scale`, `venom`, `incorporeal`, `amorphous`, `plant`, `mechanical`, and related anatomy.

Important special cases are deliberately conservative. A Skeleton can resolve to bone-compatible materials without Undead Flesh; Ghost-like Undead resolve to incorporeal anatomy; Constructs distinguish flesh, stone/mineral, crystal, metal/mechanical, and generic cases when the Actor data supports it.

### Per-Actor Harvest Profiles

The Analyzer proposes no more than four automatic materials:

1. **Common**
2. **Common / Uncommon**
3. **Rare**
4. **Very Rare** by default, or **Legendary** when high-tier source data is present (CR 17+, Legendary Actions/Resistance, or Lair data)

A material is eligible only when its curated anatomy requirements are satisfied. Missing compatible materials leave a slot empty rather than inventing an anatomically wrong result. The GM can replace any slot material and edit its chance or quantity formula. Anatomy tags themselves are also editable.

### Pinpoint Overrides

Harvest Profiles now support extra **Pinpoint Overrides** for boss or quest materials. A Pinpoint material does not consume one of the four automatic slots, defaults to a 100% roll, can use any registered Crafting Core material, and is preserved when the source Actor is reanalyzed.

The shared material engine already exposes profile-based generation internally. The next Token HUD / Item Piles layer can therefore resolve an Actor's stored profile and send the same result to a corpse without creating a second loot algorithm.

### Recipe Builder space

The Recipe Builder sidebar now reserves a wider dedicated area for saved Recipes. GM tool launchers are compacted into a 2×2 block, freeing additional vertical space for the Recipe list.

### Deliberately not included yet

- Item Piles integration
- Token HUD Harvest action
- corpse conversion or auto-harvest on death
- Region/Vendor generation
- Knowledge Codex
- general-purpose release migrations during the current internal testing phase

## v0.0.6 — Rarity & Harvest Profile Foundation

This development release completes the material rarity model before the future Creature Scanner / Actor Analyzer starts generating per-Actor Harvest Profiles.

### Full five-tier material rarity

Crafting Core materials now use the complete project rarity ladder:

- **Common** — 65% default drop chance, 5 gp default value
- **Uncommon** — 35%, 25 gp
- **Rare** — 15%, 100 gp
- **Very Rare** — 5%, 500 gp
- **Legendary** — 1%, 1,000 gp

These are Material Catalog defaults, not hard rules. The GM can edit rarity, chance, value, and quantity per material. Very Rare is presented in purple throughout the Crafting Core UI.

The built-in curated catalog still contains exactly **119 materials**. Existing Creature Harvest, Gathering, and Profession / Trade records were redistributed across the five tiers rather than adding artificial duplicate materials merely to fill rarity bands.

### Four-slot Harvest Profile model

Creature Harvest keeps the established maximum of **four automatic material candidates per source**. The default slot pools are now:

1. `Common`
2. `Common or Uncommon`
3. `Rare`
4. `Very Rare or Legendary`

A material can occupy only one slot in a source roll. After slot selection, its own configured drop chance and quantity formula are rolled exactly as before. This structure is intentionally scanner-ready: a future per-Actor Harvest Profile can choose whether its high-tier slot resolves to Very Rare or Legendary without increasing the four-material limit.

### Generator workflow unchanged

The live-validated v0.0.5 workflow remains intact: **Generate Materials** creates only an in-memory Preview; **Generate Again** replaces it; **Create Loot Folder** materializes exactly the accepted preview without rerolling. Creature Harvest and Environment Gathering continue to share the same generation engine.

## Existing generation foundation

- **Creature Harvest** — Creature Type, coarse manual Profile, and independent Sources/Bodies. Each source uses four candidate slot pools — Common, Common/Uncommon, Rare, and Very Rare/Legendary — and then applies each Material Catalog chance/quantity.
- **Environment Gathering** — Biome, Resource and Abundance. Biome/Resource pools are derived from Material Catalog metadata. Nature/Survival checks remain GM adjudication outside the module.
- Materials remain eligible even when no current Recipe consumes them.
- The same `MaterialGenerationService` is intended to power the future Token HUD / Item Piles corpse destination.

## Private libraries

Crafting Core maintains GM-only `Crafting Core — Materials` and `Crafting Core — Learn Sources` world Compendiums. The Materials catalog is explicitly a built-in curated fantasy material library plus GM custom entries. Published Knowledge Sources and learned Actor recipe snapshots remain self-contained.

The top-level Crafting Core Compendium folder defaults to `#8de901` and Crafting Core-created structures use Manual sorting by default while preserving later GM changes.

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

## Item Piles

Crafting Core works without Item Piles. Item Piles remains the planned/recommended integration for the complete corpse-harvesting experience. Crafting Core will roll the same material result already used by the manual generator; Item Piles will only provide the individual corpse/container destination.
