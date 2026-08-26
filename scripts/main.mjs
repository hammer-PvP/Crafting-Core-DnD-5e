import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import { CraftingCoreApp } from "./apps/crafting-core-app.mjs";
import { CharacterSheetService } from "./services/character-sheet-service.mjs";
import { CraftingService } from "./services/crafting-service.mjs";
import { KnowledgeItemService } from "./services/knowledge-item-service.mjs";
import { RecipeService } from "./services/recipe-service.mjs";
import { MaterialCatalogService } from "./services/material-catalog-service.mjs";
import { MaterialGenerationService } from "./services/material-generation-service.mjs";

let app = null;

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

const API = {
  open: openCraftingCore,
  crafting: CraftingService,
  knowledge: KnowledgeItemService,
  get recipes() { return game.user?.isGM ? RecipeService : undefined; },
  get materials() { return game.user?.isGM ? MaterialCatalogService : undefined; },
  get generation() { return game.user?.isGM ? MaterialGenerationService : undefined; }
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
  runInitStep("D&D5e Character Sheet patch", () => CharacterSheetService.patchDnd5eSheet());
  runInitStep("Character Sheet hooks", () => CharacterSheetService.installHooks());
  runInitStep("Knowledge Item hooks", () => KnowledgeItemService.installHooks());

  console.info(`${MODULE_TITLE} | Initialized.`);
});

Hooks.once("ready", async () => {
  exposeApi();
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

  root.querySelectorAll(".crafting-core-directory-button").forEach(button => button.remove());
  const button = document.createElement("button");
  button.type = "button";
  button.className = "crafting-core-directory-button";
  button.dataset.tooltip = "Open Crafting Core";
  button.innerHTML = '<i class="fa-solid fa-hammer" inert></i><span>Crafting Core</span>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openCraftingCore();
  });
  actions.append(button);
}
