import { MODULE_ID, MODULE_TITLE } from "./constants.mjs";
import { CraftingCoreApp } from "./apps/crafting-core-app.mjs";
import { CharacterSheetService } from "./services/character-sheet-service.mjs";
import { CraftingService } from "./services/crafting-service.mjs";
import { KnowledgeItemService } from "./services/knowledge-item-service.mjs";
import { RecipeService } from "./services/recipe-service.mjs";
import { MaterialCatalogService } from "./services/material-catalog-service.mjs";

let app = null;

Hooks.once("init", () => {
  RecipeService.registerSettings();
  MaterialCatalogService.registerSettings();
  CharacterSheetService.patchDnd5eSheet();
  CharacterSheetService.installHooks();
  KnowledgeItemService.installHooks();

  game.craftingCore = {
    open: () => {
      if (!game.user.isGM) return ui.notifications.warn("Only a GM can configure Crafting Core.");
      app ??= new CraftingCoreApp();
      app.render({ force: true });
      return app;
    },
    recipes: RecipeService,
    crafting: CraftingService,
    knowledge: KnowledgeItemService,
    materials: MaterialCatalogService
  };

  console.info(`${MODULE_TITLE} | Initialized.`);
});

Hooks.once("ready", () => {
  CraftingService.ready();
  const module = game.modules.get(MODULE_ID);
  if (module) module.api = game.craftingCore;
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
  if (!game.user.isGM) return;
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
    game.craftingCore.open();
  });
  actions.append(button);
}
