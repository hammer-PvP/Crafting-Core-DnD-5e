# Crafting Core (DnD 5e)

**Collect materials. Learn recipes. Craft equipment and consumables. Build projects over time.**

Crafting Core adds a flexible crafting system to D&D 5e in Foundry VTT. Game Masters decide which materials, products, and recipes exist in their world. Players learn recipes and craft directly from their character sheets. Crafting Core also provides tools for gathering resources, harvesting creatures, and managing crafting time during a campaign.

You can start with your own content or install the optional content packs included with the module. **No material or recipe catalog is forced into a new world.**

## What Can Crafting Core Do?

- **Materials and Products:** create or register D&D 5e items for use as ingredients and crafted results.
- **Recipe Builder:** define ingredients, output items, requirements, crafting time, and optional checks.
- **Recipe Knowledge:** publish recipes as learnable items and let characters learn them in-game.
- **Player Crafting:** make quick items or advance persistent projects on the character sheet.
- **Crafting Hours and Downtime:** follow rest-based progress during an adventure or let the GM release a bank of crafting hours.
- **Gathering and Harvesting:** generate resources from environments and creatures, with optional Item Piles support.

## Getting Started — GM

1. **Open the Item Directory** and click **Crafting Core**.
2. Open **Materials** to enter the **Crafting Core Catalog**. Create or register your own Materials and Products, or open **Content Packs** to install a ready-made library.
3. Return to **Crafting Core**, choose **New Recipe Draft**, and create a recipe using the materials and output item you want.
4. Click **Save Draft** while editing. When the recipe is ready for players, use **Publish to Private Compendium**.
5. Find the published item in **Crafting Core — Learn Sources** and give it to a character. The character uses its **Learn Recipe** activity.
6. Open that character's **Crafting** tab to see the learned recipe and start crafting.

**Tip:** Try one simple recipe first. Add more ingredients, progress checks, and other requirements only when your campaign needs them.

## Materials, Products, and Content Packs

The **Crafting Core Catalog** has three areas:

| Area | What it is for |
| --- | --- |
| **Materials** | Materials available in the current world. Create new ones or register existing items. |
| **Products** | Items that recipes can produce. Register your own items or use items from installed content. |
| **Content Packs** | Optional collections the GM can deliberately install or restore. |

Available built-in packs include:

- **Hammer — Materials:** a ready-made material catalog.
- **Hammer — Culinary:** food and drink products with learnable recipes.
- **Hammer — Alchemy & Inscription:** consumables, inks, inscriptions, and their recipes.
- **SRD Equipment Crafting:** equipment products and recipes based on available D&D 5e SRD items, including enhanced equipment variants.

Packs are **optional**. Installing or restoring a pack affects its managed content; it does not replace unrelated items created by the GM. You can also use ordinary D&D 5e items as ingredients without registering every item as a Crafting Core material.

## Creating a Recipe — GM

Open **Crafting Core → New Recipe Draft** and fill in the sections you need:

1. **Recipe:** name, image, description, and crafting mode.
2. **Who Can Craft:** choose eligible skill or tool proficiencies, access requirements, and any final crafting check.
3. **Ingredients and Result:** choose the items consumed and the item produced. Ingredient groups can be fixed, offer a choice, or allow a mix of equivalent materials.
4. **Crafting Time:** choose a timed craft or a persistent project measured in crafting hours.
5. **Optional Project Rules:** set the rest cadence, progress checks, Extra Effort, failure consequences, and any workstation requirement.
6. **Save Draft**, review it, and **Publish to Private Compendium** when ready.

A saved draft is **not yet available to players**. Editing a published recipe also does not change the live version until you publish its update.

### Project Checks and Workstations

Project recipes may have **no progress checks**, require a check **every crafting hour**, or use **specific milestones**:

- Add a milestone at a chosen hour of progress, such as **after 5 hours** in a 10-hour project.
- Choose that milestone's ability, skill, tool, or saving throw and its **Difficulty Class (DC)**.
- Add more milestones with **Add Checkpoint** when needed.
- Optionally require a **Suitable Workstation**, such as a forge, workshop, or laboratory. The GM confirms that the required workstation is available when the relevant work is attempted.

A required milestone must be resolved before the project continues past it, including when Extra Effort would otherwise grant additional progress. Extra progress beyond a milestone is held until the check passes. A failed checkpoint follows the configured project failure consequence; retrying a stalled checkpoint requires another work opportunity. Progress-check failure outcomes, Extra Effort, and the optional Final Crafting Check remain separate settings.

**Example:** A 10-hour weapon project may have a Smith's Tools check after 5 hours and a final check at completion. A more elaborate recipe can add further milestones, each with its own check and DC.

