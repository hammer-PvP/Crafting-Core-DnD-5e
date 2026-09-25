import { DEFAULT_KNOWLEDGE_ICON, FLAGS, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { normalizeItemSourceForDnd5e6 } from "../utils/dnd5e-data.mjs";

export class RecipeService {
  static #toolLabels = new Map();
  static #toolLabelsReady = false;
  static #toolFallbackLabels = Object.freeze({
    alchemist: "Alchemist's Supplies", bagpipes: "Bagpipes", brewer: "Brewer's Supplies",
    calligrapher: "Calligrapher's Supplies", card: "Playing Cards Set", carpenter: "Carpenter's Tools",
    cartographer: "Cartographer's Tools", chess: "Chess Set", cobbler: "Cobbler's Tools",
    cook: "Cook's Utensils", dice: "Dice Set", disg: "Disguise Kit", drum: "Drum", dulcimer: "Dulcimer",
    flute: "Flute", forg: "Forgery Kit", glassblower: "Glassblower's Tools", herb: "Herbalism Kit", horn: "Horn",
    jeweler: "Jeweler's Tools", leatherworker: "Leatherworker's Tools", lute: "Lute", lyre: "Lyre",
    mason: "Mason's Tools", navg: "Navigator's Tools", painter: "Painter's Supplies", panflute: "Pan Flute",
    pois: "Poisoner's Kit", potter: "Potter's Tools", shawm: "Shawm", smith: "Smith's Tools",
    thief: "Thieves' Tools", tinker: "Tinker's Tools", viol: "Viol", weaver: "Weaver's Tools",
    woodcarver: "Woodcarver's Tools"
  });

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.RECIPES, {
      name: "Crafting Core Recipes",
      scope: "world",
      config: false,
      type: Object,
      default: {}
    });
  }

  static all() {
    if (!game.user?.isGM) return {};
    const stored = game.settings.get(MODULE_ID, SETTINGS.RECIPES);
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return foundry.utils.deepClone(stored);
  }

  static list() {
    return Object.values(this.all()).sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), game.i18n.lang));
  }

  static get(id) {
    return this.all()[id] ?? null;
  }

  static async save(recipe) {
    if (!game.user.isGM) throw new Error("Only a GM can create or edit Crafting Core recipes.");
    const normalized = this.normalize(recipe);
    const recipes = this.all();
    recipes[normalized.id] = normalized;
    await game.settings.set(MODULE_ID, SETTINGS.RECIPES, recipes);
    Hooks.callAll(`${MODULE_ID}.recipesChanged`, normalized.id);
    return normalized;
  }

  static async delete(id) {
    if (!game.user.isGM) throw new Error("Only a GM can delete Crafting Core recipes.");
    const recipes = this.all();
    if (!(id in recipes)) return false;
    delete recipes[id];
    await game.settings.set(MODULE_ID, SETTINGS.RECIPES, recipes);
    Hooks.callAll(`${MODULE_ID}.recipesChanged`, id);
    return true;
  }

  static normalize(recipe={}) {
    const id = String(recipe.id || foundry.utils.randomID(20));
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const craftingResolution = this.normalizeCraftingResolution(recipe.craftingResolution);
    const requestedLearningAccess = String(recipe.learning?.access || "");
    const learningAccess = ["anyone", "followCraftingEligibility"].includes(requestedLearningAccess)
      ? requestedLearningAccess
      : (craftingResolution.attemptPolicy === "requiresProficiency" ? "followCraftingEligibility" : "anyone");
    return {
      id,
      name: String(recipe.name || "New Recipe").trim() || "New Recipe",
      img: String(recipe.img || recipe.result?.img || "icons/svg/item-bag.svg"),
      description: String(recipe.description || ""),
      craftingMode: recipe.craftingMode === "project" ? "project" : "timed",
      craftingTime: Math.max(0, Math.floor(Number(recipe.craftingTime) || 0)),
      project: this.normalizeProject(recipe.project),
      craftingResolution,
      learning: { access: learningAccess },
      playerVisibility: this.normalizePlayerVisibility(recipe.playerVisibility),
      ingredients: ingredients
        .filter(row => row?.uuid)
        .map(row => ({
          uuid: String(row.uuid),
          sourceUuid: String(row.sourceUuid || row.uuid),
          name: String(row.name || "Item"),
          img: String(row.img || "icons/svg/item-bag.svg"),
          type: String(row.type || ""),
          identifier: String(row.identifier || ""),
          matchMode: ["baseItem", "exact", "legacy"].includes(String(row.matchMode)) ? String(row.matchMode) : "legacy",
          baseItemIdentifier: String(row.baseItemIdentifier || ""),
          exactSignature: String(row.exactSignature || ""),
          quantity: Math.max(1, Math.floor(Number(row.quantity) || 1))
        })),
      result: (recipe.result?.uuid || recipe.result?.sourceUuid || recipe.result?.fallbackUuid || recipe.result?.snapshot) ? {
        uuid: String(recipe.result.uuid || recipe.result.sourceUuid || recipe.result.fallbackUuid || ""),
        sourceUuid: String(recipe.result.sourceUuid || recipe.result.uuid || recipe.result.fallbackUuid || ""),
        fallbackUuid: String(recipe.result.fallbackUuid || ""),
        sourceFingerprint: String(recipe.result.sourceFingerprint || ""),
        sourceIdentityFingerprint: String(recipe.result.sourceIdentityFingerprint || ""),
        syncStatus: ["synced", "updated", "sourceMissing", "needsReview"].includes(String(recipe.result.syncStatus))
          ? String(recipe.result.syncStatus)
          : "",
        lastSyncedAt: Math.max(0, Number(recipe.result.lastSyncedAt) || 0),
        name: String(recipe.result.name || "Item"),
        img: String(recipe.result.img || "icons/svg/item-bag.svg"),
        type: String(recipe.result.type || ""),
        identifier: String(recipe.result.identifier || ""),
        quantity: Math.max(1, Math.floor(Number(recipe.result.quantity) || 1)),
        snapshot: recipe.result.snapshot && typeof recipe.result.snapshot === "object"
          ? normalizeItemSourceForDnd5e6(foundry.utils.deepClone(recipe.result.snapshot))
          : null
      } : null,
      knowledge: (() => {
        const label = String(recipe.knowledge?.label || "Recipe").trim() || "Recipe";
        return {
          label,
          name: String(recipe.knowledge?.name || "").trim(),
          img: String((!recipe.knowledge?.img || recipe.knowledge?.img === "icons/svg/book.svg")
            ? (KNOWLEDGE_ICONS[label] || DEFAULT_KNOWLEDGE_ICON)
            : recipe.knowledge.img)
        };
      })(),
      publication: recipe.publication && typeof recipe.publication === "object" ? {
        uuid: String(recipe.publication.uuid || ""),
        pack: String(recipe.publication.pack || ""),
        sourceType: String(recipe.publication.sourceType || recipe.knowledge?.label || "Recipe"),
        publishedAt: Number(recipe.publication.publishedAt) || 0,
        updatedAt: Number(recipe.publication.updatedAt) || 0
      } : null,
      createdAt: Number(recipe.createdAt) || Date.now(),
      updatedAt: Date.now()
    };
  }

  static normalizeCraftingResolution(value={}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const proficiencies = Array.isArray(source.proficiencies) ? source.proficiencies : [];
    const normalizedProficiencies = proficiencies
      .map(entry => ({
        type: ["skill", "tool"].includes(String(entry?.type)) ? String(entry.type) : "",
        id: String(entry?.id || "")
      }))
      .filter(entry => entry.type && entry.id)
      .filter((entry, index, rows) => rows.findIndex(row => row.type === entry.type && row.id === entry.id) === index)
      .slice(0, 2);

    const check = source.check && typeof source.check === "object" ? source.check : {};
    // v0.4.1: Final Crafting Checks use the Recipe's eligible proficiency list.
    // Proficiency 1 is the default roll; a Project may freeze Proficiency 2 instead when chosen at start.
    // Legacy Recipes without relevant proficiencies retain their old check identity until the GM edits them.
    const legacyCheckType = ["ability", "skill", "tool", "save"].includes(String(check.type)) ? String(check.type) : "skill";
    const primaryProficiency = normalizedProficiencies[0] ?? null;
    const checkType = primaryProficiency?.type ?? legacyCheckType;
    const checkId = primaryProficiency?.id ?? String(check.id || (checkType === "save" ? "con" : checkType === "ability" ? "int" : ""));
    const failure = source.failure && typeof source.failure === "object" ? source.failure : {};
    const failureMode = ["noProgress", "regress", "failProject"].includes(String(failure.mode))
      ? String(failure.mode)
      : "failProject";

    return {
      proficiencies: normalizedProficiencies,
      proficiencyMatch: source.proficiencyMatch === "all" ? "all" : "any",
      attemptPolicy: source.attemptPolicy === "requiresProficiency" ? "requiresProficiency" : "anyone",
      proficientPolicy: source.proficientPolicy === "automaticSuccess" ? "automaticSuccess" : "rollNormally",
      check: {
        required: Boolean(check.required),
        type: checkType,
        id: checkId,
        dc: Math.clamp(Math.floor(Number(check.dc) || 10), 1, 40)
      },
      failure: {
        mode: failureMode,
        regressBy: Math.max(1, Math.floor(Number(failure.regressBy) || 1)),
        // Material loss is only meaningful when the entire attempt/project fails.
        // Legacy timed Recipes default to failProject, so their v0.0.18 behavior is preserved.
        loseMaterials: Boolean(check.required && failureMode === "failProject" && failure.loseMaterials),
        lossPercent: Math.clamp(Math.round(Number(failure.lossPercent) || 0), 0, 100)
      }
    };
  }

  static normalizeProject(value={}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const progressCheck = source.progressCheck && typeof source.progressCheck === "object" ? source.progressCheck : {};
    const checkType = ["ability", "skill", "tool", "save"].includes(String(progressCheck.type))
      ? String(progressCheck.type)
      : "tool";
    const failure = progressCheck.failure && typeof progressCheck.failure === "object" ? progressCheck.failure : {};
    const failureMode = ["noProgress", "regress", "failProject"].includes(String(failure.mode))
      ? String(failure.mode)
      : "noProgress";

    const extraSource = source.extraEffort && typeof source.extraEffort === "object" ? source.extraEffort : {};
    const extraType = ["ability", "skill", "tool", "save"].includes(String(extraSource.type))
      ? String(extraSource.type)
      : "ability";
    const extraFailure = extraSource.failure && typeof extraSource.failure === "object" ? extraSource.failure : {};
    const extraFailureMode = extraFailure.mode === "regress" ? "regress" : "noProgress";

    return {
      requiredWork: Math.clamp(Math.floor(Number(source.requiredWork) || 1), 1, 99),
      cadence: source.cadence === "short" ? "short" : "long",
      progressCheck: {
        required: Boolean(progressCheck.required),
        timing: progressCheck.timing === "midpoint" ? "midpoint" : "every",
        type: checkType,
        id: String(progressCheck.id || (checkType === "save" ? "con" : checkType === "ability" ? "int" : checkType === "skill" ? "arc" : "smith")),
        dc: Math.clamp(Math.floor(Number(progressCheck.dc) || 10), 1, 40),
        failure: {
          mode: failureMode,
          regressBy: Math.max(1, Math.floor(Number(failure.regressBy) || 1)),
          loseMaterials: Boolean(failureMode === "failProject" && failure.loseMaterials),
          lossPercent: Math.clamp(Math.round(Number(failure.lossPercent) || 0), 0, 100)
        }
      },
      extraEffort: {
        enabled: Boolean(extraSource.enabled),
        type: extraType,
        id: String(extraSource.id || (extraType === "save" ? "con" : extraType === "ability" ? "con" : extraType === "skill" ? "ath" : "smith")),
        dc: Math.clamp(Math.floor(Number(extraSource.dc) || 12), 1, 40),
        progressGain: Math.clamp(Math.floor(Number(extraSource.progressGain) || 1), 1, 9),
        failure: {
          mode: extraFailureMode,
          regressBy: Math.max(1, Math.floor(Number(extraFailure.regressBy) || 1))
        }
      }
    };
  }

  static normalizePlayerVisibility(value={}) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const visibleByDefault = key => !(key in source) || Boolean(source[key]);
    return {
      output: visibleByDefault("output"),
      ingredients: visibleByDefault("ingredients"),
      ingredientQuantities: visibleByDefault("ingredientQuantities"),
      craftCount: visibleByDefault("craftCount"),
      proficiencies: visibleByDefault("proficiencies"),
      attemptPolicy: visibleByDefault("attemptPolicy"),
      craftingCheck: visibleByDefault("craftingCheck"),
      craftingDC: visibleByDefault("craftingDC"),
      failure: visibleByDefault("failure"),
      failurePercent: visibleByDefault("failurePercent"),
      craftingTime: visibleByDefault("craftingTime"),
      projectProgress: visibleByDefault("projectProgress"),
      progressCheck: visibleByDefault("progressCheck"),
      progressDC: visibleByDefault("progressDC"),
      progressFailure: visibleByDefault("progressFailure"),
      progressFailurePercent: visibleByDefault("progressFailurePercent"),
      extraEffort: visibleByDefault("extraEffort"),
      extraEffortCheck: visibleByDefault("extraEffortCheck"),
      extraEffortDC: visibleByDefault("extraEffortDC"),
      extraEffortFailure: visibleByDefault("extraEffortFailure"),
      description: visibleByDefault("description")
    };
  }

  static async prepareSystemLabels() {
    if (this.#toolLabelsReady) return;
    const entries = Object.entries(CONFIG.DND5E?.tools ?? {});
    const resolved = await Promise.all(entries.map(async ([id, config]) => {
      const uuid = typeof config === "object" ? String(config?.id || "") : "";
      if (!uuid) return [id, ""];
      try {
        const item = await fromUuid(uuid);
        return [id, item instanceof Item ? String(item.name || "") : ""];
      } catch (_) {
        return [id, ""];
      }
    }));
    for (const [id, label] of resolved) if (label) this.#toolLabels.set(id, label);
    this.#toolLabelsReady = true;
  }

  static proficiencyLabel(requirement, actor=null) {
    const type = String(requirement?.type || "skill");
    const id = String(requirement?.id || "");
    if (type === "skill") {
      const data = CONFIG.DND5E?.skills?.[id];
      const raw = ((typeof data === "string" ? data : data?.label) ?? id) || "Proficiency";
      return game.i18n.localize(raw);
    }

    const actorTool = actor?.system?.tools?.[id];
    const actorLabel = actorTool?.label ?? actorTool?.name;
    if (actorLabel) return game.i18n.localize(String(actorLabel));
    const cached = this.#toolLabels.get(id);
    if (cached) return cached;
    const config = CONFIG.DND5E?.tools?.[id];
    const raw = (typeof config === "string" ? config : config?.label ?? config?.name);
    if (raw) return game.i18n.localize(String(raw));
    if (this.#toolFallbackLabels[id]) return this.#toolFallbackLabels[id];
    return id ? id.replace(/[-_]+/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Tool";
  }

  static checkLabel(check, actor=null) {
    const type = String(check?.type || "skill");
    const id = String(check?.id || "");
    if (type === "skill" || type === "tool") return this.proficiencyLabel({ type, id }, actor);
    const data = CONFIG.DND5E?.abilities?.[id];
    const raw = ((typeof data === "string" ? data : data?.label) ?? id) || "Ability";
    const label = game.i18n.localize(raw);
    return type === "save" ? `${label} Saving Throw` : `${label} Check`;
  }

  static hasProficiency(actor, requirement) {
    if (!actor || !requirement?.id) return false;
    const data = requirement.type === "tool"
      ? actor.system?.tools?.[requirement.id]
      : actor.system?.skills?.[requirement.id];
    if (!data) return false;
    if (typeof data.prof?.hasProficiency === "boolean") return data.prof.hasProficiency;
    if (typeof data.hasProficiency === "boolean") return data.hasProficiency;
    return Number(data.value ?? data.proficient ?? 0) > 0;
  }

  static proficiencyRuleSummary(craftingResolution, actor=null) {
    const resolution = this.normalizeCraftingResolution(craftingResolution);
    const labels = resolution.proficiencies.map(entry => this.proficiencyLabel(entry, actor));
    const qualification = !labels.length
      ? "No relevant proficiency is configured."
      : labels.length === 1
        ? `${labels[0]} qualifies.`
        : `${resolution.proficiencyMatch === "all" ? "Both are required" : "Any one qualifies"}: ${labels.join(resolution.proficiencyMatch === "all" ? " + " : " or ")}.`;
    const access = resolution.attemptPolicy === "requiresProficiency"
      ? "Only qualified crafters may attempt."
      : "Anyone may attempt.";
    const proficient = resolution.proficientPolicy === "automaticSuccess"
      ? (resolution.check.required ? "Qualified crafters automatically succeed; non-qualified crafters roll normally." : "Qualified crafters automatically succeed.")
      : (resolution.check.required ? "Qualified and non-qualified crafters roll normally." : "No final Crafting Check is required.");
    return `${qualification} ${access} ${proficient}`;
  }

  static proficiencyEvaluation(actor, craftingResolution) {
    const resolution = this.normalizeCraftingResolution(craftingResolution);
    const rows = resolution.proficiencies.map(entry => ({
      ...entry,
      label: this.proficiencyLabel(entry, actor),
      proficient: this.hasProficiency(actor, entry)
    }));
    const qualifies = rows.length > 0 && (resolution.proficiencyMatch === "all"
      ? rows.every(row => row.proficient)
      : rows.some(row => row.proficient));
    const eligible = resolution.attemptPolicy !== "requiresProficiency" || qualifies;
    return { resolution, rows, qualifies, eligible };
  }

  static learningEligibility(actor, recipe) {
    const normalized = this.normalize(recipe ?? {});
    if (normalized.learning.access !== "followCraftingEligibility") {
      return { eligible: true, rows: [], qualifies: true, reason: "" };
    }
    const evaluation = this.proficiencyEvaluation(actor, normalized.craftingResolution);
    if (evaluation.eligible) return { ...evaluation, reason: "" };
    let reason = "This recipe requires a relevant proficiency, but none is configured.";
    if (evaluation.rows.length === 1) {
      reason = `${actor?.name ?? "This character"} requires proficiency in ${evaluation.rows[0].label} to learn this recipe.`;
    } else if (evaluation.rows.length > 1) {
      const qualifier = evaluation.resolution.proficiencyMatch === "all" ? "all of" : "one of";
      reason = `${actor?.name ?? "This character"} requires ${qualifier}: ${evaluation.rows.map(row => row.label).join(", ")} to learn this recipe.`;
    }
    return { ...evaluation, reason };
  }

  static snapshot(recipe) {
    const normalized = this.normalize(foundry.utils.deepClone(recipe ?? {}));
    // Publication is authoring metadata, not part of the learned crafting definition.
    normalized.publication = null;
    return normalized;
  }

  static canonicalUuid(item) {
    if (!item) return null;
    return String(
      item.getFlag?.(MODULE_ID, "sourceUuid")
      ?? item.getFlag?.("dnd5e", "sourceId")
      ?? item._stats?.compendiumSource
      ?? item.flags?.core?.sourceId
      ?? item._stats?.duplicateSource
      ?? item.uuid
      ?? ""
    ) || null;
  }

  static baseItemIdentifier(itemOrReference) {
    if (!itemOrReference) return "";
    const system = itemOrReference.system ?? {};
    return String(
      itemOrReference.baseItemIdentifier
      ?? system?.type?.baseItem
      ?? system?.baseItem
      ?? itemOrReference.identifier
      ?? system?.identifier
      ?? ""
    ).trim();
  }

  static hasOfficialDndProvenance(item) {
    if (!item) return false;
    const creator = item.flags?.["dnd5e-item-creator"] ?? {};
    const candidates = [
      item.uuid,
      item.getFlag?.("core", "sourceId"),
      item.flags?.core?.sourceId,
      item._stats?.compendiumSource,
      item._stats?.duplicateSource,
      creator.templateUuid,
      creator.baseWeaponUuid
    ].filter(Boolean).map(String);
    return candidates.some(value => /^Compendium\.(?:dnd5e|dnd-[^.]+)\./i.test(value));
  }

  static ingredientMatchMode(item) {
    if (!item) return "exact";
    if (item.getFlag?.(MODULE_ID, FLAGS.MATERIAL_ID) || item.flags?.[MODULE_ID]?.[FLAGS.MATERIAL_ID]) return "exact";

    const creator = Boolean(item.getFlag?.("dnd5e-item-creator", "created") ?? item.flags?.["dnd5e-item-creator"]?.created);
    const importedCustom = Boolean(item.getFlag?.(MODULE_ID, "importedCustomItem") ?? item.flags?.[MODULE_ID]?.importedCustomItem);
    const managedProduct = Boolean(item.getFlag?.(MODULE_ID, FLAGS.PRODUCT) ?? item.flags?.[MODULE_ID]?.[FLAGS.PRODUCT]);
    if (creator || importedCustom || managedProduct) return "exact";

    const base = this.baseItemIdentifier(item);
    const identifier = String(item.system?.identifier ?? "").trim();
    const magicalBonus = String(item.system?.magicalBonus ?? "").trim();
    const properties = item.system?.properties;
    const magical = Boolean(magicalBonus)
      || (properties?.has?.("mgc") ?? (Array.isArray(properties) && properties.includes("mgc")));

    // Base Item matching is deliberately reserved for a demonstrably canonical D&D Base Item
    // (or a normal World copy that still points back to one). A homebrew/custom Item that merely
    // reuses identifier/baseItem="maul" remains exact instead of silently becoming generic.
    if (base && identifier && base === identifier && !magical && this.hasOfficialDndProvenance(item)) return "baseItem";
    return "exact";
  }

  static itemDefinitionSignature(itemOrData) {
    if (!itemOrData) return "";
    const raw = itemOrData.toObject?.() ?? foundry.utils.deepClone(itemOrData);
    const system = foundry.utils.deepClone(raw?.system ?? {});
    delete system.quantity;
    delete system.equipped;
    delete system.attuned;
    delete system.container;
    if (system.uses && typeof system.uses === "object") system.uses.spent = 0;
    if (system.activities && typeof system.activities === "object") {
      for (const activity of Object.values(system.activities)) {
        if (activity?.uses && typeof activity.uses === "object") activity.uses.spent = 0;
      }
    }

    const creatorFlags = foundry.utils.deepClone(raw?.flags?.["dnd5e-item-creator"] ?? {});
    const identity = {
      name: String(raw?.name ?? itemOrData.name ?? ""),
      type: String(raw?.type ?? itemOrData.type ?? ""),
      system,
      creator: creatorFlags
    };

    const canonicalize = value => {
      if (Array.isArray(value)) return value.map(canonicalize);
      if (!value || typeof value !== "object") return value;
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (["_id", "sort"].includes(key)) continue;
        out[key] = canonicalize(value[key]);
      }
      return out;
    };
    const text = JSON.stringify(canonicalize(identity));
    let hash = 14695981039346656037n;
    const prime = 1099511628211n;
    const mask = 0xffffffffffffffffn;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= BigInt(text.charCodeAt(i));
      hash = (hash * prime) & mask;
    }
    return `ccsig-${hash.toString(16).padStart(16, "0")}`;
  }

  static itemReference(item, quantity=1, { snapshot=false, ingredient=false, matchMode=null, baseItemIdentifier="", exactSignature="" }={}) {
    if (!item) return null;
    const reference = {
      // uuid is the exact definition selected by the GM and is used when materializing the crafted result.
      uuid: String(item.uuid),
      // sourceUuid is a provenance identity used to recognize copies in Actor inventories.
      sourceUuid: this.canonicalUuid(item) ?? String(item.uuid),
      name: item.name,
      img: item.img,
      type: item.type,
      identifier: String(item.system?.identifier ?? ""),
      quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
      ...(snapshot ? { snapshot: normalizeItemSourceForDnd5e6(item.toObject()) } : {})
    };
    if (ingredient) {
      const mode = ["baseItem", "exact"].includes(String(matchMode)) ? String(matchMode) : this.ingredientMatchMode(item);
      reference.matchMode = mode;
      reference.baseItemIdentifier = String(baseItemIdentifier || this.baseItemIdentifier(item) || reference.identifier || "");
      reference.exactSignature = mode === "exact"
        ? String(exactSignature || this.itemDefinitionSignature(item))
        : "";
      // Exact ingredients keep the concrete document selected by the GM as their provenance.
      // This prevents a custom derivative from inheriting a broad Base Item source UUID and
      // accidentally matching unrelated Items from the same family. Cross-World portability is
      // provided by exactSignature when the original document UUID no longer exists.
      if (mode === "exact") reference.sourceUuid = String(item.uuid || reference.sourceUuid || "");
    }
    return reference;
  }

  static referencesEquivalent(a, b) {
    if (!a || !b) return false;
    const aMode = String(a.matchMode || "legacy");
    const bMode = String(b.matchMode || "legacy");
    if (aMode === "baseItem" && bMode === "baseItem") {
      const ak = String(a.baseItemIdentifier || a.identifier || "");
      const bk = String(b.baseItemIdentifier || b.identifier || "");
      return Boolean(ak && bk && ak === bk && (!a.type || !b.type || a.type === b.type));
    }
    if (aMode === "exact" && bMode === "exact") {
      if (a.exactSignature && b.exactSignature) return a.exactSignature === b.exactSignature;
      if (a.sourceUuid && b.sourceUuid) return a.sourceUuid === b.sourceUuid;
      return Boolean(a.uuid && b.uuid && a.uuid === b.uuid);
    }
    if (aMode !== bMode && aMode !== "legacy" && bMode !== "legacy") return false;
    return Boolean(a.uuid === b.uuid
      || (a.sourceUuid && b.sourceUuid && a.sourceUuid === b.sourceUuid)
      || (a.identifier && b.identifier && a.identifier === b.identifier && a.type === b.type));
  }

  static sourceCandidates(item) {
    if (!item) return new Set();
    return new Set([
      item.uuid,
      item.getFlag?.(MODULE_ID, "sourceUuid"),
      item.getFlag?.("dnd5e", "sourceId"),
      item._stats?.compendiumSource,
      item.flags?.core?.sourceId,
      item._stats?.duplicateSource
    ].filter(Boolean).map(String));
  }

  static itemMatchesReference(item, reference) {
    if (!item || !reference) return false;
    const mode = String(reference.matchMode || "legacy");
    const candidates = this.sourceCandidates(item);
    const uuid = String(reference.uuid || "");
    const sourceUuid = String(reference.sourceUuid || "");

    if (mode === "exact") {
      if (uuid && candidates.has(uuid)) return true;
      if (sourceUuid && candidates.has(sourceUuid)) return true;
      const signature = String(reference.exactSignature || "");
      if (signature && signature === this.itemDefinitionSignature(item)) return true;
      // Exact references created before a signature existed retain same-name fallback only.
      return Boolean(!signature && reference.name && item.name === reference.name && (!reference.type || item.type === reference.type));
    }

    if (mode === "baseItem") {
      const key = String(reference.baseItemIdentifier || reference.identifier || "").trim();
      if (!key || (reference.type && item.type !== reference.type)) return false;
      const itemIdentifier = String(item.system?.identifier ?? "").trim();
      const itemBase = this.baseItemIdentifier(item);
      return itemIdentifier === key || itemBase === key;
    }

    // Legacy v0.4.0 and older behavior is intentionally retained for existing saved Recipes.
    if (uuid && candidates.has(uuid)) return true;
    if (sourceUuid && candidates.has(sourceUuid)) return true;
    const refIdentifier = String(reference.identifier || "").trim();
    const itemIdentifier = String(item.system?.identifier ?? "").trim();
    if (refIdentifier && itemIdentifier && refIdentifier === itemIdentifier) {
      return !reference.type || item.type === reference.type;
    }
    return Boolean(reference.name && item.name === reference.name && (!reference.type || item.type === reference.type));
  }
}

