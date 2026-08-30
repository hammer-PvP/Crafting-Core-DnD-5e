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
import { MaterialStackService } from "./services/material-stack-service.mjs";

let app = null;
let generatorApp = null;

const SUPPORT_URL = "https://buymeacoffee.com/hammer.pvp";

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
  get gearNormalization() { return game.user?.isGM ? GearNormalizationService : undefined; },
  materialStacking: MaterialStackService
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
  runInitStep("knowledge lifecycle settings", () => KnowledgeItemService.registerSettings());
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
  runInitStep("Generated loot drag/drop", () => ItemPilesBridge.installGeneratedLootDropHook());
  runInitStep("Crafting material auto-stacking", () => MaterialStackService.installHooks());

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
      const knowledge = await KnowledgeItemService.reconcilePublishedKnowledge();
      if (knowledge.refreshed || knowledge.forgotten || knowledge.draftsUpdated || knowledge.indexChanged) {
        console.info(`${MODULE_TITLE} | Reconciled published knowledge lifecycle:`, knowledge);
      }
    } catch (error) {
      console.error(`${MODULE_TITLE} | Published knowledge reconciliation failed.`, error);
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

Hooks.on("renderApplicationV2", (renderedApp, element) => {
  if (isItemDirectoryApp(renderedApp)) injectItemDirectoryButton(renderedApp, element);
  if (isSettingsConfigApp(renderedApp)) injectSettingsSupportCard(renderedApp, element);
});
Hooks.on("renderItemDirectory", (directoryApp, html) => injectItemDirectoryButton(directoryApp, html));
Hooks.on("renderSettingsConfig", (settingsApp, html) => injectSettingsSupportCard(settingsApp, html));

function isSettingsConfigApp(renderedApp) {
  const name = String(renderedApp?.constructor?.name ?? "");
  const id = String(renderedApp?.id ?? renderedApp?.options?.id ?? "");
  return name === "SettingsConfig" || id === "settings-config" || id === "settings";
}

function injectSettingsSupportCard(settingsApp, element) {
  const root = element instanceof HTMLElement ? element : element?.[0] ?? settingsApp?.element;
  if (!root) return;

  root.querySelectorAll(".crafting-core-support-setting, .crafting-core-suite-setting").forEach(node => node.remove());

  const buttons = [...root.querySelectorAll("button")];
  const configureButton = root.querySelector(`[data-key="${MODULE_ID}.craftingCoreSettings"]`)
    ?? buttons.find(button => String(button.textContent ?? "").trim().replace(/\s+/g, " ") === "Configure Crafting Core");
  if (!configureButton) return;

  const targetRow = configureButton.closest(".form-group, .setting, li") ?? configureButton.parentElement;
  if (!targetRow?.parentElement) return;

  const supportRow = document.createElement(targetRow.tagName === "LI" ? "li" : "div");
  supportRow.className = `${targetRow.className || "form-group"} crafting-core-support-setting`.trim();
  supportRow.innerHTML = `
    <label class="crafting-core-support-label"><i class="fa-solid fa-mug-hot"></i> Support the Creator</label>
    <div class="form-fields crafting-core-support-fields">
      <button type="button" class="crafting-core-support-button">
        <i class="fa-solid fa-mug-hot"></i> Buy Me a Coffee
      </button>
    </div>
    <p class="hint crafting-core-support-hint">Thank you for using Crafting Core! If you enjoy the module and would like to support its continued development, your support helps me dedicate more time to creating, testing, and improving tools for Foundry VTT.</p>`;

  supportRow.querySelector(".crafting-core-support-button")?.addEventListener("click", event => {
    event.preventDefault();
    window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
  });

  targetRow.parentElement.insertBefore(supportRow, targetRow);

  const suiteRow = document.createElement(targetRow.tagName === "LI" ? "li" : "div");
  suiteRow.className = `${targetRow.className || "form-group"} crafting-core-suite-setting`.trim();
  suiteRow.innerHTML = `
    <label class="crafting-core-suite-label"><i class="fa-solid fa-cubes-stacked"></i> More from Hammer-PvP</label>
    <div class="form-fields crafting-core-suite-list" aria-label="Other Hammer-PvP Foundry VTT modules">
      <span>DnD 5e Character Builder</span>
      <span>DnD 5e Item Creator</span>
      <span>DnD 5e Currency Manager</span>
      <span>Enhanced Audio Player</span>
    </div>
    <p class="hint crafting-core-suite-hint">Crafting Core is part of a growing set of Foundry VTT tools designed to complement one another. Explore the other Hammer-PvP modules when you want character creation, custom items, economy, and audio tools that fit naturally beside your crafting workflow.</p>`;

  targetRow.parentElement.insertBefore(suiteRow, targetRow.nextSibling);
}

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

