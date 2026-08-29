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

  static pack() {
    return CompendiumService.findWorldPack(this.PACK_NAME);
  }

  static async ensurePack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: this.PACK_NAME, label: this.PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, this.SOURCE_FOLDERS);
    return pack;
  }

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.KNOWLEDGE_INDEX, {
      name: "Crafting Core Published Knowledge Index",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }

  static authorityIndex() {
    const value = game.settings.get(MODULE_ID, SETTINGS.KNOWLEDGE_INDEX);
    return value && typeof value === "object" && !Array.isArray(value) ? foundry.utils.deepClone(value) : {};
  }

  static publishedAuthority(recipeId) {
    return this.authorityIndex()[String(recipeId)] ?? null;
  }

  static isPublished(recipeId) {
    return Boolean(this.publishedAuthority(recipeId)?.uuid);
  }

  static recipeFingerprint(recipe) {
    if (!recipe || typeof recipe !== "object") return "";
    const snapshot = RecipeService.snapshot(recipe);
    delete snapshot.publication;
    delete snapshot.createdAt;
    delete snapshot.updatedAt;
    const text = JSON.stringify(snapshot);
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = BigInt.asUintN(64, hash * prime);
    }
    return hash.toString(16).padStart(16, "0");
  }

  static sameRecipeDefinition(left, right) {
    return Boolean(left && right && this.recipeFingerprint(left) === this.recipeFingerprint(right));
  }

  static sourceStatus(activity) {
    const recipeId = this.recipeIdFromActivity(activity);
    const recipe = this.recipeSnapshotFromActivity(activity);
    const authority = recipeId ? this.publishedAuthority(recipeId) : null;
    if (!recipeId || !authority?.uuid) {
      return { valid: false, recipeId, recipe, authority, reason: "unpublished" };
    }
    if (!recipe) return { valid: false, recipeId, recipe: null, authority, reason: "missingSnapshot" };
    const fingerprint = this.recipeFingerprint(recipe);
    if (!authority.fingerprint || fingerprint !== authority.fingerprint) {
      return { valid: false, recipeId, recipe, authority, fingerprint, reason: "outdated" };
    }
    return { valid: true, recipeId, recipe, authority, fingerprint, reason: "" };
  }

  static #activeGMOwnsLifecycle() {
    if (!game.user?.isGM) return false;
    const activeGM = game.users?.activeGM ?? game.users?.contents?.find(user => user.active && user.isGM);
    return !activeGM || activeGM.id === game.user.id;
  }

  static async #writeAuthorityIndex(index) {
    if (!game.user?.isGM) throw new Error("Only a GM can update the published Knowledge index.");
    const normalized = index && typeof index === "object" && !Array.isArray(index) ? index : {};
    await game.settings.set(MODULE_ID, SETTINGS.KNOWLEDGE_INDEX, normalized);
    return normalized;
  }

  static async #upsertAuthority(recipe, item, sourceType) {
    const index = this.authorityIndex();
    index[recipe.id] = {
      uuid: String(item.uuid || ""),
      fingerprint: this.recipeFingerprint(recipe),
      sourceType: String(sourceType || recipe.knowledge?.label || "Recipe"),
      publishedAt: Number(recipe.publication?.publishedAt) || Date.now(),
      updatedAt: Number(recipe.publication?.updatedAt) || Date.now()
    };
    await this.#writeAuthorityIndex(index);
    return index[recipe.id];
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

      recipe.publication = {
        uuid: item.uuid,
        pack: pack.collection,
        sourceType: label,
        publishedAt: Number(recipe.publication?.publishedAt) || Date.now(),
        updatedAt: Date.now()
      };

      const syncIssues = [];
      try {
        recipe = await RecipeService.save(recipe);
      } catch (error) {
        console.error(`${MODULE_ID} | Published Knowledge Builder metadata synchronization failed.`, error);
        syncIssues.push("Builder publication metadata");
      }

      let authority = null;
      try {
        authority = await this.#upsertAuthority(recipe, item, label);
      } catch (error) {
        console.error(`${MODULE_ID} | Published Knowledge authority index update failed.`, error);
        syncIssues.push("published authority index");
      }

      let learnedSync = { changed: 0, failed: [] };
      try {
        learnedSync = await this.refreshLearnedRecipe(recipe);
        if (learnedSync.failed.length) syncIssues.push(`${learnedSync.failed.length} Character knowledge update${learnedSync.failed.length === 1 ? "" : "s"}`);
      } catch (error) {
        console.error(`${MODULE_ID} | Published Knowledge Character synchronization failed.`, error);
        syncIssues.push("Character knowledge synchronization");
      }

      const syncPending = syncIssues.length > 0;
      Hooks.callAll(`${MODULE_ID}.knowledgePublished`, recipe.id, item.uuid, { syncPending, syncIssues });
      return { item, recipe, pack, authority, learnedSync, syncPending, syncIssues };
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
          [FLAGS.KNOWLEDGE_PUBLISHED_AT]: published ? (Number(recipe.publication?.publishedAt) || Date.now()) : 0
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
    if (!game.user?.isGM || !recipe?.id) return { changed: 0, failed: [] };
    const snapshot = RecipeService.snapshot(recipe);
    let changed = 0;
    const failed = [];
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      if (!store[recipe.id]?.recipe) continue;
      try {
        store[recipe.id] = { ...store[recipe.id], recipe: snapshot, revisedAt: Date.now() };
        await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
        actor.sheet?.render?.({ force: true });
        changed += 1;
      } catch (error) {
        console.error(`${MODULE_ID} | Could not refresh learned Recipe ${recipe.id} for ${actor.name}.`, error);
        failed.push({ actorId: actor.id, actorName: actor.name, error: String(error?.message ?? error) });
      }
    }
    return { changed, failed };
  }

  static async forget(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be forgotten by a Character Actor.");
    const id = String(recipeId || "");
    if (!id) return false;

    let changed = false;
    const store = this.learnedStore(actor);
    if (Object.hasOwn(store, id)) {
      delete store[id];
      await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
      changed = true;
    }

    const legacy = this.legacyKnownRecipeIds(actor);
    if (legacy.includes(id)) {
      await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, legacy.filter(entry => entry !== id));
      changed = true;
    }

    if (changed) actor.sheet?.render?.({ force: true });
    return changed;
  }

  static async unlearn(actor, recipeId) {
    if (!actor || actor.type !== "character") throw new Error("Recipes can only be forgotten by a Character Actor.");
    if (!game.user?.isGM && !actor.testUserPermission?.(game.user, "OWNER")) {
      throw new Error("You do not own this Character.");
    }
    const id = String(recipeId || "");
    if (!this.knows(actor, id)) return false;
    const project = actor.getFlag?.(MODULE_ID, FLAGS.CRAFTING_JOB);
    if (project?.mode === "project" && ["active", "finalizing"].includes(String(project.status)) && String(project.recipeId) === id) {
      throw new Error("This Recipe cannot be forgotten while its Crafting Project is active. Finish or cancel the Project first.");
    }
    const changed = await this.forget(actor, id);
    if (changed) Hooks.callAll(`${MODULE_ID}.recipeForgotten`, actor, id);
    return changed;
  }

  static async forgetRecipeEverywhere(recipeId) {
    if (!game.user?.isGM) throw new Error("Only a GM can reconcile unpublished Knowledge.");
    const id = String(recipeId || "");
    let changed = 0;
    const failed = [];
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      if (!this.knownRecipeIds(actor).includes(id)) continue;
      try {
        if (await this.forget(actor, id)) changed += 1;
      } catch (error) {
        console.error(`${MODULE_ID} | Could not forget unpublished Recipe ${id} for ${actor.name}.`, error);
        failed.push({ actorId: actor.id, actorName: actor.name, error: String(error?.message ?? error) });
      }
    }
    return { changed, failed };
  }

  static async reconcilePublishedKnowledge() {
    if (!game.user?.isGM) return { published: 0, authoritativeIds: [], refreshed: 0, forgotten: 0, draftsUpdated: 0, indexChanged: false, failed: [] };

    const pack = this.pack();
    const docs = pack ? await pack.getDocuments() : [];
    const authorities = new Map();
    for (const item of docs) {
      if (!item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) continue;
      const recipeId = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
      const rawSnapshot = item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_SNAPSHOT);
      if (!recipeId || !rawSnapshot || typeof rawSnapshot !== "object") {
        console.warn(`${MODULE_ID} | Ignoring malformed published Knowledge Source ${item.uuid}.`);
        continue;
      }
      if (authorities.has(recipeId)) {
        console.warn(`${MODULE_ID} | Duplicate published Knowledge Source detected for Recipe ${recipeId}; using ${authorities.get(recipeId).item.uuid}.`);
        continue;
      }
      const snapshot = RecipeService.snapshot(rawSnapshot);
      const publishedAt = Number(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED_AT)) || Date.now();
      authorities.set(recipeId, {
        item,
        snapshot,
        entry: {
          uuid: String(item.uuid),
          fingerprint: this.recipeFingerprint(snapshot),
          sourceType: String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_SOURCE_TYPE) ?? snapshot.knowledge?.label ?? "Recipe"),
          publishedAt,
          updatedAt: Number(item._stats?.modifiedTime) || publishedAt
        }
      });
    }

    const failed = [];
    const nextIndex = Object.fromEntries([...authorities.entries()].map(([id, data]) => [id, data.entry]));
    const previousIndex = this.authorityIndex();
    const indexChanged = JSON.stringify(previousIndex) !== JSON.stringify(nextIndex);
    if (indexChanged) {
      try {
        await this.#writeAuthorityIndex(nextIndex);
      } catch (error) {
        console.error(`${MODULE_ID} | Published Knowledge index reconciliation failed.`, error);
        failed.push({ scope: "knowledgeIndex", error: String(error?.message ?? error) });
      }
    }

    let draftsUpdated = 0;
    for (const recipe of RecipeService.list()) {
      const authority = authorities.get(recipe.id);
      try {
        if (!authority) {
          if (recipe.publication?.uuid) {
            recipe.publication = null;
            await RecipeService.save(recipe);
            draftsUpdated += 1;
          }
          continue;
        }
        const desired = {
          uuid: authority.entry.uuid,
          pack: pack?.collection ?? this.PACK_ID,
          sourceType: authority.entry.sourceType,
          publishedAt: Number(recipe.publication?.publishedAt) || authority.entry.publishedAt,
          updatedAt: authority.entry.updatedAt
        };
        const current = recipe.publication ?? {};
        if (String(current.uuid || "") !== desired.uuid
          || String(current.pack || "") !== desired.pack
          || String(current.sourceType || "") !== desired.sourceType) {
          recipe.publication = desired;
          await RecipeService.save(recipe);
          draftsUpdated += 1;
        }
      } catch (error) {
        console.error(`${MODULE_ID} | Builder publication reconciliation failed for Recipe ${recipe.id}.`, error);
        failed.push({ scope: "draft", recipeId: recipe.id, recipeName: recipe.name, error: String(error?.message ?? error) });
      }
    }

    let refreshed = 0;
    let forgotten = 0;
    for (const actor of game.actors?.contents?.filter(a => a.type === "character") ?? []) {
      const store = this.learnedStore(actor);
      let storeChanged = false;
      let actorRefreshed = 0;
      let actorForgotten = 0;
      for (const [recipeId, entry] of Object.entries(store)) {
        const authority = authorities.get(recipeId);
        if (!authority) {
          delete store[recipeId];
          storeChanged = true;
          actorForgotten += 1;
          continue;
        }
        if (!entry?.recipe || !this.sameRecipeDefinition(entry.recipe, authority.snapshot)) {
          store[recipeId] = { ...entry, recipe: authority.snapshot, revisedAt: Date.now() };
          storeChanged = true;
          actorRefreshed += 1;
        }
      }

      const legacy = this.legacyKnownRecipeIds(actor);
      const filteredLegacy = legacy.filter(recipeId => authorities.has(recipeId));
      const legacyChanged = filteredLegacy.length !== legacy.length;
      actorForgotten += legacy.length - filteredLegacy.length;

      if (!storeChanged && !legacyChanged) continue;
      try {
        if (storeChanged) await actor.setFlag(MODULE_ID, FLAGS.LEARNED_RECIPES, store);
        if (legacyChanged) await actor.setFlag(MODULE_ID, FLAGS.KNOWN_RECIPES, filteredLegacy);
        actor.sheet?.render?.({ force: true });
        refreshed += actorRefreshed;
        forgotten += actorForgotten;
      } catch (error) {
        console.error(`${MODULE_ID} | Character knowledge reconciliation failed for ${actor.name}.`, error);
        failed.push({ scope: "actor", actorId: actor.id, actorName: actor.name, error: String(error?.message ?? error) });
      }
    }

    return {
      published: authorities.size,
      authoritativeIds: [...authorities.keys()],
      refreshed,
      forgotten,
      draftsUpdated,
      indexChanged,
      failed
    };
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
      const status = this.sourceStatus(activity);
      const recipe = status.recipe;
      if (!actor || actor.type !== "character") {
        ui.notifications.warn("Only a Character can learn a Crafting Core recipe.");
        return false;
      }
      if (!status.valid) {
        const outdated = status.reason === "outdated";
        void ResultDialog.show({
          title: outdated ? "Knowledge Source Outdated" : "Recipe Unavailable",
          message: outdated
            ? "This copy belongs to an older published revision. It was not consumed. Ask the GM for an updated copy before learning this Recipe."
            : "The authoritative Knowledge Source is no longer published. This copy is orphaned and cannot teach the Recipe.",
          tone: "warning",
          icon: outdated ? "fa-solid fa-arrows-rotate" : "fa-solid fa-book-skull"
        });
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
      const status = this.sourceStatus(activity);
      const recipe = status.recipe;
      try {
        if (!status.valid || !recipe) throw new Error("This Knowledge Source is no longer the current published revision.");
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

    Hooks.on("deleteItem", item => {
      if (!this.#activeGMOwnsLifecycle()) return;
      const pack = this.pack();
      if (!pack || item?.pack !== pack.collection) return;
      if (!item.getFlag?.(MODULE_ID, FLAGS.KNOWLEDGE_PUBLISHED)) return;
      const recipeId = String(item.getFlag(MODULE_ID, FLAGS.KNOWLEDGE_RECIPE_ID) ?? "");
      if (!recipeId) return;
      const sourceName = String(item.name || "Knowledge Source");
      void (async () => {
        try {
          const result = await this.reconcilePublishedKnowledge();
          if (!result.authoritativeIds.includes(recipeId)) {
            Hooks.callAll(`${MODULE_ID}.knowledgeUnpublished`, recipeId, item.uuid);
            const suffix = result.failed.length ? " Some reconciliation work is still pending and will retry at the next GM startup." : "";
            ui.notifications.warn(`${sourceName} was unpublished. Characters who knew that Recipe have forgotten it; active Projects keep their frozen snapshot.${suffix}`);
          } else if (result.failed.length) {
            ui.notifications.warn(`${sourceName} changed publication state, but some Character knowledge reconciliation is still pending.`);
          }
        } catch (error) {
          console.error(`${MODULE_ID} | Published Knowledge deletion reconciliation failed.`, error);
          ui.notifications.error("The Knowledge Source was deleted, but Crafting Core could not finish knowledge reconciliation. It will retry at the next GM startup.");
        }
      })();
    });
  }
}
