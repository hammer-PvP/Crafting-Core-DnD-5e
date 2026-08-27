# Crafting Core (DnD 5e)

## v0.0.12 highlights

- Hotfixes Item Piles corpse cleanup so post-conversion removal uses Item Piles' transferable inventory rather than raw NPC Embedded Item IDs.
- Fixes `removeItems()` failures caused by filtered stat-block Features such as Amphibious/Abduct.
- Keeps generated Harvest, Essence, and Pinpoint injection fail-soft even if third-party gear cleanup encounters an unexpected edge case.

### v0.0.11 normalization foundation

- Creature Scanner Harvest Profiles are vertically scrollable again.
- Token Harvest can now normalize NPC equipment against up to four ordered Item Compendiums before exposing the corpse to players.
- **Normalize from Compendiums** replaces monster/stat-block versions of physical gear with clean base Items; unmatched gear and non-physical mechanics are discarded.
- Alternate handling modes remain available for GMs who prefer to remove all existing NPC Items, keep only physical gear, or keep everything.
- Crafting Core Harvest, Essence, and Pinpoint materials are added after normalization and are never removed by the gear cleanup pass.

## v0.0.10 highlights

- Manual Creature Harvest now supports multi-select **Essence Affinity** and the same Arcane-vs-specific Essence economy as scanned Actors.
- Optional **Item Piles** bridge adds explicit GM-only corpse harvesting from the Token HUD using Foundry's small item-bag icon.
- Harvesting is never automatic on death. Dead Tokens must be explicitly harvested, individually or as a controlled multi-selection.
- A Token requires a Harvest Profile from the latest Scan/Reanalyze and can only be harvested once.


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


## v0.0.13 Token Harvest transaction safety

Token Harvest now creates a fully-populated Item Pile at the corpse position before deleting the original Token. This avoids transient empty piles during gear normalization and keeps the original corpse intact whenever pile creation fails.
