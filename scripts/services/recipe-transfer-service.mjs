import { FALLBACK_ITEM_ICON, FLAGS, MODULE_ID, MODULE_VERSION } from "../constants.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { CuratedContentService } from "./curated-content-service.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { RecipeService } from "./recipe-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";
import { normalizeActiveEffectSource, normalizeItemSourceForDnd5e6 } from "../utils/dnd5e-data.mjs";
import { forcedDeletion } from "../utils/foundry-data.mjs";

/**
 * Portable Recipe bundle support.
 *
 * The file format is deliberately independent from the filename. Import validity is
 * determined only by the internal format/schema metadata and payload structure.
 */
export class RecipeTransferService {
  static FORMAT = "crafting-core-recipes";
  static SCHEMA_VERSION = 2;
  static SUPPORTED_SCHEMA_VERSIONS = new Set([1, 2]);
  static CUSTOM_ITEMS_FOLDER = "Custom Items";

  static listRecipes() {
    return RecipeService.list().map(recipe => ({
      ...foundry.utils.deepClone(recipe),
      transferable: Boolean(recipe?.result?.uuid || recipe?.result?.snapshot)
    }));
  }

  static async buildBundle(recipeIds=[]) {
    if (!game.user?.isGM) throw new Error("Only a GM can export Crafting Core Recipes.");
    const ids = new Set((recipeIds ?? []).map(String));
    const recipes = RecipeService.list().filter(recipe => ids.has(String(recipe.id)));
    if (!recipes.length) throw new Error("Select at least one Recipe to export.");

    const entries = [];
    for (const recipe of recipes) entries.push(await this.#exportRecipe(recipe));

    return {
      format: this.FORMAT,
      schemaVersion: this.SCHEMA_VERSION,
      moduleId: MODULE_ID,
      moduleVersion: MODULE_VERSION,
      systemId: game.system?.id ?? "dnd5e",
      systemVersion: game.system?.version ?? "",
      exportedAt: new Date().toISOString(),
      entries
    };
  }

  static async #exportRecipe(recipe) {
    const normalized = RecipeService.normalize(foundry.utils.deepClone(recipe));
    // Publication is World-specific authority metadata and never travels between Worlds.
    normalized.publication = null;

    const frozenResult = await ProductSourceService.freezeResult(normalized.result);
    const resultSnapshot = foundry.utils.deepClone(frozenResult.data ?? {});
    if (!Object.keys(resultSnapshot).length) throw new Error(`${normalized.name}: the Result Item could not be resolved for export.`);

    const result = {
      name: String(normalized.result?.name || resultSnapshot.name || "Item"),
      type: String(normalized.result?.type || resultSnapshot.type || ""),
      identifier: String(normalized.result?.identifier || resultSnapshot.system?.identifier || ""),
      quantity: Math.max(1, Math.floor(Number(normalized.result?.quantity) || 1)),
      sourceUuid: String(normalized.result?.sourceUuid || ""),
      originalImg: String(normalized.result?.img || resultSnapshot.img || FALLBACK_ITEM_ICON),
      baseItemIdentifier: this.#baseItemIdentifier(resultSnapshot),
      snapshot: this.#portableItemSnapshot(resultSnapshot)
    };

    const ingredients = [];
    for (const ingredient of normalized.ingredients ?? []) {
      const doc = await this.#resolveReferenceDocument(ingredient);
      const materialId = String(doc?.getFlag?.(MODULE_ID, FLAGS.MATERIAL_ID) ?? "");
      const explicitMode = ["baseItem", "exact"].includes(String(ingredient.matchMode)) ? String(ingredient.matchMode) : "";
      const matchMode = materialId ? "exact" : (explicitMode || (doc ? RecipeService.ingredientMatchMode(doc) : "legacy"));
      ingredients.push({
        name: String(ingredient.name || doc?.name || "Item"),
        img: String(ingredient.img || doc?.img || ""),
        type: String(ingredient.type || doc?.type || ""),
        identifier: String(ingredient.identifier || doc?.system?.identifier || ""),
        sourceUuid: String(ingredient.sourceUuid || RecipeService.canonicalUuid(doc) || ingredient.uuid || ""),
        quantity: Math.max(1, Math.floor(Number(ingredient.quantity) || 1)),
        materialId,
        kind: materialId ? "material" : "external-item",
        matchMode,
        baseItemIdentifier: String(ingredient.baseItemIdentifier || RecipeService.baseItemIdentifier(doc) || ingredient.identifier || ""),
        exactSignature: matchMode === "exact"
          ? String(ingredient.exactSignature || (doc ? RecipeService.itemDefinitionSignature(doc) : ""))
          : ""
      });
    }

    return {
      recipe: normalized,
      result,
      ingredients
    };
  }

