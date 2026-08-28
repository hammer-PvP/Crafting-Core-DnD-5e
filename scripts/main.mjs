import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import { CraftingCoreApp } from "./apps/crafting-core-app.mjs";
import { MaterialGeneratorApp } from "./apps/material-generator-app.mjs";
import { CharacterSheetService } from "./services/character-sheet-service.mjs";
import { CraftingService } from "./services/crafting-service.mjs";
import { KnowledgeItemService } from "./services/knowledge-item-service.mjs";
import { RecipeService } from "./services/recipe-service.mjs";
import { MaterialCatalogService } from "./services/material-catalog-service.mjs";
import { MaterialGenerationService } from "./services/material-generation-service.mjs";
import { HarvestProfileService } from "./services/harvest-profile-service.mjs";
import { CraftingCoreSettingsApp } from "./apps/crafting-core-settings-app.mjs";
import { TokenHarvestService } from "./services/token-harvest-service.mjs";
import { ItemPilesBridge } from "./services/item-piles-bridge.mjs";
import { GearNormalizationService } from "./services/gear-normalization-service.mjs";

let app = null;
let generatorApp = null;

function openCraftingCore() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can configure Crafting Core.");
  try {
    app ??= new CraftingCoreApp();
    app.render({ force: true });
    return app;
  } catch (error) {
    console.error(`${MODULE_TITLE} | Failed to open GM application.`, error);
    ui.notifications.error("Crafting Core could not open. Check the console for details.");
    return null;
  }
}

function openMaterialGenerator() {
  if (!game.user?.isGM) return ui.notifications.warn("Only a GM can generate Crafting Core materials.");
  try {
    generatorApp ??= new MaterialGeneratorApp();
    generatorApp.render({ force: true });
    return generatorApp;
  } catch (error) {
    console.error(`${MODULE_TITLE} | Failed to open Material Generator.`, error);
    ui.notifications.error("Crafting Core could not open Generate Materials. Check the console for details.");
    return null;
  }
}

const API = {
  open: openCraftingCore,
  openGenerator: openMaterialGenerator,
  crafting: CraftingService,
  knowledge: KnowledgeItemService,
  get recipes() { return game.user?.isGM ? RecipeService : undefined; },
  get materials() { return game.user?.isGM ? MaterialCatalogService : undefined; },
  get generation() { return game.user?.isGM ? MaterialGenerationService : undefined; },
  get harvestProfiles() { return game.user?.isGM ? HarvestProfileService : undefined; },
  get tokenHarvest() { return game.user?.isGM ? TokenHarvestService : undefined; },
  get itemPiles() { return game.user?.isGM ? ItemPilesBridge : undefined; },
  get gearNormalization() { return game.user?.isGM ? GearNormalizationService : undefined; }
};

function exposeApi() {
  // The UI launcher must not depend on this convenience namespace, but keep it for
  // backward compatibility and console/module integrations.
  try { game.craftingCore = API; }
  catch (error) { console.warn(`${MODULE_TITLE} | Could not expose game.craftingCore.`, error); }
  const module = game.modules?.get?.(MODULE_ID);
  if (module) module.api = API;
}

function runInitStep(label, fn) {
  try { fn(); }
  catch (error) { console.error(`${MODULE_TITLE} | Init step failed: ${label}.`, error); }
}

Hooks.once("init", () => {
  // Expose the launcher first. A later optional integration failure must never make
  // the Crafting Core button unusable.
  exposeApi();
  runInitStep("recipe settings", () => RecipeService.registerSettings());
  runInitStep("material settings", () => MaterialCatalogService.registerSettings());
  runInitStep("harvest profile settings", () => HarvestProfileService.registerSettings());
  runInitStep("gear normalization settings", () => GearNormalizationService.registerSettings());
  runInitStep("Crafting Core settings menu", () => game.settings.registerMenu(MODULE_ID, "craftingCoreSettings", {
    name: "Crafting Core",
    label: "Configure Crafting Core",
    hint: "Configure Creature Scanner sources and Token Harvest loot handling.",
    icon: "fa-solid fa-hammer",
    type: CraftingCoreSettingsApp,
    restricted: true
  }));
  runInitStep("D&D5e Character Sheet patch", () => CharacterSheetService.patchDnd5eSheet());
  runInitStep("Character Sheet hooks", () => CharacterSheetService.installHooks());
  runInitStep("Knowledge Item hooks", () => KnowledgeItemService.installHooks());
  runInitStep("Token Harvest hooks", () => TokenHarvestService.installHooks());

  console.info(`${MODULE_TITLE} | Initialized.`);
});

