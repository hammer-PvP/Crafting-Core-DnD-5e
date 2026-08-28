import { DEFAULT_KNOWLEDGE_ICON, KNOWLEDGE_ICONS, MODULE_ID, SETTINGS } from "../constants.mjs";

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
          quantity: Math.max(1, Math.floor(Number(row.quantity) || 1))
        })),
      result: recipe.result?.uuid ? {
        uuid: String(recipe.result.uuid),
        sourceUuid: String(recipe.result.sourceUuid || recipe.result.uuid),
        name: String(recipe.result.name || "Item"),
        img: String(recipe.result.img || "icons/svg/item-bag.svg"),
        type: String(recipe.result.type || ""),
        identifier: String(recipe.result.identifier || ""),
        quantity: Math.max(1, Math.floor(Number(recipe.result.quantity) || 1)),
        snapshot: recipe.result.snapshot && typeof recipe.result.snapshot === "object"
          ? foundry.utils.deepClone(recipe.result.snapshot)
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
    const checkType = ["ability", "skill", "tool", "save"].includes(String(check.type)) ? String(check.type) : "skill";
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
        id: String(check.id || (checkType === "save" ? "con" : checkType === "ability" ? "int" : "")),
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

  static itemReference(item, quantity=1, { snapshot=false }={}) {
    if (!item) return null;
    return {
      // uuid is the exact definition selected by the GM and is used when materializing the crafted result.
      uuid: String(item.uuid),
      // sourceUuid is a provenance identity used to recognize copies in Actor inventories.
      sourceUuid: this.canonicalUuid(item) ?? String(item.uuid),
      name: item.name,
      img: item.img,
      type: item.type,
      identifier: String(item.system?.identifier ?? ""),
      quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
      ...(snapshot ? { snapshot: item.toObject() } : {})
    };
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
    const candidates = this.sourceCandidates(item);
    const uuid = String(reference.uuid || "");
    const sourceUuid = String(reference.sourceUuid || "");
    if (uuid && candidates.has(uuid)) return true;
    if (sourceUuid && candidates.has(sourceUuid)) return true;

    const refIdentifier = String(reference.identifier || "").trim();
    const itemIdentifier = String(item.system?.identifier ?? "").trim();
    if (refIdentifier && itemIdentifier && refIdentifier === itemIdentifier) {
      return !reference.type || item.type === reference.type;
    }

    // Last-resort support for custom world Items without stable provenance metadata.
    return Boolean(reference.name && item.name === reference.name && (!reference.type || item.type === reference.type));
  }
}