  static #portableItemSnapshot(source={}) {
    const snapshot = normalizeItemSourceForDnd5e6(foundry.utils.deepClone(source ?? {}));
    delete snapshot._id;
    delete snapshot.folder;
    delete snapshot.sort;
    delete snapshot.ownership;
    delete snapshot._stats;
    // Do not carry a World/Compendium source UUID as authoritative identity into another World.
    if (snapshot.flags?.core) {
      delete snapshot.flags.core.sourceId;
      if (!Object.keys(snapshot.flags.core).length) delete snapshot.flags.core;
    }
    snapshot.img = String(snapshot.img || FALLBACK_ITEM_ICON);
    return snapshot;
  }

  static #baseItemIdentifier(snapshot={}) {
    return String(
      snapshot.system?.type?.baseItem
      ?? snapshot.system?.baseItem
      ?? snapshot.system?.identifier
      ?? ""
    ).trim();
  }

  static async #resolveReferenceDocument(reference) {
    if (!reference) return null;
    for (const uuid of [reference.sourceUuid, reference.fallbackUuid, reference.uuid].filter(Boolean)) {
      try {
        const doc = await fromUuid(String(uuid));
        if (doc instanceof Item) return doc;
      } catch (_) { /* try next identity */ }
    }
    return null;
  }

  static validateBundle(value) {
    const errors = [];
    if (!value || typeof value !== "object" || Array.isArray(value)) errors.push("The selected file does not contain a JSON object.");
    if (value?.format !== this.FORMAT) errors.push("This is not a Crafting Core Recipe export.");
    if (!this.SUPPORTED_SCHEMA_VERSIONS.has(Number(value?.schemaVersion))) errors.push(`Unsupported Recipe transfer schema: ${value?.schemaVersion ?? "missing"}.`);
    if (!Array.isArray(value?.entries)) errors.push("Recipe entries are missing.");
    if (value?.systemId && value.systemId !== "dnd5e") errors.push(`The export targets ${value.systemId}, not dnd5e.`);
    return { valid: !errors.length, errors };
  }

  static async analyzeBundle(bundle) {
    const validation = this.validateBundle(bundle);
    if (!validation.valid) throw new Error(validation.errors.join(" "));

    const materialById = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const result = [];
    for (const raw of bundle.entries) {
      const recipe = RecipeService.normalize(foundry.utils.deepClone(raw?.recipe ?? {}));
      const dependencies = [];
      const resolvedIngredients = [];

      for (const ingredient of raw?.ingredients ?? []) {
        const resolution = await this.#resolveImportedIngredient(ingredient, materialById);
        const resolved = resolution?.doc ?? null;
        dependencies.push({
          name: String(ingredient?.name || "Item"),
          quantity: Math.max(1, Number(ingredient?.quantity) || 1),
          kind: String(ingredient?.kind || "external-item"),
          matchMode: String(resolution?.matchMode || ingredient?.matchMode || "legacy"),
          status: resolved ? "ready" : "missing",
          resolvedName: resolved?.name ?? ""
        });
        if (resolved) {
          const ref = RecipeService.itemReference(resolved, ingredient.quantity, {
            ingredient: true,
            matchMode: resolution.matchMode,
            baseItemIdentifier: resolution.baseItemIdentifier,
            exactSignature: resolution.exactSignature
          });
          // Generic Base Item dependencies retain the canonical exported label instead of
          // borrowing the name/icon of an arbitrary local derivative.
          if (resolution.matchMode === "baseItem" && ingredient?.name) ref.name = String(ingredient.name);
          resolvedIngredients.push(ref);
        }
      }

      const missingDependencies = dependencies.filter(row => row.status === "missing");
      const existingRecipe = RecipeService.get(recipe.id);
      const existingResult = await this.#findExistingResult(raw?.result);
      const resolvedIcon = await this.resolveImportedIcon(raw?.result);

      result.push({
        key: String(recipe.id || foundry.utils.randomID(16)),
        name: recipe.name,
        img: resolvedIcon.path,
        recipe,
        result: foundry.utils.deepClone(raw?.result ?? {}),
        dependencies,
        resolvedIngredients,
        missingDependencies,
        ready: !missingDependencies.length && Boolean(raw?.result?.snapshot),
        existingRecipe: Boolean(existingRecipe),
        existingRecipeName: existingRecipe?.name ?? "",
        existingResult: Boolean(existingResult),
        existingResultName: existingResult?.name ?? "",
        iconResolution: resolvedIcon,
        conflictRecipe: existingRecipe ? "update" : "preserve",
        conflictResult: existingResult ? "use-existing" : "import-new"
      });
    }
    return result;
  }

  static async #resolveImportedIngredient(ingredient, materialById) {
    const materialId = String(ingredient?.materialId || "");
    if (materialId && materialById.has(materialId)) {
      const doc = materialById.get(materialId);
      return {
        doc,
        matchMode: "exact",
        baseItemIdentifier: String(ingredient?.baseItemIdentifier || RecipeService.baseItemIdentifier(doc) || ingredient?.identifier || ""),
        exactSignature: String(ingredient?.exactSignature || RecipeService.itemDefinitionSignature(doc))
      };
    }

    const requestedMode = ["baseItem", "exact"].includes(String(ingredient?.matchMode)) ? String(ingredient.matchMode) : "legacy";
    if (requestedMode === "baseItem") {
      const doc = await this.#findCanonicalBaseIngredient(ingredient);
      return doc ? {
        doc,
        matchMode: "baseItem",
        baseItemIdentifier: String(ingredient?.baseItemIdentifier || RecipeService.baseItemIdentifier(doc) || ingredient?.identifier || ""),
        exactSignature: ""
      } : null;
    }
    if (requestedMode === "exact") {
      const doc = await this.#findExactIngredient(ingredient);
      return doc ? {
        doc,
        matchMode: "exact",
        baseItemIdentifier: String(ingredient?.baseItemIdentifier || RecipeService.baseItemIdentifier(doc) || ingredient?.identifier || ""),
        exactSignature: String(ingredient?.exactSignature || RecipeService.itemDefinitionSignature(doc))
      } : null;
    }

    // v0.4.0 transfer compatibility. Old bundles did not declare generic vs exact identity,
    // so provenance is our strongest migration signal:
    // - an official D&D source (or no source at all) may resolve as a canonical Base Item;
    // - a World/custom source is resolved exactly first and is never silently collapsed to its base.
    const legacySourceUuid = String(ingredient?.sourceUuid || "").trim();
    const officialLegacySource = this.#looksLikeOfficialDndSource(legacySourceUuid);
    let canonical = null;
    if (!legacySourceUuid || officialLegacySource) {
      canonical = await this.#findCanonicalBaseIngredient(ingredient, { requireNameMatch: true });
      // If the legacy export points at an official D&D Compendium Base Item, prefer that
      // provenance even when the destination World localizes/renames the Item label.
      if (!canonical && officialLegacySource) {
        try {
          const source = await fromUuid(legacySourceUuid);
          if (source instanceof Item && RecipeService.ingredientMatchMode(source) === "baseItem") canonical = source;
        } catch (_) { /* the official source pack may not be installed in this World */ }
        if (!canonical) canonical = await this.#findCanonicalBaseIngredient(ingredient, { requireNameMatch: false });
      }
    }
    if (canonical) {
      return {
        doc: canonical,
        matchMode: RecipeService.ingredientMatchMode(canonical),
        baseItemIdentifier: RecipeService.baseItemIdentifier(canonical),
        exactSignature: ""
      };
    }

    const exact = await this.#findExactIngredient(ingredient);
    if (!exact) return null;
    const mode = RecipeService.ingredientMatchMode(exact);
    return {
      doc: exact,
      matchMode: mode,
      baseItemIdentifier: RecipeService.baseItemIdentifier(exact),
      exactSignature: mode === "exact" ? RecipeService.itemDefinitionSignature(exact) : ""
    };
  }

  static #looksLikeOfficialDndSource(uuid) {
    const value = String(uuid || "");
    return /^Compendium\.(?:dnd5e|dnd-[^.]+)\./i.test(value);
  }

  static #preferredItemPacks() {
    const packs = game.packs.filter(pack => pack.documentName === "Item");
    return packs.sort((a, b) => {
      const score = pack => {
        const packageType = String(pack.metadata?.packageType || "");
        const packageName = String(pack.metadata?.packageName || pack.metadata?.package || pack.collection || "");
        if (packageType === "system") return 0;
        if (/^dnd(?:5e|-)/i.test(packageName)) return 1;
        if (packageName === MODULE_ID) return 3;
        return 2;
      };
      return score(a) - score(b);
    });
  }

  static async #findCanonicalBaseIngredient(ingredient, { requireNameMatch=false }={}) {
    const identifier = String(ingredient?.baseItemIdentifier || ingredient?.identifier || "").trim();
    const type = String(ingredient?.type || "");
    const name = String(ingredient?.name || "").trim();
    if (!identifier && !name) return null;

    for (const pack of this.#preferredItemPacks()) {
      try {
        const index = await pack.getIndex({ fields: ["name", "type", "system.identifier", "system.type.baseItem", "system.rarities", "system.magicalBonus", "system.properties", "flags.dnd5e-item-creator.created"] });
        const rows = index.filter(entry => {
          if (type && entry.type !== type) return false;
          const entryIdentifier = String(entry.system?.identifier || "").trim();
          const entryBase = String(entry.system?.type?.baseItem || entryIdentifier || "").trim();
          const nameMatch = Boolean(name && entry.name === name);
          const keyMatch = Boolean(identifier && (entryIdentifier === identifier || entryBase === identifier));
          return requireNameMatch ? nameMatch && (!identifier || keyMatch) : (keyMatch || nameMatch);
        });
        for (const row of rows) {
          const doc = await pack.getDocument(row._id);
          if (doc && RecipeService.ingredientMatchMode(doc) === "baseItem") return doc;
        }
      } catch (_) { /* skip inaccessible packs */ }
    }

    // A clean World copy of a canonical mundane Base Item is an acceptable fallback. Custom
    // Item Creator derivatives are rejected here by ingredientMatchMode().
    return game.items?.contents?.find(item => {
      if (type && item.type !== type) return false;
      if (RecipeService.ingredientMatchMode(item) !== "baseItem") return false;
      const key = RecipeService.baseItemIdentifier(item);
      if (requireNameMatch && name && item.name !== name) return false;
      return identifier ? (key === identifier || String(item.system?.identifier || "") === identifier) : item.name === name;
    }) ?? null;
  }

  static async #findExactIngredient(ingredient) {
    const type = String(ingredient?.type || "");
    const name = String(ingredient?.name || "").trim();
    const sourceUuid = String(ingredient?.sourceUuid || "").trim();
    const signature = String(ingredient?.exactSignature || "").trim();

    const accepts = item => {
      if (!item || (type && item.type !== type)) return false;
      if (signature) return RecipeService.itemDefinitionSignature(item) === signature;
      if (sourceUuid && RecipeService.sourceCandidates(item).has(sourceUuid)) return true;
      return Boolean(name && item.name === name);
    };

    const worldMatch = game.items?.contents?.find(accepts);
    if (worldMatch) return worldMatch;

    for (const pack of this.#preferredItemPacks()) {
      try {
        const index = await pack.getIndex({ fields: ["name", "type"] });
        const rows = index.filter(entry => (!type || entry.type === type) && (!name || entry.name === name));
        for (const row of rows) {
          const doc = await pack.getDocument(row._id);
          if (accepts(doc)) return doc;
        }
      } catch (_) { /* skip inaccessible packs */ }
    }
    return null;
  }

  static async #findExistingResult(result={}) {
    const pack = CuratedContentService.productsPack();
    if (!pack) return null;
    const docs = await pack.getDocuments();
    const identifier = String(result?.identifier || result?.snapshot?.system?.identifier || "").trim();
    const type = String(result?.type || result?.snapshot?.type || "");
    const name = String(result?.name || result?.snapshot?.name || "").trim();
    return docs.find(doc => {
      // Official Curated Products are never treated as overwrite targets for imported
      // custom content. Recipe Transfer only reconciles against GM/custom Products.
      if (doc.getFlag?.(MODULE_ID, FLAGS.PRODUCT_MANAGED)) return false;
      if (identifier && String(doc.system?.identifier || "") === identifier && (!type || doc.type === type)) return true;
      return Boolean(name && doc.name === name && (!type || doc.type === type));
    }) ?? null;
  }

  static async resolveImportedIcon(result={}) {
    const original = String(result?.originalImg || result?.snapshot?.img || "").trim();
    if (original && await this.#assetExists(original)) return { path: original, source: "Original icon" };

    const bundled = this.#bundledFallback(result);
    if (bundled && await this.#assetExists(bundled)) return { path: bundled, source: "Crafting Core fallback" };

    const baseImg = await this.#baseItemImage(result);
    if (baseImg) return { path: baseImg, source: "Base Item icon" };

    return { path: this.#genericTypeIcon(result?.type || result?.snapshot?.type), source: "Generic Item icon" };
  }

  static async #assetExists(path) {
    if (!path || /^data:/.test(path)) return Boolean(path);
    try {
      let response = await fetch(path, { method: "HEAD", cache: "no-store" });
      if (response.ok) return true;
      if ([403, 405].includes(response.status)) {
        response = await fetch(path, { method: "GET", cache: "no-store" });
        return response.ok;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  static #bundledFallback(result={}) {
    const flags = result?.snapshot?.flags?.[MODULE_ID] ?? {};
    const subcategory = String(flags.productSubcategory || flags[FLAGS.PRODUCT_SUBCATEGORY] || "");
    if (subcategory === "alcoholic-drink" || subcategory === "non-alcoholic-drink") {
      return `modules/${MODULE_ID}/icons/products/drinks/drink-bottle-round-gold.webp`;
    }
    if (subcategory === "meal") return `modules/${MODULE_ID}/icons/products/meals/grilled-meal-plate-red-green.webp`;
    return "";
  }

  static async #baseItemImage(result={}) {
    const key = String(result?.baseItemIdentifier || result?.snapshot?.system?.type?.baseItem || "").trim();
    if (!key) return "";
    for (const pack of game.packs.filter(pack => pack.documentName === "Item" && pack.metadata?.packageType === "system")) {
      try {
        const index = await pack.getIndex({ fields: ["img", "type", "system.identifier"] });
        const row = index.find(entry => String(entry.system?.identifier || "") === key || String(entry._id || "") === key);
        if (row?.img) return String(row.img);
      } catch (_) { /* skip */ }
    }
    return "";
  }

  static #genericTypeIcon(type) {
    switch (String(type || "")) {
      case "weapon": return "icons/svg/sword.svg";
      case "equipment": return "icons/svg/armor.svg";
      case "consumable": return "icons/svg/potion.svg";
      case "tool": return "icons/svg/hammer.svg";
      case "loot": return "icons/svg/coins.svg";
      default: return FALLBACK_ITEM_ICON;
    }
  }

  static async importEntries(bundle, selections=[]) {
    if (!game.user?.isGM) throw new Error("Only a GM can import Crafting Core Recipes.");
    const analysis = await this.analyzeBundle(bundle);
    const choices = new Map((selections ?? []).map(row => [String(row.key), row]));
    const selected = analysis.filter(row => choices.has(row.key));
    if (!selected.length) throw new Error("Select at least one Recipe to import.");

    const productsPack = await CuratedContentService.ensureProductsPack();
    const folders = await CompendiumService.ensurePackFolders(productsPack, [
      { key: "custom-items", name: this.CUSTOM_ITEMS_FOLDER }
    ]);
    const customFolder = folders.get("custom-items") ?? null;
    const wasLocked = Boolean(productsPack.locked);
    if (wasLocked) await productsPack.configure({ locked: false });

    const imported = [];
    const skipped = [];
    try {
      for (const entry of selected) {
        const choice = choices.get(entry.key) ?? {};
        if (!entry.ready) {
          skipped.push({ name: entry.name, reason: `Missing dependencies: ${entry.missingDependencies.map(row => row.name).join(", ")}` });
          continue;
        }

        const recipeAction = String(choice.recipeAction || (entry.existingRecipe ? "update" : "preserve"));
        const resultAction = String(choice.resultAction || (entry.existingResult ? "use-existing" : "import-new"));
        if (recipeAction === "skip" || resultAction === "skip") {
          skipped.push({ name: entry.name, reason: "Skipped by GM" });
          continue;
        }

        let resultDoc = null;
        const existingResult = await this.#findExistingResult(entry.result);
        if (resultAction === "use-existing" && existingResult) resultDoc = existingResult;
        else if (resultAction === "update" && existingResult) {
          const data = this.#importItemData(entry.result, entry.iconResolution.path, customFolder?.id ?? null);
          await this.#updateImportedItem(existingResult, data);
          resultDoc = existingResult;
        } else {
          const data = this.#importItemData(entry.result, entry.iconResolution.path, customFolder?.id ?? null);
          if (resultAction === "import-new" && existingResult) {
            data.name = `${data.name} (Imported)`;
            if (data.system?.identifier) data.system.identifier = `${data.system.identifier}-imported-${foundry.utils.randomID(6).toLowerCase()}`;
          }
          resultDoc = await this.#createImportedItem(productsPack, data);
        }
        if (!resultDoc) {
          skipped.push({ name: entry.name, reason: "Result Item could not be created" });
          continue;
        }

        const draft = foundry.utils.deepClone(entry.recipe);
        draft.ingredients = entry.resolvedIngredients;
        draft.result = await ProductSourceService.referenceForItem(resultDoc, entry.result.quantity || draft.result?.quantity || 1);
        draft.img = entry.iconResolution.path || resultDoc.img || draft.img;
        draft.publication = null;

        if (recipeAction === "new") {
          draft.id = foundry.utils.randomID(20);
          draft.createdAt = Date.now();
        }
        const saved = await RecipeService.save(draft);
        imported.push({ name: saved.name, recipeId: saved.id, resultName: resultDoc.name });
      }
    } finally {
      if (wasLocked) await productsPack.configure({ locked: true });
    }

    return { imported, skipped, productsPack };
  }

  static async #createImportedItem(pack, data) {
    const ItemClass = CONFIG.Item?.documentClass ?? Item.implementation ?? Item;
    const core = foundry.utils.deepClone(data);
    const effects = foundry.utils.deepClone(core.effects ?? []);
    delete core.effects;
    const [created] = await ItemClass.createDocuments([core], { pack: pack.collection });
    if (!created) return null;
    if (effects.length) await created.createEmbeddedDocuments("ActiveEffect", effects.map(effect => {
      const source = normalizeActiveEffectSource(foundry.utils.deepClone(effect));
      delete source._id;
      return source;
    }), { render: false });
    return created;
  }

  static async #updateImportedItem(item, data) {
    const core = foundry.utils.deepClone(data);
    const effects = foundry.utils.deepClone(core.effects ?? []);
    delete core.effects;
    delete core.type;
    delete core._id;
    if (core.system?.activities && typeof core.system.activities === "object") {
      const desired = foundry.utils.deepClone(core.system.activities);
      const currentIds = Object.keys(item.system?.activities ?? {});
      const desiredIds = new Set(Object.keys(desired));
      for (const oldId of currentIds) if (!desiredIds.has(oldId)) desired[oldId] = forcedDeletion();
      core.system.activities = desired;
    }
    await item.update(core, { render: false });
    const effectIds = [...(item.effects ?? [])].map(effect => effect.id).filter(Boolean);
    if (effectIds.length) await item.deleteEmbeddedDocuments("ActiveEffect", effectIds, { render: false });
    if (effects.length) await item.createEmbeddedDocuments("ActiveEffect", effects.map(effect => {
      const source = normalizeActiveEffectSource(foundry.utils.deepClone(effect));
      delete source._id;
      return source;
    }), { render: false });
  }

  static #importItemData(result={}, icon, folderId=null) {
    const data = this.#portableItemSnapshot(result.snapshot ?? {});
    data.name = String(result.name || data.name || "Imported Item");
    data.type = String(result.type || data.type || "loot");
    data.img = String(icon || data.img || FALLBACK_ITEM_ICON);
    data.folder = folderId;
    data.flags ??= {};
    data.flags[MODULE_ID] ??= {};
    data.flags[MODULE_ID].importedCustomItem = true;
    data.flags[MODULE_ID].importedAt = Date.now();
    return data;
  }

  static suggestedFilename(count=1) {
    const date = new Date().toISOString().slice(0, 10);
    return count === 1 ? `crafting-core-recipe-${date}.json` : `crafting-core-recipes-${date}.json`;
  }

  static async requestSaveTarget(suggestedName=this.suggestedFilename(1)) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: "Crafting Core Recipe JSON", accept: { "application/json": [".json"] } }]
        });
        return { method: "picker", handle };
      } catch (error) {
        if (error?.name === "AbortError") return null;
        console.warn(`${MODULE_ID} | Native Save File picker failed; offering browser download fallback.`, error);
      }
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Save Recipe Export" },
      content: `<p>Your browser cannot open the native Save As dialog from this page. Continue with a normal file download?</p><p><small>The browser controls the destination and may use Downloads or your last download folder.</small></p>`,
      yes: { label: "Download JSON", icon: "fa-solid fa-download" },
      no: { label: "Cancel" }
    });
    return confirmed ? { method: "download" } : null;
  }

  static async saveBundle(bundle, suggestedName=this.suggestedFilename(bundle?.entries?.length ?? 1), target=null) {
    const destination = target ?? await this.requestSaveTarget(suggestedName);
    if (!destination) return { saved: false, cancelled: true };
    const json = JSON.stringify(bundle, null, 2);

    if (destination.method === "picker" && destination.handle) {
      const writable = await destination.handle.createWritable();
      await writable.write(json);
      await writable.close();
      return { saved: true, method: "picker" };
    }

    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return { saved: true, method: "download" };
  }

  static async readBundleFile(file) {
    if (!(file instanceof File)) throw new Error("Choose a Recipe JSON file first.");
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (_) {
      throw new Error("The selected file is not valid JSON.");
    }
    const validation = this.validateBundle(parsed);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    return parsed;
  }
}
