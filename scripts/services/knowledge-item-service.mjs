import {
  DEFAULT_KNOWLEDGE_ICON,
  FLAGS,
  KNOWLEDGE_ICONS,
  KNOWLEDGE_PRICE_BY_RARITY,
  MODULE_ID,
  SETTINGS
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

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.PUBLISHED_RECIPE_INDEX, {
      name: "Crafting Core Published Recipe Index",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }

  static pack() {
    return CompendiumService.findWorldPack(this.PACK_NAME);
  }

  static async ensurePack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: this.PACK_NAME, label: this.PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, this.SOURCE_FOLDERS);
    return pack;
  }

  static publishedIndex() {
    const value = game.settings.get(MODULE_ID, SETTINGS.PUBLISHED_RECIPE_INDEX);
    return value && typeof value === "object" && !Array.isArray(value) ? foundry.utils.deepClone(value) : {};
  }

  static async #savePublishedIndex(index) {
    if (!game.user?.isGM) return;
    await game.settings.set(MODULE_ID, SETTINGS.PUBLISHED_RECIPE_INDEX, index && typeof index === "object" ? index : {});
  }

  static publicationForRecipe(recipeId) {
    return this.publishedIndex()[String(recipeId)] ?? null;
  }

  static #markObjectKeyForDeletion(update, path, key) {
    const cleanPath = String(path || "").replace(/\.+$/g, "");
    const cleanKey = String(key || "");
    if (!cleanPath || !cleanKey) return;
    // Foundry v14's public update API prefers the global _del DataFieldOperator for TypedObjectField keys.
    // Keep the legacy -= form only as a compatibility fallback for test harnesses/older shims.
    if (globalThis._del !== undefined) update[`${cleanPath}.${cleanKey}`] = globalThis._del;
    else update[`${cleanPath}.-=${cleanKey}`] = null;
  }

  static #sourceRecipeId(item) {
    return String(item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
  }

  static #sourceSnapshot(item) {
    const snapshot = item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
    return snapshot && typeof snapshot === "object" ? RecipeService.snapshot(snapshot) : null;
  }

  static #sourceUuid(item) {
    if (!item) return "";
    if (item.pack === this.PACK_ID || item.pack === this.pack()?.collection) return String(item.uuid ?? "");
    return String(
      item.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID)
      || item?._stats?.compendiumSource
      || item.getFlag?.("dnd5e", "sourceId")
      || ""
    );
  }

  static #sourceRevision(item, recipeId="") {
    const explicit = Math.max(0, Math.floor(Number(item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION)) || 0));
    if (explicit) return explicit;
    const indexed = this.publicationForRecipe(recipeId || this.#sourceRecipeId(item));
    return Math.max(0, Math.floor(Number(indexed?.revision) || 0));
  }

  static #isAuthoritativeSource(item) {
    if (!item) return false;
    const samePack = item.pack === this.PACK_ID || item.pack === this.pack()?.collection;
    return Boolean(samePack && item.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED));
  }

  static #publishedIdentityFromItem(item, recipeId="") {
    const id = String(recipeId || this.#sourceRecipeId(item));
    const indexed = this.publicationForRecipe(id);
    const sourceUuid = this.#sourceUuid(item);
    const revision = this.#sourceRevision(item, id);
    return { recipeId: id, sourceUuid, revision, indexed };
  }

  static #assertPublishedIdentity(item, recipeId="") {
    const identity = this.#publishedIdentityFromItem(item, recipeId);
    if (!identity.recipeId || !identity.sourceUuid || !identity.indexed?.uuid) {
      throw new Error("This Knowledge Source is no longer published in Crafting Core.");
    }
    if (String(identity.indexed.uuid) !== String(identity.sourceUuid)) {
      throw new Error("This Knowledge Source no longer matches the currently published Recipe.");
    }
    return {
      recipeId: identity.recipeId,
      sourceUuid: String(identity.indexed.uuid),
      revision: Math.max(1, Math.floor(Number(identity.indexed.revision) || identity.revision || 1))
    };
  }

  static async publishRecipe(recipeId) {
    if (!game.user?.isGM) throw new Error("Only a GM can publish Crafting Core knowledge sources.");
    let recipe = RecipeService.get(recipeId);
    if (!recipe) throw new Error("The selected Crafting Core draft no longer exists.");
    await RecipeService.prepareSystemLabels();
    if (!recipe.result?.uuid && !recipe.result?.snapshot) throw new Error("The recipe has no result Item configured.");

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
      let item = await this.#resolvePublishedSource(recipe, pack);
      const priorRevision = Math.max(
        0,
        Math.floor(Number(recipe.publication?.revision) || 0),
        Math.floor(Number(item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION)) || 0)
      );
      const revision = priorRevision + 1;
      const data = this.#knowledgeItemData(recipe, {
        folderId: folder?.id ?? null,
        published: true,
        publishedSourceUuid: item?.uuid ?? "",
        publishedRevision: revision
      });

      if (item) {
        const canonicalActivities = foundry.utils.deepClone(data.system?.activities ?? {});
        const update = foundry.utils.deepClone(data);
        delete update._id;
        update.system ??= {};
        const activities = {};
        for (const activityId of Object.keys(item.system?.activities ?? {})) activities[`-=${activityId}`] = null;
        Object.assign(activities, canonicalActivities);
        update.system.activities = activities;
        update.flags[MODULE_ID][FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID] = item.uuid;
        update.flags[MODULE_ID][FLAGS.KNOWLEDGE_PUBLISHED_REVISION] = revision;
        await item.update(update, { diff: true, craftingCorePublication: true });
        item = await pack.getDocument(item.id) ?? item;
      } else {
        const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
        const created = await ItemClass.createDocuments([data], { pack: pack.collection, craftingCorePublication: true });
        item = created?.[0] ?? null;
        if (!item) item = await this.#findPublishedSourceByRecipeId(recipe.id, pack);
        if (!item) throw new Error("D&D5e did not create the published Knowledge Source.");
        await item.update({
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: item.uuid,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_REVISION}`]: revision
        }, { craftingCorePublication: true });
        item = await pack.getDocument(item.id) ?? item;
      }

      item = await this.#verifyPublishedSource(item, recipe.id, revision);

      recipe.publication = {
        uuid: item.uuid,
        pack: pack.collection,
        sourceType: label,
        publishedAt: Number(recipe.publication?.publishedAt) || Date.now(),
        updatedAt: Date.now(),
        revision
      };
      recipe = await RecipeService.save(recipe);

      const index = this.publishedIndex();
      index[recipe.id] = { uuid: item.uuid, revision, sourceType: label, updatedAt: Date.now() };
      await this.#savePublishedIndex(index);
      // The authoritative Compendium write is already committed at this point. Downstream Actor/copy
      // synchronization is best-effort and must never turn a successful publication into a false failure.
      const actorSync = await this.#refreshLearnedRecipeReport(recipe, { item, revision });
      const copySync = await this.#refreshKnowledgeCopiesReport(item, revision);
      Hooks.callAll(`${MODULE_ID}.knowledgePublished`, recipe.id, item.uuid, revision);
      return {
        item, recipe, pack, revision,
        synchronizedActors: actorSync.updated,
        actorSyncFailures: actorSync.failed,
        synchronizedCopies: copySync.updated,
        copySyncFailures: copySync.failed
      };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #resolvePublishedSource(recipe, pack) {
    let item = null;
    if (recipe?.publication?.uuid) {
      try {
        const existing = await fromUuid(recipe.publication.uuid);
        if (existing instanceof Item && existing.pack === pack.collection) item = existing;
      } catch (_) { /* fall through */ }
    }
    return item ?? this.#findPublishedSourceByRecipeId(recipe?.id, pack);
  }

  static async #findPublishedSourceByRecipeId(recipeId, pack=this.pack()) {
    if (!pack || !recipeId) return null;
    const docs = await pack.getDocuments();
    return docs.find(doc => String(doc.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "") === String(recipeId)
      && Boolean(doc.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED))) ?? null;
  }

  static async #verifyPublishedSource(item, recipeId, revision) {
    if (!(item instanceof Item)) throw new Error("Crafting Core could not resolve the published Knowledge Source after saving it.");
    const pack = this.pack();
    if (pack && item.id) item = await pack.getDocument(item.id) ?? item;

    const actualId = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
    const actualRevision = Math.max(0, Math.floor(Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION)) || 0));
    const snapshot = item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
    if (actualId !== String(recipeId) || actualRevision !== Number(revision) || !snapshot || typeof snapshot !== "object") {
      throw new Error("The Knowledge Source was saved, but Crafting Core could not verify its published Recipe data.");
    }

    // Publication has one and only one canonical Learn Recipe Activity. D&D5e/Foundry document updates
    // deep-merge activity objects, so verify the post-condition and repair any legacy duplicates explicitly.
    const expectedId = String(recipeId).slice(0, 16).padEnd(16, "0");
    let activityIds = Object.keys(item.system?.activities ?? {});
    const activity = item.system?.activities?.[expectedId];
    const canonical = activityIds.length === 1
      && activityIds[0] === expectedId
      && Boolean(activity?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_ACTIVITY])
      && String(activity?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_ID] ?? "") === String(recipeId);

    if (!canonical) {
      const sourceRecipe = this.#sourceSnapshot(item);
      if (!sourceRecipe) throw new Error("The published Knowledge Source lost its Recipe snapshot while reconciling its Learn Recipe Activity.");
      const canonicalData = this.#knowledgeItemData(sourceRecipe, {
        published: true,
        publishedSourceUuid: item.uuid,
        publishedRevision: revision
      }).system.activities[expectedId];
      const activities = {};
      for (const oldId of activityIds) activities[`-=${oldId}`] = null;
      activities[expectedId] = foundry.utils.deepClone(canonicalData);
      await item.update({ system: { activities } }, { diff: true, craftingCorePublication: true });
      if (pack && item.id) item = await pack.getDocument(item.id) ?? item;
      activityIds = Object.keys(item.system?.activities ?? {});
      const repaired = item.system?.activities?.[expectedId];
      if (activityIds.length !== 1 || activityIds[0] !== expectedId
        || !repaired?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_ACTIVITY]
        || String(repaired?.flags?.[MODULE_ID]?.[FLAGS.KNOWLEDGE_RECIPE_ID] ?? "") !== String(recipeId)) {
        throw new Error("The Recipe was saved, but Crafting Core could not reconcile its Learn Recipe Activity.");
      }
    }
    return item;
  }

  static async deletePublishedSource(recipeId) {
    if (!game.user?.isGM) throw new Error("Only a GM can delete a published Crafting Core Recipe.");
    const recipe = RecipeService.get(recipeId);
    const pack = this.pack();
    const item = pack ? await this.#resolvePublishedSource(recipe ?? { id: recipeId }, pack) : null;
    if (item) {
      const wasLocked = Boolean(pack.locked);
      if (wasLocked) await pack.configure({ locked: false });
      try { await item.delete({ craftingCorePublication: true }); }
      finally { if (wasLocked) await pack.configure({ locked: true }); }
    }
    await this.#handlePublishedSourceRemoved({ recipeId: String(recipeId), sourceUuid: item?.uuid ?? recipe?.publication?.uuid ?? "" });
    return Boolean(item);
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

  static #knowledgeItemData(recipe, { folderId=null, published=false, publishedSourceUuid="", publishedRevision=0 }={}) {
    const activityId = String(recipe?.id || foundry.utils.randomID(20)).slice(0, 16).padEnd(16, "0");
    const label = this.#sourceType(recipe);
    const itemName = recipe.knowledge?.name || `${label} — ${recipe.name}`;
    const img = (!recipe.knowledge?.img || recipe.knowledge.img === "icons/svg/book.svg")
      ? (KNOWLEDGE_ICONS[label] || DEFAULT_KNOWLEDGE_ICON)
      : recipe.knowledge.img;
    const rarity = this.#resultRarity(recipe);
    const price = Number(KNOWLEDGE_PRICE_BY_RARITY[rarity] ?? 0);
    const snapshot = RecipeService.snapshot(recipe);

    return {
      name: itemName,
      type: "consumable",
      img,
      folder: folderId,
      system: {
        description: { value: this.#knowledgeDescription(recipe, label), chat: "" },
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
              targets: [{ type: "itemUses", target: "", value: "1", scaling: { mode: "", formula: "" } }]
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
          [FLAGS.KNOWLEDGE_PUBLISHED_AT]: published ? Date.now() : 0,
          [FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID]: String(publishedSourceUuid || ""),
          [FLAGS.KNOWLEDGE_PUBLISHED_REVISION]: Math.max(0, Math.floor(Number(publishedRevision) || 0))
        }
      },
      ownership: { default: 0 }
    };
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
    return snapshot && typeof snapshot === "object" ? RecipeService.snapshot(snapshot) : null;
  }

  static learnedStore(actor) {
    const value = actor?.getFlag?.(MODULE_ID, FLAGS.LEARNED_RECIPES);
    return value && typeof value === "object" && !Array.isArray(value) ? foundry.utils.deepClone(value) : {};
  }

  static legacyKnownRecipeIds(actor) {
    const value = actor?.getFlag?.(MODULE_ID, FLAGS.KNOWN_RECIPES);
    return Array.isArray(value) ? [...new Set(value.map(String).filter(Boolean))] : [];
  }

  static knownRecipeEntries(actor) {
    const store = this.learnedStore(actor);
    return Object.entries(store).flatMap(([id, entry]) => {
      const recipe = entry?.recipe && typeof entry.recipe === "object" ? RecipeService.snapshot(entry.recipe) : null;
      if (!recipe) return [];
      return [{
        id: String(id),
        recipe,
        publishedSourceUuid: String(entry?.publishedSourceUuid || ""),
        publishedRevision: Math.max(0, Math.floor(Number(entry?.publishedRevision) || 0)),
        learnedAt: Number(entry?.learnedAt) || 0,
        sourceName: String(entry?.sourceName || ""),
        sourceType: String(entry?.sourceType || "Recipe")
      }];
    });
  }

  static knownRecipeIds(actor) {
    return this.knownRecipeEntries(actor).map(entry => entry.id);
  }

  static knownRecipes(actor) {
    return this.knownRecipeEntries(actor).map(entry => entry.recipe);
  }

  static entryForActor(actor, recipeId) {
    const id = String(recipeId);
    return this.knownRecipeEntries(actor).find(entry => entry.id === id) ?? null;
  }

  static recipeForActor(actor, recipeId) {
    return this.entryForActor(actor, recipeId)?.recipe ?? null;
  }

  static knows(actor, recipeId) {
    return Boolean(this.entryForActor(actor, recipeId));
  }

  static async learn(actor, recipe, { sourceName="", sourceType="Recipe", sourceUuid="", publishedRevision=0 }={}) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be learned by a Character Actor.");
    if (!recipe?.id) throw new Error("This Knowledge Source does not contain a valid Crafting Core recipe.");
    const indexed = this.publicationForRecipe(recipe.id);
    if (!indexed?.uuid || String(indexed.uuid) !== String(sourceUuid || "")) {
      throw new Error("This Knowledge Source is no longer the published version of that Recipe.");
    }
    const snapshot = RecipeService.snapshot(recipe);
    const store = this.learnedStore(actor);
    if (store[snapshot.id]?.recipe) return false;
    const entry = {
      recipe: snapshot,
      publishedSourceUuid: String(indexed.uuid),
      publishedRevision: Math.max(1, Math.floor(Number(indexed.revision) || publishedRevision || 1)),
      learnedAt: Date.now(),
      sourceName: String(sourceName || ""),
      sourceType: String(sourceType || "Recipe")
    };
    await actor.update({ [`flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}.${snapshot.id}`]: entry }, { craftingCoreKnowledgeSync: true });
    return true;
  }

  static async unlearn(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be forgotten by a Character Actor.");
    const id = String(recipeId || "");
    if (!id) return false;
    const job = actor.getFlag?.(MODULE_ID, FLAGS.CRAFTING_JOB);
    if (job?.mode === "project" && job?.status === "active" && String(job.recipeId || "") === id) {
      throw new Error("This Recipe is currently being used by the active Crafting Project. Complete or cancel that Project before forgetting it.");
    }
    const store = this.learnedStore(actor);
    const legacy = this.legacyKnownRecipeIds(actor);
    const existed = Boolean(store[id]) || legacy.includes(id);
    if (!existed) return false;
    const remainingLegacy = legacy.filter(value => value !== id);
    const update = {};
    if (store[id]) this.#markObjectKeyForDeletion(update, `flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}`, id);
    if (legacy.length) update[`flags.${MODULE_ID}.${FLAGS.KNOWN_RECIPES}`] = remainingLegacy;
    await actor.update(update, { craftingCoreKnowledgeSync: true, craftingCoreUnlearn: id });
    if (this.learnedStore(actor)[id] || this.legacyKnownRecipeIds(actor).includes(id)) {
      throw new Error("Crafting Core could not persist the Recipe removal on this Character.");
    }
    return true;
  }

  static async refreshLearnedRecipe(recipe, { item=null, revision=0 }={}) {
    const report = await this.#refreshLearnedRecipeReport(recipe, { item, revision });
    return report.updated;
  }

  static async #refreshLearnedRecipeReport(recipe, { item=null, revision=0 }={}) {
    if (!game.user?.isGM || !recipe?.id) return { updated: 0, failed: 0 };
    const sourceUuid = String(item?.uuid || recipe.publication?.uuid || this.publicationForRecipe(recipe.id)?.uuid || "");
    const publishedRevision = Math.max(1, Math.floor(Number(revision) || Number(recipe.publication?.revision) || 1));
    const snapshot = item ? (this.#sourceSnapshot(item) ?? RecipeService.snapshot(recipe)) : RecipeService.snapshot(recipe);
    let updated = 0;
    let failed = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      if (!store[recipe.id]?.recipe) continue;
      const entry = {
        ...store[recipe.id],
        recipe: snapshot,
        publishedSourceUuid: sourceUuid,
        publishedRevision,
        revisedAt: Date.now()
      };
      try {
        await actor.update({ [`flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}.${recipe.id}`]: entry }, {
          craftingCoreKnowledgeSync: true,
          craftingCoreRecipeId: recipe.id,
          craftingCorePublishedRevision: publishedRevision
        });
        updated += 1;
      } catch (error) {
        failed += 1;
        console.error(`${MODULE_ID} | Published Recipe was saved, but Character knowledge sync failed for ${actor.name}.`, error);
      }
    }
    return { updated, failed };
  }

  static async forgetRecipeEverywhere(recipeId, { sourceUuid="" }={}) {
    if (!game.user?.isGM) return 0;
    const id = String(recipeId || "");
    let changed = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      const legacy = this.legacyKnownRecipeIds(actor);
      const entry = store[id];
      const sourceMatches = !sourceUuid || !entry?.publishedSourceUuid || String(entry.publishedSourceUuid) === String(sourceUuid);
      const hadLegacy = legacy.includes(id);
      if (!((entry && sourceMatches) || hadLegacy)) continue;
      const update = {};
      if (entry && sourceMatches) this.#markObjectKeyForDeletion(update, `flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}`, id);
      if (hadLegacy) update[`flags.${MODULE_ID}.${FLAGS.KNOWN_RECIPES}`] = legacy.filter(value => value !== id);
      await actor.update(update, { craftingCoreKnowledgeSync: true, craftingCorePublishedDelete: id });
      changed += 1;
    }
    return changed;
  }

  static async #handlePublishedSourceRemoved({ recipeId, sourceUuid="" }) {
    if (!game.user?.isGM || !recipeId) return 0;
    const index = this.publishedIndex();
    if (index[recipeId] && (!sourceUuid || String(index[recipeId].uuid) === String(sourceUuid))) {
      delete index[recipeId];
      await this.#savePublishedIndex(index);
    }
    const forgotten = await this.forgetRecipeEverywhere(recipeId, { sourceUuid });
    const draft = RecipeService.get(recipeId);
    if (draft?.publication?.uuid && (!sourceUuid || String(draft.publication.uuid) === String(sourceUuid))) {
      draft.publication = null;
      await RecipeService.save(draft);
    }
    Hooks.callAll(`${MODULE_ID}.knowledgeDeleted`, recipeId, sourceUuid, forgotten);
    return forgotten;
  }

  static async reconcilePublishedKnowledge() {
    if (!game.user?.isGM) return { actors: 0, sources: 0, removed: 0, copies: 0 };
    const pack = await this.ensurePack();
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
        const docs = (await pack.getDocuments()).filter(item => item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED));
        const index = {};
        let sourceUpdates = 0;

        for (const item of docs) {
          const recipeId = this.#sourceRecipeId(item);
          const snapshot = this.#sourceSnapshot(item);
          if (!recipeId || !snapshot) continue;
          const draft = RecipeService.get(recipeId);
          const revision = Math.max(
            1,
            Math.floor(Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION)) || 0),
            Math.floor(Number(draft?.publication?.revision) || 0)
          );
          index[recipeId] = { uuid: item.uuid, revision, sourceType: String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || "Recipe"), updatedAt: Date.now() };
          const explicitUuid = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID) || "");
          if (explicitUuid !== item.uuid || Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION) || 0) !== revision) {
            await item.update({
              [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: item.uuid,
              [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_REVISION}`]: revision
            }, { craftingCoreReconcile: true });
            sourceUpdates += 1;
          }
          if (draft) {
            const currentUuid = String(draft.publication?.uuid || "");
            const currentRevision = Math.max(0, Math.floor(Number(draft.publication?.revision) || 0));
            if (currentUuid !== item.uuid || currentRevision !== revision) {
              draft.publication = {
                uuid: item.uuid,
                pack: pack.collection,
                sourceType: index[recipeId].sourceType,
                publishedAt: Number(draft.publication?.publishedAt) || Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now(),
                updatedAt: Date.now(),
                revision
              };
              await RecipeService.save(draft);
            }
          }
        }
        await this.#savePublishedIndex(index);

        let actors = 0;
        let removed = 0;
        for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
          const store = this.learnedStore(actor);
          const legacy = this.legacyKnownRecipeIds(actor);
          const update = {};
          let changed = false;

          for (const [id, prior] of Object.entries(store)) {
            const published = index[id];
            if (!published) {
              this.#markObjectKeyForDeletion(update, `flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}`, id);
              removed += 1;
              changed = true;
              continue;
            }
            const source = docs.find(item => item.uuid === published.uuid);
            const snapshot = this.#sourceSnapshot(source);
            if (!snapshot) {
              this.#markObjectKeyForDeletion(update, `flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}`, id);
              removed += 1;
              changed = true;
              continue;
            }
            const next = { ...prior, recipe: snapshot, publishedSourceUuid: published.uuid, publishedRevision: published.revision, revisedAt: Date.now() };
            if (JSON.stringify(prior.recipe ?? null) !== JSON.stringify(next.recipe)
              || String(prior.publishedSourceUuid || "") !== published.uuid
              || Number(prior.publishedRevision || 0) !== published.revision) {
              update[`flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}.${id}`] = next;
              changed = true;
            }
          }

          for (const id of legacy) {
            if (store[id]?.recipe) continue;
            const published = index[id];
            const source = published ? docs.find(item => item.uuid === published.uuid) : null;
            const snapshot = this.#sourceSnapshot(source);
            if (!published || !snapshot) { removed += 1; changed = true; continue; }
            update[`flags.${MODULE_ID}.${FLAGS.LEARNED_RECIPES}.${id}`] = {
              recipe: snapshot,
              publishedSourceUuid: published.uuid,
              publishedRevision: published.revision,
              learnedAt: 0,
              sourceName: source?.name ?? "Legacy Crafting Core",
              sourceType: String(source?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || "Recipe")
            };
            changed = true;
          }
          if (legacy.length) {
            update[`flags.${MODULE_ID}.${FLAGS.KNOWN_RECIPES}`] = [];
            changed = true;
          }
          if (changed) {
            await actor.update(update, { craftingCoreKnowledgeSync: true, craftingCoreReconcile: true });
            actors += 1;
          }
        }

        const copyReport = await this.#reconcileKnowledgeCopies(index, docs);
        const copies = copyReport.updated;

        for (const draft of RecipeService.list()) {
          if (!draft.publication?.uuid) continue;
          if (index[draft.id]?.uuid === draft.publication.uuid) continue;
          draft.publication = null;
          await RecipeService.save(draft);
        }

        return { actors, sources: sourceUpdates, removed, copies };
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
  static async refreshKnowledgeCopies(sourceItem, revision=0) {
    const report = await this.#refreshKnowledgeCopiesReport(sourceItem, revision);
    return report.updated;
  }

  static async #refreshKnowledgeCopiesReport(sourceItem, revision=0) {
    if (!game.user?.isGM || !sourceItem) return { updated: 0, failed: 0 };
    const recipeId = this.#sourceRecipeId(sourceItem);
    const snapshot = this.#sourceSnapshot(sourceItem);
    if (!recipeId || !snapshot) return { updated: 0, failed: 0 };
    const index = this.publishedIndex();
    const published = index[recipeId];
    if (!published?.uuid) return { updated: 0, failed: 0 };
    const sourceMap = new Map([[recipeId, sourceItem]]);
    return this.#updateKnowledgeCopies(index, sourceMap, { onlyRecipeId: recipeId, revisionOverride: revision });
  }

  static async #reconcileKnowledgeCopies(index, sourceDocs=[]) {
    const sourceMap = new Map();
    for (const source of sourceDocs ?? []) {
      const recipeId = this.#sourceRecipeId(source);
      if (recipeId) sourceMap.set(recipeId, source);
    }
    return this.#updateKnowledgeCopies(index, sourceMap);
  }

  static async #updateKnowledgeCopies(index, sourceMap, { onlyRecipeId="", revisionOverride=0 }={}) {
    let updated = 0;
    let failed = 0;
    const actorSet = new Map();
    for (const actor of game.actors?.contents ?? []) actorSet.set(actor.uuid ?? `Actor.${actor.id}`, actor);
    for (const scene of game.scenes?.contents ?? []) {
      for (const token of scene.tokens?.contents ?? scene.tokens ?? []) {
        const actor = token.actor;
        if (actor) actorSet.set(actor.uuid ?? `${scene.id}.${token.id}`, actor);
      }
    }

    const updatesFor = items => {
      const updates = [];
      for (const item of items ?? []) {
        const recipeId = this.#sourceRecipeId(item);
        if (!recipeId || (onlyRecipeId && recipeId !== onlyRecipeId) || !index[recipeId]) continue;
        const published = index[recipeId];
        const source = sourceMap.get(recipeId);
        const snapshot = this.#sourceSnapshot(source);
        if (!source || !snapshot) continue;
        const revision = Math.max(1, Math.floor(Number(revisionOverride) || Number(published.revision) || 1));
        const currentUuid = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID) || this.#sourceUuid(item) || "");
        const currentRevision = Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_REVISION) || 0);
        const currentSnapshot = item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
        const sameSnapshot = JSON.stringify(currentSnapshot ?? null) === JSON.stringify(snapshot);
        if (currentUuid === published.uuid && currentRevision === revision && sameSnapshot) continue;
        updates.push({
          _id: item.id,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT}`]: snapshot,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_SOURCE_UUID}`]: published.uuid,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED_REVISION}`]: revision,
          [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_SOURCE_TYPE}`]: String(source.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) || "Recipe"),
          "system.description": foundry.utils.deepClone(source.system?.description ?? item.system?.description ?? {})
        });
      }
      return updates;
    };

    for (const actor of actorSet.values()) {
      const updates = updatesFor(actor.items?.contents ?? actor.items ?? []);
      if (updates.length) {
        try {
          await actor.updateEmbeddedDocuments("Item", updates, { craftingCoreKnowledgeCopySync: true });
          updated += updates.length;
        } catch (error) {
          failed += updates.length;
          console.error(`${MODULE_ID} | Published Recipe was saved, but Knowledge Source copy sync failed for ${actor.name}.`, error);
        }
      }
    }
    const worldUpdates = updatesFor(game.items?.contents ?? []);
    if (worldUpdates.length) {
      try {
        await Item.implementation.updateDocuments(worldUpdates, { craftingCoreKnowledgeCopySync: true });
        updated += worldUpdates.length;
      } catch (error) {
        failed += worldUpdates.length;
        console.error(`${MODULE_ID} | Published Recipe was saved, but world Knowledge Source copy synchronization failed.`, error);
      }
    }
    return { updated, failed };
  }

  static async migrateLegacyKnowledge() {
    return this.reconcilePublishedKnowledge();
  }

  static installHooks() {
    Hooks.on("dnd5e.preUseActivity", (activity, _usageConfig, dialogConfig, messageConfig) => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipe = this.recipeSnapshotFromActivity(activity);
      if (!actor || actor.type !== "character") {
        void ResultDialog.show({ title: "Unable to Learn Recipe", message: "Only a Character can learn a Crafting Core Recipe.", tone: "warning", icon: "fa-solid fa-book" });
        return false;
      }
      if (!recipe) {
        void ResultDialog.show({ title: "Unable to Learn Recipe", message: "This Knowledge Source does not contain an available published Recipe.", tone: "warning", icon: "fa-solid fa-book" });
        return false;
      }
      try { this.#assertPublishedIdentity(activity.item, recipe.id); }
      catch (error) {
        void ResultDialog.show({ title: "Unable to Learn Recipe", message: error.message, tone: "warning", icon: "fa-solid fa-book" });
        return false;
      }
      if (this.knows(actor, recipe.id)) {
        void ResultDialog.show({ title: "Recipe Already Known", message: `${actor.name} already knows ${recipe.name}.`, tone: "info", icon: "fa-solid fa-book-open" });
        return false;
      }

      const eligibility = RecipeService.learningEligibility(actor, recipe);
      if (!eligibility.eligible) {
        const visibility = RecipeService.normalizePlayerVisibility(recipe.playerVisibility);
        const reason = visibility.proficiencies ? eligibility.reason : `${actor.name} does not meet the requirements to learn this recipe.`;
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

      if (dialogConfig) {
        dialogConfig.options ??= {};
        dialogConfig.options.button = { ...(dialogConfig.options.button ?? {}), icon: "fa-solid fa-book-open", label: "Learn" };
      }
      if (messageConfig) messageConfig.create = false;
    });

    Hooks.on("dnd5e.postUseActivity", async activity => {
      if (!this.isKnowledgeActivity(activity)) return;
      const actor = activity.actor;
      const recipe = this.recipeSnapshotFromActivity(activity);
      try {
        if (!recipe) throw new Error("This Knowledge Source does not contain an available Recipe.");
        const item = activity.item;
        const identity = this.#assertPublishedIdentity(item, recipe.id);
        const learned = await this.learn(actor, recipe, {
          sourceName: item?.name ?? "",
          sourceType: item?.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) ?? recipe.knowledge?.label ?? "Recipe",
          sourceUuid: identity.sourceUuid,
          publishedRevision: identity.revision
        });
        if (learned) {
          await ResultDialog.show({
            title: "Recipe Learned",
            message: `${actor.name} learned ${recipe.name}.`,
            tone: "success",
            icon: "fa-solid fa-book-open"
          });
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Learn Recipe failed.`, error);
        await ResultDialog.error(error.message ?? "Crafting Core could not teach that Recipe.", "Unable to Learn Recipe");
      }
    });

    Hooks.on("deleteItem", (item, options, userId) => {
      if (options?.craftingCorePublication) return;
      if (!this.#isAuthoritativeSource(item)) return;
      if (!game.user?.isGM || String(userId || "") !== String(game.user.id)) return;
      const recipeId = this.#sourceRecipeId(item);
      if (!recipeId) return;
      void this.#handlePublishedSourceRemoved({ recipeId, sourceUuid: item.uuid }).catch(error => {
        console.error(`${MODULE_ID} | Published Recipe deletion reconciliation failed.`, error);
        ui.notifications.error("Crafting Core could not fully synchronize the deleted published Recipe. It will retry during startup reconciliation.");
      });
    });
  }
}
