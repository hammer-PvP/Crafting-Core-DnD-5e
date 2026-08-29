import {
  DEFAULT_KNOWLEDGE_ICON,
  FLAGS,
  KNOWLEDGE_ICONS,
  KNOWLEDGE_PRICE_BY_RARITY,
  MODULE_ID
} from "../constants.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { ResultDialog } from "../ui/result-dialog.mjs";

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
        // Published Knowledge Sources are fully managed by Crafting Core. Foundry deep-merges object fields
        // during document updates, so explicitly delete every previous Activity before writing the single
        // canonical Learn Recipe Activity. This makes publication idempotent and also repairs old duplicates.
        update.system ??= {};
        // Deletions must be applied before the canonical Activity is re-added. Rebuild the Activities
        // update object in that order so an already-canonical ID is not deleted after being written.
        const canonicalActivities = foundry.utils.deepClone(update.system.activities ?? {});
        const reconciledActivities = {};
        for (const activityId of Object.keys(item.system?.activities ?? {})) {
          reconciledActivities[`-=${activityId}`] = null;
        }
        Object.assign(reconciledActivities, canonicalActivities);
        update.system.activities = reconciledActivities;
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        [item] = await ItemClass.updateDocuments([update], { pack: pack.collection });

        // Enforce the post-condition instead of trusting a deep-merge implementation detail:
        // one managed Knowledge Source always has exactly one canonical Learn Recipe Activity.
        item = await pack.getDocument(item?.id ?? update._id) ?? item;
        const canonicalId = Object.keys(canonicalActivities)[0];
        const currentIds = Object.keys(item?.system?.activities ?? {});
        if (canonicalId && (currentIds.length !== 1 || currentIds[0] !== canonicalId)) {
          const activities = {};
          for (const oldId of currentIds) if (oldId !== canonicalId) activities[`-=${oldId}`] = null;
          if (!currentIds.includes(canonicalId)) activities[canonicalId] = foundry.utils.deepClone(canonicalActivities[canonicalId]);
          if (Object.keys(activities).length) {
            [item] = await ItemClass.updateDocuments([{ _id: item.id, system: { activities } }], { pack: pack.collection });
          }
        }
      } else {
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        [item] = await ItemClass.createDocuments([data], { pack: pack.collection });
      }
      if (!item) throw new Error("D&D5e did not create the published Knowledge Source.");

      // The Compendium document is the authoritative source once a Recipe is published.
      // Stamp its own UUID into managed metadata so distributed copies keep an explicit
      // link back to the source even after becoming embedded Actor Items.
      if (String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID) ?? "") !== item.uuid) {
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        [item] = await ItemClass.updateDocuments([{
          _id: item.id,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: item.uuid
        }], { pack: pack.collection });
        item = await pack.getDocument(item?.id) ?? item;
      }

      recipe.publication = {
        uuid: item.uuid,
        pack: pack.collection,
        sourceType: label,
        publishedAt: Number(recipe.publication?.publishedAt) || Date.now(),
        updatedAt: Date.now()
      };
      recipe = await RecipeService.save(recipe);

      // Synchronize from the document that was actually written to the private library,
      // never directly from the mutable Builder draft. This keeps the publication button
      // as the only boundary that can change what Characters know.
      await this.synchronizePublishedSource(item);
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
    const activityId = String(recipe?.id || foundry.utils.randomID(20)).slice(0, 16).padEnd(16, "0");
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
      let text;
      if (recipe?.craftingMode === "project") {
        if (resolution.failure.mode === "noProgress") text = "The Project stays ready; another compatible rest unlocks a new Final Check attempt.";
        else if (resolution.failure.mode === "regress") text = `Regress ${resolution.failure.regressBy} Work Period${resolution.failure.regressBy === 1 ? "" : "s"}.`;
        else {
          text = "The Project fails.";
          if (resolution.failure.loseMaterials) text += visibility.failurePercent
            ? ` ${resolution.failure.lossPercent}% of reserved materials are lost.`
            : " Some reserved materials are lost.";
          else text += " Reserved materials are returned.";
        }
      } else {
        text = "No materials are lost on failure.";
        if (resolution.failure.loseMaterials) text = visibility.failurePercent
          ? `${resolution.failure.lossPercent}% of the required materials are lost on failure.`
          : "Some required materials are lost on failure.";
      }
      lines.push(`<p><strong>Failure:</strong> ${escape(text)}</p>`);
    }

    if (visibility.craftingTime) {
      if (recipe?.craftingMode === "project") {
        const project = RecipeService.normalizeProject(recipe?.project);
        const cadence = project.cadence === "short" ? "Short Rest" : "Long Rest";
        lines.push(`<p><strong>Crafting Project:</strong> ${project.requiredWork} Work Period${project.requiredWork === 1 ? "" : "s"} · ${cadence} cadence</p>`);
      } else {
        lines.push(`<p><strong>Crafting Time:</strong> ${Math.max(0, Number(recipe?.craftingTime) || 0)} seconds</p>`);
      }
    }

    if (recipe?.craftingMode === "project") {
      const project = RecipeService.normalizeProject(recipe?.project);
      if (visibility.progressCheck && project.progressCheck.required) {
        const timing = project.progressCheck.timing === "midpoint" ? "Midpoint only" : "Every Work Period";
        const dc = visibility.progressDC ? ` · DC ${project.progressCheck.dc}` : "";
        lines.push(`<p><strong>Progress Check:</strong> ${escape(RecipeService.checkLabel(project.progressCheck))}${dc} · ${timing}</p>`);
      }
      if (visibility.progressFailure && project.progressCheck.required) {
        const failure = project.progressCheck.failure;
        let text = "No progress on failure.";
        if (failure.mode === "regress") text = `Regress ${failure.regressBy} Work Period${failure.regressBy === 1 ? "" : "s"}.`;
        if (failure.mode === "failProject") {
          text = "The Project fails.";
          if (failure.loseMaterials) text += visibility.progressFailurePercent
            ? ` ${failure.lossPercent}% of reserved materials are lost.`
            : " Some reserved materials are lost.";
          else text += " Reserved materials are returned.";
        }
        lines.push(`<p><strong>Progress Failure:</strong> ${escape(text)}</p>`);
      }
      if (visibility.extraEffort && project.extraEffort.enabled) {
        let text = `One Extra Effort attempt is available after each normal Work Attempt. Success grants +${project.extraEffort.progressGain} Work Progress.`;
        if (visibility.extraEffortCheck) text += ` Check: ${RecipeService.checkLabel(project.extraEffort)}`;
        if (visibility.extraEffortCheck && visibility.extraEffortDC) text += ` · DC ${project.extraEffort.dc}`;
        if (visibility.extraEffortFailure) text += project.extraEffort.failure.mode === "regress"
          ? ` · Failure regresses ${project.extraEffort.failure.regressBy} Work Period${project.extraEffort.failure.regressBy === 1 ? "" : "s"}.`
          : " · Failure grants no extra progress.";
        lines.push(`<p><strong>Extra Effort:</strong> ${escape(text)}</p>`);
      }
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
    // A copy that came from the published library must never fall back to the mutable
    // Builder draft. If its authoritative source was removed, the copy becomes invalid.
    if (this.publishedSourceUuidFromItem(activity?.item)) return null;
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

  static publishedSourceUuidFromItem(item) {
    if (!item) return "";
    const explicit = String(item.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID) ?? "");
    if (explicit) return explicit;
    if (item.pack === this.PACK_ID) return String(item.uuid || "");
    const candidates = [
      item.getFlag?.("dnd5e", "sourceId"),
      item._stats?.compendiumSource,
      item.flags?.core?.sourceId,
      item._stats?.duplicateSource
    ].filter(Boolean).map(String);
    const prefix = `Compendium.${this.PACK_ID}.Item.`;
    return candidates.find(candidate => candidate.startsWith(prefix)) ?? "";
  }

  static publishedRecipeSnapshot(item) {
    const snapshot = item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
    if (!snapshot || typeof snapshot !== "object") return null;
    return RecipeService.snapshot(snapshot);
  }

  static async publishedItemForRecipe(recipeId) {
    const id = String(recipeId || "");
    if (!id) return null;
    const draft = RecipeService.get(id);
    if (draft?.publication?.uuid) {
      try {
        const item = await fromUuid(draft.publication.uuid);
        if (item instanceof Item && item.pack === this.PACK_ID
          && String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") === id
          && Boolean(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED))) return item;
      } catch (_) { /* fall through to pack scan */ }
    }
    const pack = this.pack();
    if (!pack) return null;
    const docs = await pack.getDocuments();
    return docs.find(item => String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") === id
      && Boolean(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED))) ?? null;
  }

  static async learn(actor, recipe, { sourceName="", sourceType="Recipe", publishedSourceUuid="" }={}) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be learned by a Character Actor.");
    if (!recipe?.id) throw new Error("This Knowledge Source does not contain a valid Crafting Core recipe.");
    const snapshot = RecipeService.snapshot(recipe);
    const store = this.learnedStore(actor);
    if (store[snapshot.id]?.recipe) return false;
    store[snapshot.id] = {
      recipe: snapshot,
      publishedSourceUuid: String(publishedSourceUuid || ""),
      learnedAt: Date.now(),
      sourceName: String(sourceName || ""),
      sourceType: String(sourceType || "Recipe")
    };
    await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
    return true;
  }

  static async unlearn(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be forgotten by a Character Actor.");
    if (!game.user?.isGM && !actor.isOwner) throw new Error("You do not have permission to change this Character's known Recipes.");
    const id = String(recipeId || "");
    if (!id) return false;
    const job = actor.getFlag?.(MODULE_ID, FLAGS.CRAFTING_JOB);
    if (String(job?.recipeId ?? "") === id && ["active", "finalizing"].includes(String(job?.status ?? ""))) {
      throw new Error(job?.mode === "project"
        ? "This Recipe is currently being used by the active Crafting Project. Complete or cancel the Project before forgetting it."
        : "This Recipe is currently being crafted. Wait for the current craft to finish before forgetting it.");
    }

    const store = this.learnedStore(actor);
    const legacy = this.legacyKnownRecipeIds(actor);
    const had = Boolean(store[id] || legacy.includes(id));
    if (!had) return false;
    delete store[id];
    await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
    if (legacy.includes(id)) await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, legacy.filter(entry => entry !== id));
    actor.sheet?.render?.({ force: true });
    return true;
  }

  static async removeRecipeFromAllActors(recipeId, { publishedSourceUuid="" }={}) {
    if (!game.user?.isGM) return 0;
    const id = String(recipeId || "");
    const sourceUuid = String(publishedSourceUuid || "");
    let changed = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      const legacy = this.legacyKnownRecipeIds(actor);
      const entry = store[id];
      const sourceMatches = sourceUuid && String(entry?.publishedSourceUuid || "") === sourceUuid;
      if (!entry && !legacy.includes(id)) continue;
      if (entry && sourceUuid && entry.publishedSourceUuid && !sourceMatches) continue;
      delete store[id];
      await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
      if (legacy.includes(id)) await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, legacy.filter(entryId => entryId !== id));
      actor.sheet?.render?.({ force: true });
      changed += 1;
    }
    return changed;
  }

  static async #synchronizeDistributedCopies(item, snapshot) {
    if (!game.user?.isGM || !item || !snapshot?.id) return 0;
    const sourceUuid = String(item.uuid || "");
    const recipeId = String(snapshot.id);
    let changed = 0;

    const updateCopy = async copy => {
      if (!copy || copy.pack === this.PACK_ID) return;
      if (String(copy.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") !== recipeId) return;
      const linked = this.publishedSourceUuidFromItem(copy);
      // Copies created before v0.1.1 may not carry the explicit source flag. A matching
      // recipeId is sufficient because a Crafting Core Recipe has one authoritative source.
      if (linked && linked !== sourceUuid) return;
      const current = copy.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
      const currentSource = String(copy.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID) ?? "");
      const sameSnapshot = JSON.stringify(current ?? null) === JSON.stringify(snapshot);
      if (sameSnapshot && currentSource === sourceUuid) return;
      await copy.update({
        name: item.name,
        img: item.img,
        "system.description.value": String(item.system?.description?.value ?? copy.system?.description?.value ?? ""),
        "system.rarity": item.system?.rarity ?? copy.system?.rarity ?? "",
        "system.price": foundry.utils.deepClone(item.system?.price ?? copy.system?.price ?? { value: 0, denomination: "gp" }),
        [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: snapshot,
        [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: sourceUuid
      });
      changed += 1;
    };

    for (const worldItem of game.items?.contents ?? []) await updateCopy(worldItem);
    for (const actor of game.actors?.contents ?? []) for (const actorItem of actor.items ?? []) await updateCopy(actorItem);
    return changed;
  }

  static async #invalidateDistributedCopies(recipeId, publishedSourceUuid="") {
    if (!game.user?.isGM) return 0;
    const id = String(recipeId || "");
    const sourceUuid = String(publishedSourceUuid || "");
    let changed = 0;
    const invalidate = async copy => {
      if (!copy || copy.pack === this.PACK_ID) return;
      if (String(copy.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") !== id) return;
      const linked = this.publishedSourceUuidFromItem(copy);
      if (sourceUuid && linked && linked !== sourceUuid) return;
      await copy.update({
        [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: null,
        [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: sourceUuid || linked
      });
      changed += 1;
    };
    for (const worldItem of game.items?.contents ?? []) await invalidate(worldItem);
    for (const actor of game.actors?.contents ?? []) for (const actorItem of actor.items ?? []) await invalidate(actorItem);
    return changed;
  }

  static async synchronizePublishedSource(item) {
    if (!game.user?.isGM || !item) return { actors: 0, copies: 0 };
    const recipeId = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
    const snapshot = this.publishedRecipeSnapshot(item);
    if (!recipeId || !snapshot || item.pack !== this.PACK_ID || !item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) {
      throw new Error("Crafting Core could not synchronize an invalid published Knowledge Source.");
    }
    const sourceUuid = String(item.uuid || "");
    let actors = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      const legacy = this.legacyKnownRecipeIds(actor);
      if (!store[recipeId] && !legacy.includes(recipeId)) continue;
      const existing = store[recipeId] ?? {};
      store[recipeId] = {
        ...existing,
        recipe: snapshot,
        publishedSourceUuid: sourceUuid,
        revisedAt: Date.now(),
        sourceName: String(existing.sourceName || item.name || ""),
        sourceType: String(existing.sourceType || item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || "Recipe")
      };
      await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
      if (legacy.includes(recipeId)) await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, legacy.filter(id => id !== recipeId));
      actor.sheet?.render?.({ force: true });
      actors += 1;
    }
    const copies = await this.#synchronizeDistributedCopies(item, snapshot);
    return { actors, copies };
  }

  static async refreshLearnedRecipe(recipe) {
    // Backward-compatible API for integrations. Published Recipes synchronize from the
    // Compendium source; unpublished drafts are intentionally unable to change learned data.
    if (!game.user?.isGM || !recipe?.id) return 0;
    const item = await this.publishedItemForRecipe(recipe.id);
    if (!item) return 0;
    return (await this.synchronizePublishedSource(item)).actors;
  }

  static async handlePublishedSourceDeleted(item) {
    if (!game.user?.isGM || !item || item.pack !== this.PACK_ID) return 0;
    if (!item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) return 0;
    const recipeId = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
    if (!recipeId) return 0;
    const sourceUuid = String(item.uuid || "");
    const removed = await this.removeRecipeFromAllActors(recipeId, { publishedSourceUuid: sourceUuid });
    await this.#invalidateDistributedCopies(recipeId, sourceUuid);
    const draft = RecipeService.get(recipeId);
    if (draft?.publication?.uuid === sourceUuid) {
      draft.publication = null;
      await RecipeService.save(draft);
    }
    console.info(`${MODULE_ID} | Published Recipe ${recipeId} was deleted; removed from ${removed} Character(s).`);
    return removed;
  }

  static async deletePublishedSource(recipeId) {
    if (!game.user?.isGM) throw new Error("Only a GM can delete published Crafting Core Recipes.");
    const item = await this.publishedItemForRecipe(recipeId);
    if (!item) {
      const draft = RecipeService.get(recipeId);
      if (draft?.publication) {
        draft.publication = null;
        await RecipeService.save(draft);
      }
      await this.removeRecipeFromAllActors(recipeId);
      return false;
    }
    const pack = this.pack();
    const wasLocked = Boolean(pack?.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
      await ItemClass.deleteDocuments([item.id], { pack: item.pack });
      // The deleteItem hook performs the canonical cleanup. Run an idempotent fallback
      // as protection for Foundry/API paths that suppress hooks.
      await this.handlePublishedSourceDeleted(item);
      return true;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async reconcilePublishedKnowledge() {
    if (!game.user?.isGM) return { actorsUpdated: 0, actorsRemoved: 0, draftsRecovered: 0, draftsRelinked: 0, draftsUnlinked: 0, copiesInvalidated: 0 };
    const pack = this.pack();
    const docs = pack ? await pack.getDocuments() : [];
    const publishedById = new Map();
    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) continue;
      const id = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
      if (id) publishedById.set(id, item);
    }

    let actorsUpdated = 0;
    let actorsRemoved = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      const legacy = this.legacyKnownRecipeIds(actor);
      const allIds = new Set([...Object.keys(store), ...legacy]);
      let changed = false;
      for (const id of allIds) {
        const item = publishedById.get(id);
        if (!item) {
          if (store[id]) delete store[id];
          changed = true;
          actorsRemoved += 1;
          continue;
        }
        const snapshot = this.publishedRecipeSnapshot(item);
        if (!snapshot) continue;
        const existing = store[id] ?? {};
        const sourceUuid = String(item.uuid || "");
        if (JSON.stringify(existing.recipe ?? null) !== JSON.stringify(snapshot)
          || String(existing.publishedSourceUuid || "") !== sourceUuid
          || legacy.includes(id)) {
          store[id] = {
            ...existing,
            recipe: snapshot,
            publishedSourceUuid: sourceUuid,
            revisedAt: Date.now(),
            sourceName: String(existing.sourceName || item.name || ""),
            sourceType: String(existing.sourceType || item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || "Recipe")
          };
          changed = true;
          actorsUpdated += 1;
        }
      }
      if (changed) {
        await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
        const keptLegacy = legacy.filter(id => publishedById.has(id) && !store[id]);
        if (keptLegacy.length !== legacy.length) await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, keptLegacy);
        actor.sheet?.render?.({ force: true });
      }
    }

    let draftsRecovered = 0;
    let draftsRelinked = 0;
    for (const [recipeId, item] of publishedById) {
      const snapshot = this.publishedRecipeSnapshot(item);
      if (!snapshot) continue;
      const publication = {
        uuid: String(item.uuid || ""),
        pack: String(item.pack || this.PACK_ID),
        sourceType: String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || snapshot.knowledge?.label || "Recipe"),
        publishedAt: Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(),
        updatedAt: Number(item._stats?.modifiedTime) || Date.now()
      };
      const draft = RecipeService.get(recipeId);
      if (!draft) {
        await RecipeService.save({ ...snapshot, publication });
        draftsRecovered += 1;
        continue;
      }
      if (String(draft.publication?.uuid || "") !== publication.uuid) {
        draft.publication = publication;
        await RecipeService.save(draft);
        draftsRelinked += 1;
      }
    }

    let draftsUnlinked = 0;
    for (const draft of RecipeService.list()) {
      if (!draft.publication?.uuid) continue;
      const item = publishedById.get(draft.id);
      if (item?.uuid === draft.publication.uuid) continue;
      draft.publication = null;
      await RecipeService.save(draft);
      draftsUnlinked += 1;
    }

    // Safety net for a source removed while Crafting Core was disabled: invalidate any
    // remaining distributed copies that still point at a missing authoritative UUID.
    const validSourceUuids = new Set([...publishedById.values()].map(item => String(item.uuid || "")));
    let copiesInvalidated = 0;
    const inspectCopy = async copy => {
      if (!copy || copy.pack === this.PACK_ID) return;
      const recipeId = String(copy.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
      const sourceUuid = this.publishedSourceUuidFromItem(copy);
      if (!recipeId || !sourceUuid || validSourceUuids.has(sourceUuid)) return;
      const prefix = `Compendium.${this.PACK_ID}.Item.`;
      if (!sourceUuid.startsWith(prefix)) return;
      await copy.update({ [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: null });
      copiesInvalidated += 1;
    };
    for (const worldItem of game.items?.contents ?? []) await inspectCopy(worldItem);
    for (const actor of game.actors?.contents ?? []) for (const actorItem of actor.items ?? []) await inspectCopy(actorItem);

    return { actorsUpdated, actorsRemoved, draftsRecovered, draftsRelinked, draftsUnlinked, copiesInvalidated };
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
        void ResultDialog.show({
          title: "Unable to Learn Recipe",
          message: reason,
          facts: visibility.proficiencies && eligibility.rows?.length
            ? eligibility.rows.filter(row => !row.proficient).map(row => `Missing proficiency: ${row.label}`)
            : [],
          tone: "warning",
          icon: "fa-solid fa-book"
        });
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
          sourceType: item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) ?? recipe.knowledge?.label ?? "Recipe",
          publishedSourceUuid: this.publishedSourceUuidFromItem(item)
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

    // Deleting a distributed copy from an Actor inventory is intentionally ignored.
    // Only deletion of the authoritative private-Compendium source makes Characters forget.
    Hooks.on("deleteItem", (item) => {
      if (!game.user?.isGM || item?.pack !== this.PACK_ID) return;
      if (!item.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) return;
      void this.handlePublishedSourceDeleted(item).catch(error => {
        console.error(`${MODULE_ID} | Published Knowledge Source deletion cleanup failed.`, error);
      });
    });
  }
}