Hooks.once("ready", async () => {
  exposeApi();
  try { await RecipeService.prepareSystemLabels(); }
  catch (error) { console.warn(`${MODULE_TITLE} | Could not preload D&D5e proficiency labels.`, error); }
  try { CraftingService.ready(); }
  catch (error) { console.error(`${MODULE_TITLE} | Crafting runtime failed to become ready.`, error); }

  // One GM upgrades v0.0.1/v0.0.2 Character knowledge to self-contained recipe snapshots.
  const activeGM = game.users?.activeGM ?? game.users?.contents?.find(user => user.active && user.isGM);
  if (game.user?.isGM && (!activeGM || activeGM.id === game.user.id)) {
    try {
      const migrated = await KnowledgeItemService.migrateLegacyKnowledge();
      if (migrated.actors || migrated.items) console.info(`${MODULE_TITLE} | Migrated legacy knowledge:`, migrated);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Legacy knowledge migration failed.`, error);
    }
    try {
      const materialMigration = await MaterialCatalogService.migrateCuratedCatalogIfNeeded();
      if (materialMigration.migrated) console.info(`${MODULE_TITLE} | Applied curated material catalog migration.`, materialMigration);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Curated material icon migration failed.`, error);
    }
    try {
      const harvestMigration = await HarvestProfileService.migrateStoredProfilesToPools();
      if (harvestMigration.migrated) console.info(`${MODULE_TITLE} | Migrated legacy Harvest Profile slots to v0.0.19d rarity pools.`, harvestMigration);
    } catch (error) {
      console.error(`${MODULE_TITLE} | Harvest Profile rarity-pool migration failed.`, error);
    }
  }
});

Hooks.on("renderApplicationV2", (directoryApp, element) => {
  if (isItemDirectoryApp(directoryApp)) injectItemDirectoryButton(directoryApp, element);
});
Hooks.on("renderItemDirectory", (directoryApp, html) => injectItemDirectoryButton(directoryApp, html));

function isItemDirectoryApp(directoryApp) {
  const name = String(directoryApp?.constructor?.name ?? "");
  const classes = directoryApp?.options?.classes ?? [];
  return name.includes("ItemDirectory")
    || name.includes("ItemsDirectory")
    || directoryApp?.collection === game.items
    || (classes.includes("directory") && classes.includes("items"));
}

function injectItemDirectoryButton(directoryApp, element) {
  if (!game.user?.isGM) return;
  const root = element instanceof HTMLElement ? element : element?.[0] ?? directoryApp?.element;
  if (!root) return;
  const header = root.querySelector(".directory-header") ?? root.querySelector("header");
  if (!header) return;
  const actions = header.querySelector(".header-actions, .action-buttons") ?? header;

  root.querySelectorAll(".crafting-core-directory-actions, .crafting-core-directory-button").forEach(node => node.remove());

  const wrapper = document.createElement("div");
  wrapper.className = "crafting-core-directory-actions";

  const coreButton = document.createElement("button");
  coreButton.type = "button";
  coreButton.className = "crafting-core-directory-button crafting-core-directory-main";
  coreButton.dataset.tooltip = "Open Crafting Core";
  coreButton.innerHTML = '<i class="fa-solid fa-hammer" inert></i><span>Crafting Core</span>';
  coreButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openCraftingCore();
  });

  const generatorButton = document.createElement("button");
  generatorButton.type = "button";
  generatorButton.className = "crafting-core-directory-button crafting-core-directory-generator";
  generatorButton.dataset.tooltip = "Generate Materials";
  generatorButton.innerHTML = '<i class="fa-solid fa-dice-d20" inert></i><span>Generate</span>';
  generatorButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openMaterialGenerator();
  });

  wrapper.append(coreButton, generatorButton);
  actions.append(wrapper);
}