## Player Guide — Learning and Crafting

1. Receive a published **Recipe**, **Formula**, **Blueprint**, or **Manual** item from the GM, a merchant, loot, or a compendium.
2. Use **Learn Recipe** on that item.
3. Open the **Crafting** tab on your character sheet and choose the learned recipe.
4. Check the required materials and select among any allowed ingredient alternatives.
5. Start crafting. For a project, the sheet shows progress in **hours**, available actions, and any checks or requirements.
6. Continue until all required work and checks are complete. The crafted item is then added according to the recipe's normal completion process.

**Timed Crafting** uses a duration set by the recipe. **Crafting Projects** persist between sessions, remember reserved ingredients, and track their own progress and checks.

## Crafting Hours, Rests, and Downtime

Projects use **crafting hours** as their progress unit. A 4-hour project needs four hours of normal progress, unless its rules grant bonus progress.

**During normal adventures:** each recipe uses its configured rest cadence. A qualifying **Long Rest** or **Short Rest** unlocks the next work opportunity; resting alone does not complete work automatically. **Extra Effort**, when enabled, can add progress after its check.

**During Downtime:** the GM may grant hours to characters and activate **Downtime Mode**. While it is active, characters can spend their credited hours on projects without waiting for rests. Existing recipe checks and requirements still apply.

### Downtime Manager — GM

Open **Downtime** from the Item Directory.

1. Optionally choose which characters are shown using Actor-folder and Group/Party filters.
2. Check the characters who should receive time, or use **Select All**.
3. Enter a number of hours and click **Grant Hours**. **Each selected character receives that full amount**: selecting three characters and granting 30 hours gives **30 hours to each**, not 10.
4. Click **Activate Downtime** when the campaign reaches a period when those hours may be used.
5. Click **End Downtime** to return to normal rest-based crafting. Unused hours remain stored but unavailable until Downtime is active again.
6. Use **Revoke / Zero Balance**, with confirmation, if you want to cancel unused credits. Already completed crafting and spent hours are not reversed.

The Manager does not need to advance the global game clock to represent a narrative downtime period.

## Gathering and Harvesting — GM

Use **Generate** from the Item Directory to open **Generate Materials**. Choose the kind of generation:

- **Environment Gathering:** choose biomes, resource categories, abundance, and attempts.
- **Creature Harvest:** select creature types or existing Harvest Profiles.
- **Game Hunt:** generate resources associated with hunting in selected environments.

Generate a **preview**, review the materials and quantities, then choose where the accepted result goes. You can create World items, or use an Item Pile when the optional **Item Piles** module is available.

For creature-specific harvesting, use **Scanner** from the Crafting Core window to analyze the Actor sources configured in the module settings. Review or edit the resulting **Harvest Profiles** as needed. The scanner does not rewrite source creatures.

## Maintenance and Useful Settings — GM

Open **Game Settings → Crafting Core → Configure Crafting Core** for administrative configuration and maintenance.

- **Resync Material Sources & Inventories:** manually refresh managed material-source information and recognized canonical images in existing inventories. It is not an automatic scan on every login.
- **Organize Equipment Folders:** reorganize managed equipment into the appropriate compendium folders.
- **Recipe Import / Export:** move recipe definitions between worlds, reviewing missing ingredients and conflicts before importing.
- **Creature Scanner Sources:** choose which Actor compendiums are analyzed for harvesting.
- **Token Harvest Settings:** choose how existing creature loot is handled when using the optional harvesting integration.

In the **Catalog**, use **Validate Catalog** to review content or product-source problems. **Restore** is for deliberately restoring a managed content pack; it is not a routine step every time you open a world.

## Optional Integrations

- **Item Piles:** enables supported physical loot piles and token-harvest destinations.
- **DnD 5e Item Creator:** used by the optional curated food and drink content when its persistent item features are needed.

The core crafting and recipe system can be used without installing every optional integration.

## Help and Documentation

- [Complete Crafting Core Manual](docs/Crafting-Core-Complete-Manual.pdf)
- [Release History and Changes](CHANGELOG.md)
- [Report a Bug or Request a Feature](https://github.com/hammer-PvP/Crafting-Core-DnD-5e/issues)
- [Crafting Core on GitHub](https://github.com/hammer-PvP/Crafting-Core-DnD-5e)

Crafting Core is part of the [Hammer-PvP](https://github.com/hammer-PvP) collection of Foundry VTT projects. If you would like to support its development, visit [Buy Me a Coffee](https://buymeacoffee.com/hammer.pvp).

**License:** see [LICENSE](LICENSE).
