import { FLAGS, MODULE_ID, DEFAULT_KNOWLEDGE_ICON } from "../constants.mjs";
import { RecipeService } from "./recipe-service.mjs";

export class KnowledgeItemService {
  static async createForRecipe(recipeId) {
    if (!game.user.isGM) throw new Error("Only a GM can create Recipe/Blueprint Items.");
    const recipe = RecipeService.get(recipeId);
    if (!recipe) throw new Error("The selected Crafting Core recipe no longer exists.");

    const activityId = foundry.utils.randomID(16);
    const label = recipe.knowledge?.label || "Recipe";
    const itemName = recipe.knowledge?.name || `${label} — ${recipe.name}`;
    const img = recipe.knowledge?.img || DEFAULT_KNOWLEDGE_ICON;

    const data = {
      name: itemName,
      type: "consumable",
      img,
      system: {
        description: {
          value: `<p>This ${foundry.utils.escapeHTML(label.toLowerCase())} teaches <strong>${foundry.utils.escapeHTML(recipe.name)}</strong>.</p>`,
          chat: ""
        },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price: { value: 0, denomination: "gp" },
        rarity: "",
        identified: true,
        unidentified: { description: "" },
        container: null,
        properties: [],
        type: { value: "trinket", subtype: "" },
        identifier: itemName.slugify?.({ strict: true }) ?? itemName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        uses: { spent: 0, max: "1", recovery: [], autoDestroy: true },
        activities: {
          [activityId]: {
            _id: activityId,
            type: "utility",
            name: "Learn Recipe",
            consumption: {
              scaling: { allowed: false, max: "" },
              spellSlot: false,
              targets: [{
                type: "itemUses",
                target: "",
                value: "1",
                scaling: { mode: "", formula: "" }
              }]
            },
            roll: { formula: "", name: "", prompt: false, visible: false },
            flags: {
              [MODULE_ID]: {
                [FLAGS.KNOWLEDGE_ACTIVITY]: true,
                [FLAGS.KNOWLEDGE_RECIPE_ID]: recipe.id
              }
            }
          }
        }
      },
      flags: {
        [MODULE_ID]: {
          [FLAGS.KNOWLEDGE_RECIPE_ID]: recipe.id
        }
      }
    };

    const item = await Item.create(data, { renderSheet: false });
    if (!item) throw new Error("D&D5e did not create the Recipe/Blueprint Item.");
    return item;
  }

  static isKnowledgeActivity(activity) {
    return Boolean(activity?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_ACTIVITY]
      || activity?.item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID));
  }

  static recipeIdFromActivity(activity) {
    return String(activity?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_ID]
      ?? activity?.item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID)
      ?? "");
  }

  static knownRecipeIds(actor) {
    const value = actor?.getFlag?.(MODULE_ID, FLAGS.KNOWN_RECIPES);
    return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  }

  static knows(actor, recipeId) {
    return this.knownRecipeIds(actor).includes(String(recipeId));
  }

  static async learn(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be learned by a Character Actor.");
    const recipe = RecipeService.get(recipeId);
    if (!recipe) throw new Error("This Recipe no longer exists in Crafting Core.");
    const known = this.knownRecipeIds(actor);
    if (known.includes(recipe.id)) return false;
    known.push(recipe.id);
    await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, known);
    return true;
  }

  static installHooks() {
    Hooks.on("dnd5e.preUseActivity", (activity, _usageConfig, _dialogConfig, messageConfig) => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipeId = this.recipeIdFromActivity(activity);
      if (!actor || actor.type !== "character") {
        ui.notifications.warn("Only a Character can learn a Crafting Core recipe.");
        return false;
      }
      if (!RecipeService.get(recipeId)) {
        ui.notifications.error("This Recipe/Blueprint points to a Crafting Core recipe that no longer exists.");
        return false;
      }
      if (this.knows(actor, recipeId)) {
        ui.notifications.info(`${actor.name} already knows this recipe.`);
        return false;
      }
      // Learning is intentionally quiet: no utility chat card is needed for this role-play action.
      if (messageConfig) messageConfig.create = false;
    });

    Hooks.on("dnd5e.postUseActivity", async (activity) => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipeId = this.recipeIdFromActivity(activity);
      try {
        const learned = await this.learn(actor, recipeId);
        if (learned) {
          const recipe = RecipeService.get(recipeId);
          ui.notifications.info(`${actor.name} learned ${recipe?.name ?? "a new recipe"}.`);
          actor.sheet?.render?.({ force: true });
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Learn Recipe failed.`, error);
        ui.notifications.error(error.message ?? "Crafting Core could not teach that recipe.");
      }
    });
  }
}
