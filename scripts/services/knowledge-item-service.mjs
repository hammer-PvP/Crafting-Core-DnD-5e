import {
  DEFAULT_KNOWLEDGE_ICON,
  FLAGS,
  KNOWLEDGE_ICONS,
  KNOWLEDGE_PRICE_BY_RARITY,
  MODULE_ID
} from "../constants.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { RecipeService } from "./recipe-service.mjs";

export class KnowledgeItemService {
  static PACK_NAME = "crafting-core-learn-sources";
  static PACK_LABEL = "Crafting Core — Learn Sources";
  static PACK_ID = `world.${this.PACK_NAME}`;

  static SOURCE_FOLDERS = Object.freeze([
    { key: "Recipe", name: "Recipe" },
    { key: "Formula", name: "Formula" },
    { key: "Blueprint", name: "Blueprint" },
    { key: "Manual", name: "Manual" }
  ]);

  static pack() {
    return CompendiumService.findWorldPack(this.PACK_NAME);
  }

  static async ensurePack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: this.PACK_NAME, label: this.PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, this.SOURCE_FOLDERS);
    return pack;
  }

  static async publishRecipe(recipeId) {
    if (!game.user.isGM) throw new Error("Only a GM can publish Crafting Core knowledge sources.");
    let recipe = RecipeService.get(recipeId);
    if (!recipe) throw new Error("The selected Crafting Core draft no longer exists.");
    await RecipeService.prepareSystemLabels();
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");

    // Refresh a missing legacy output snapshot before publication so the source is autonomous.
    if (!recipe.result?.snapshot && recipe.result?.uuid) {
      const source = await fromUuid(recipe.result.uuid);
      if (!(source instanceof Item)) throw new Error(`Result Item not found: ${recipe.result.uuid}`);
      recipe.result.snapshot = source.toObject();
      recipe = await RecipeService.save(recipe);
    }

    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });

    try {
      const folders = await CompendiumService.ensurePackFolders(pack, this.SOURCE_FOLDERS);
      const label = this.#sourceType(recipe);
      const folder = folders.get(label) ?? null;
      const data = this.#knowledgeItemData(recipe, { folderId: folder?.id ?? null, published: true });

      let item = null;
      if (recipe.publication?.uuid) {
        try {
          const existing = await fromUuid(recipe.publication.uuid);
          if (existing instanceof Item && existing.pack === pack.collection) item = existing;
        } catch (_) { /* missing publication is recreated below */ }
      }
      if (!item) {
        const docs = await pack.getDocuments();
        item = docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") === recipe.id
          && Boolean(doc.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED))) ?? null;
      }

      if (item) {
        const update = foundry.utils.deepClone(data);
        update._id = item.id;
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        [item] = await ItemClass.updateDocuments([update], { pack: pack.collection });
      } else {
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        [item] = await ItemClass.createDocuments([data], { pack: pack.collection });
      }
      if (!item) throw new Error("D&D5e did not create the published Knowledge Source.");

      recipe.publication = {
        uuid: item.uuid,
        pack: pack.collection,
        sourceType: label,
        publishedAt: Number(recipe.publication?.publishedAt) || Date.now(),
        updatedAt: Date.now()
      };
      recipe = await RecipeService.save(recipe);
      await this.refreshLearnedRecipe(recipe);
      Hooks.callAll(`${MODULE_ID}.knowledgePublished`, recipe.id, item.uuid);
      return { item, recipe, pack };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  /** Legacy/testing helper. New permanent sources should be published to the private Compendium. */
  static async createForRecipe(recipeId) {
    if (!game.user.isGM) throw new Error("Only a GM can create Recipe/Blueprint Items.");
    const recipe = RecipeService.get(recipeId);
    if (!recipe) throw new Error("The selected Crafting Core recipe no longer exists.");
    await RecipeService.prepareSystemLabels();
    const data = this.#knowledgeItemData(recipe, { published: false });
    const item = await Item.create(data, { renderSheet: false });
    if (!item) throw new Error("D&D5e did not create the Recipe/Blueprint Item.");
    return item;
  }

  static #sourceType(recipe) {
    const label = String(recipe?.knowledge?.label || "Recipe");
    return Object.hasOwn(KNOWLEDGE_ICONS, label) ? label : "Recipe";
  }

  static #resultRarity(recipe) {
    return String(recipe?.result?.snapshot?.system?.rarity ?? "");
  }

  static #knowledgeItemData(recipe, { folderId=null, published=false }={}) {
    const activityId = foundry.utils.randomID(16);
    const label = this.#sourceType(recipe);
    const itemName = recipe.knowledge?.name || `${label} — ${recipe.name}`;
    const img = (!recipe.knowledge?.img || recipe.knowledge.img === "icons/svg/book.svg")
      ? (KNOWLEDGE_ICONS[label] || DEFAULT_KNOWLEDGE_ICON)
      : recipe.knowledge.img;
    const rarity = this.#resultRarity(recipe);
    const price = Number(KNOWLEDGE_PRICE_BY_RARITY[rarity] ?? 0);
    const snapshot = RecipeService.snapshot(recipe);

    const data = {
      name: itemName,
      type: "consumable",
      img,
      folder: folderId,
      system: {
        description: {
          value: this.#knowledgeDescription(recipe, label),
          chat: ""
        },
        quantity: 1,
        weight: { value: 0, units: "lb" },
        price: { value: price, denomination: "gp" },
        rarity,
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
          [FLAGS.KNOWLEDGE_RECIPE_ID]: recipe.id,
          [FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT]: snapshot,
          [FLAGS.KNOWLEDGE_SOURCE_TYPE]: label,
          [FLAGS.KNOWLEDGE_PUBLISHED]: Boolean(published),
          [FLAGS.KNOWLEDGE_PUBLISHED_AT]: published ? Date.now() : 0
        }
      },
      ownership: { default: 0 }
    };
    return data;
  }


  static #knowledgeDescription(recipe, label) {
    const visibility = RecipeService.normalizePlayerVisibility(recipe?.playerVisibility);
    const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
    const lines = [`<p>This ${escape(String(label || "Recipe").toLowerCase())} teaches <strong>${escape(recipe?.name || "Recipe")}</strong>.</p>`];

    if (visibility.description && String(recipe?.description || "").trim()) {
      const description = escape(String(recipe.description).trim()).replace(/\r?\n/g, "<br>");
      lines.push(`<section class="crafting-core-knowledge-description"><h3>Description</h3><p>${description}</p></section>`);
    }

    if (visibility.ingredients && Array.isArray(recipe?.ingredients) && recipe.ingredients.length) {
      const ingredients = recipe.ingredients.map(row => {
        const qty = visibility.ingredientQuantities ? ` ×${Math.max(1, Number(row.quantity) || 1)}` : "";
        return `<li>${escape(row.name || "Item")}${qty}</li>`;
      }).join("");
      lines.push(`<section class="crafting-core-knowledge-ingredients"><h3>Ingredients</h3><ul>${ingredients}</ul></section>`);
    }

    if (visibility.output && recipe?.result) {
      const qty = Math.max(1, Number(recipe.result.quantity) || 1);
      lines.push(`<section class="crafting-core-knowledge-output"><h3>Output</h3><p>${escape(recipe.result.name || "Item")} ×${qty}</p></section>`);
    }

    const resolution = RecipeService.normalizeCraftingResolution(recipe?.craftingResolution);
    if (visibility.proficiencies && resolution.proficiencies.length) {
      const joiner = resolution.proficiencyMatch === "all" ? " + " : " or ";
      const labels = resolution.proficiencies.map(row => RecipeService.proficiencyLabel(row)).join(joiner);
      lines.push(`<p><strong>Relevant Proficiency:</strong> ${escape(labels)}</p>`);
    }

    if (visibility.attemptPolicy) {
      const access = resolution.attemptPolicy === "requiresProficiency" ? "Requires relevant proficiency" : "Anyone";
      lines.push(`<p><strong>Who Can Attempt:</strong> ${escape(access)}</p>`);
    }

    if (visibility.craftingCheck && resolution.check.required) {
      const dc = visibility.craftingDC ? ` — DC ${resolution.check.dc}` : "";
      lines.push(`<p><strong>Crafting Check:</strong> ${escape(RecipeService.checkLabel(resolution.check))}${dc}</p>`);
    }

    if (visibility.failure && resolution.check.required) {
      let text = "No materials are lost on failure.";
      if (resolution.failure.loseMaterials) {
        text = visibility.failurePercent
          ? `${resolution.failure.lossPercent}% of the required materials are lost on failure.`
          : "Some required materials are lost on failure.";
      }
      lines.push(`<p><strong>Failure:</strong> ${escape(text)}</p>`);
    }

    if (visibility.craftingTime) {
      lines.push(`<p><strong>Crafting Time:</strong> ${Math.max(0, Number(recipe?.craftingTime) || 0)} seconds</p>`);
    }

    return lines.join("\n");
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

  static recipeSnapshotFromActivity(activity) {
    const snapshot = activity?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT]
      ?? activity?.item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
    if (snapshot && typeof snapshot === "object") return RecipeService.snapshot(snapshot);
    const legacy = RecipeService.get(this.recipeIdFromActivity(activity));
    return legacy ? RecipeService.snapshot(legacy) : null;
  }

  static learnedStore(actor) {
    const value = actor?.getFlag?.(MODULE_ID, FLAGS.LEARNED_RECIPES);
    return value && typeof value === "object" && !Array.isArray(value) ? foundry.utils.deepClone(value) : {};
  }

  static legacyKnownRecipeIds(actor) {
    const value = actor?.getFlag?.(MODULE_ID, FLAGS.KNOWN_RECIPES);
    return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  }

  static knownRecipeIds(actor) {
    return [...new Set([...Object.keys(this.learnedStore(actor)), ...this.legacyKnownRecipeIds(actor)])];
  }

  static knownRecipes(actor) {
    const learned = this.learnedStore(actor);
    const byId = new Map();
    for (const [id, entry] of Object.entries(learned)) {
      const recipe = entry?.recipe && typeof entry.recipe === "object" ? RecipeService.snapshot(entry.recipe) : null;
      if (recipe) byId.set(String(id), recipe);
    }
    // Backward compatibility for Characters from v0.0.1/v0.0.2 that have not migrated yet.
    for (const id of this.legacyKnownRecipeIds(actor)) {
      if (byId.has(id)) continue;
      const recipe = RecipeService.get(id);
      if (recipe) byId.set(id, RecipeService.snapshot(recipe));
    }
    return [...byId.values()];
  }

  static recipeForActor(actor, recipeId) {
    const id = String(recipeId);
    return this.knownRecipes(actor).find(recipe => recipe.id === id) ?? null;
  }

  static knows(actor, recipeId) {
    return Boolean(this.recipeForActor(actor, recipeId));
  }

  static async learn(actor, recipe, { sourceName="", sourceType="Recipe" }={}) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be learned by a Character Actor.");
    if (!recipe?.id) throw new Error("This Knowledge Source does not contain a valid Crafting Core recipe.");
    const snapshot = RecipeService.snapshot(recipe);
    const store = this.learnedStore(actor);
    if (store[snapshot.id]?.recipe) return false;
    store[snapshot.id] = {
      recipe: snapshot,
      learnedAt: Date.now(),
      sourceName: String(sourceName || ""),
      sourceType: String(sourceType || "Recipe")
    };
    await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
    return true;
  }

  static async refreshLearnedRecipe(recipe) {
    if (!game.user?.isGM || !recipe?.id) return 0;
    const snapshot = RecipeService.snapshot(recipe);
    let changed = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      if (!store[recipe.id]?.recipe) continue;
      store[recipe.id] = { ...store[recipe.id], recipe: snapshot, revisedAt: Date.now() };
      await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
      actor.sheet?.render?.({ force: true });
      changed += 1;
    }
    return changed;
  }

  static async migrateLegacyKnowledge() {
    if (!game.user?.isGM) return { actors: 0, items: 0 };
    let actorCount = 0;
    let itemCount = 0;

    for (const actor of game.actors?.contents ?? []) {
      if (actor.type === "character") {
        const store = this.learnedStore(actor);
        let changed = false;
        for (const id of this.legacyKnownRecipeIds(actor)) {
          if (store[id]?.recipe) continue;
          const recipe = RecipeService.get(id);
          if (!recipe) continue;
          store[id] = { recipe: RecipeService.snapshot(recipe), learnedAt: 0, sourceName: "Legacy Crafting Core", sourceType: "Recipe" };
          changed = true;
        }
        if (changed) {
          await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
          actorCount += 1;
        }
      }

      const updates = [];
      for (const item of actor.items) {
        const id = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
        if (!id || item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT)) continue;
        const recipe = RecipeService.get(id);
        if (!recipe) continue;
        updates.push({ _id: item.id, [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: RecipeService.snapshot(recipe) });
      }
      if (updates.length) {
        await actor.updateEmbeddedDocuments("Item", updates);
        itemCount += updates.length;
      }
    }

    const worldUpdates = [];
    for (const item of game.items?.contents ?? []) {
      const id = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
      if (!id || item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT)) continue;
      const recipe = RecipeService.get(id);
      if (!recipe) continue;
      worldUpdates.push({ _id: item.id, [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: RecipeService.snapshot(recipe) });
    }
    if (worldUpdates.length) {
      await Item.implementation.updateDocuments(worldUpdates);
      itemCount += worldUpdates.length;
    }
    return { actors: actorCount, items: itemCount };
  }

  static installHooks() {
    Hooks.on("dnd5e.preUseActivity", (activity, _usageConfig, dialogConfig, messageConfig) => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipe = this.recipeSnapshotFromActivity(activity);
      if (!actor || actor.type !== "character") {
        ui.notifications.warn("Only a Character can learn a Crafting Core recipe.");
        return false;
      }
      if (!recipe) {
        ui.notifications.error("This Recipe/Blueprint is no longer available and contains no stored recipe definition.");
        return false;
      }
      if (this.knows(actor, recipe.id)) {
        ui.notifications.info(`${actor.name} already knows this recipe.`);
        return false;
      }

      const eligibility = RecipeService.learningEligibility(actor, recipe);
      if (!eligibility.eligible) {
        const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
        const reason = visibility.proficiencies
          ? eligibility.reason
          : `${actor.name} does not meet the requirements to learn this recipe.`;
        ui.notifications.warn(reason);
        return false;
      }

      // Scope the native D&D5e Activity Usage button to Crafting Core Knowledge Sources only.
      if (dialogConfig) {
        dialogConfig.options ??= {};
        dialogConfig.options.button = {
          ...(dialogConfig.options.button ?? {}),
          icon: "fa-solid fa-book-open",
          label: "Learn"
        };
      }
      // Learning is intentionally quiet: no utility chat card is needed for this role-play action.
      if (messageConfig) messageConfig.create = false;
    });

    Hooks.on("dnd5e.postUseActivity", async (activity) => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipe = this.recipeSnapshotFromActivity(activity);
      try {
        if (!recipe) throw new Error("This Knowledge Source does not contain an available recipe.");
        const item = activity.item;
        const learned = await this.learn(actor, recipe, {
          sourceName: item?.name ?? "",
          sourceType: item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) ?? recipe.knowledge?.label ?? "Recipe"
        });
        if (learned) {
          ui.notifications.info(`${actor.name} learned ${recipe.name}.`);
          actor.sheet?.render?.({ force: true });
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Learn Recipe failed.`, error);
        ui.notifications.error(error.message ?? "Crafting Core could not teach that recipe.");
      }
    });
  }
}
