import {
  DEFAULT_KNOWLEDGE_ICON,
  FILE_PICKER_ROOT,
  KNOWLEDGE_ICONS,
  KNOWLEDGE_PRICE_BY_RARITY,
  MODULE_ID
} from "../constants.mjs";
import { KnowledgeItemService } from "../services/knowledge-item-service.mjs";
import { RecipeService } from "../services/recipe-service.mjs";
import { ResultDialog } from "../ui/result-dialog.mjs";
import { MaterialCatalogApp } from "./material-catalog-app.mjs";
import { MaterialGeneratorApp } from "./material-generator-app.mjs";
import { CreatureScannerApp } from "./creature-scanner-app.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class CraftingCoreApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-gm",
    classes: ["crafting-core", "crafting-core-gm-app", "standard-form"],
    tag: "form",
    position: { width: 1200, height: 780 },
    window: { title: "Crafting Core", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/crafting-core.hbs` }
  };

  selectedId = null;
  selectedPublishedRecipeId = null;
  activeView = "drafts";
  draft = null;
  pendingContentScroll = null;

  constructor(options={}) {
    super(options);
    this.#newDraft();
  }

  async _prepareContext() {
    await RecipeService.prepareSystemLabels();
    const recipes = RecipeService.list();
    const publishedSources = await KnowledgeItemService.publishedSources();
    const publishedById = new Map(publishedSources.map(source => [source.recipeId, source]));

    if (this.selectedId && !recipes.some(recipe => recipe.id === this.selectedId)) this.#newDraft();
    if (this.activeView === "knowledge") {
      if (!this.selectedPublishedRecipeId || !publishedById.has(this.selectedPublishedRecipeId)) {
        this.selectedPublishedRecipeId = publishedSources[0]?.recipeId ?? null;
      }
    }

    const currentSource = this.draft?.id ? publishedById.get(String(this.draft.id)) ?? null : null;
    const draftMatchesPublished = Boolean(currentSource && KnowledgeItemService.sameRecipeDefinition(this.draft, currentSource.recipe));
    const selectedPublished = this.selectedPublishedRecipeId ? publishedById.get(this.selectedPublishedRecipeId) ?? null : null;
    const selectedPublishedDraft = selectedPublished ? RecipeService.get(selectedPublished.recipeId) : null;
    const selectedPublishedDraftPending = Boolean(selectedPublishedDraft && !KnowledgeItemService.sameRecipeDefinition(selectedPublishedDraft, selectedPublished.recipe));

    const rarity = String(this.draft?.result?.snapshot?.system?.rarity ?? "");
    const rarityLabel = rarity ? (CONFIG.DND5E?.itemRarity?.[rarity] ?? rarity) : "No rarity";
    const localizeLabel = value => game.i18n.localize((typeof value === "string" ? value : value?.label) ?? "");
    const skillOptions = Object.entries(CONFIG.DND5E?.skills ?? {}).map(([id, data]) => ({
      value: `skill:${id}`, label: localizeLabel(data) || id
    })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    const toolOptions = Object.keys(CONFIG.DND5E?.tools ?? {}).map(id => ({
      value: `tool:${id}`, label: RecipeService.proficiencyLabel({ type: "tool", id })
    })).sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang));
    const abilityOptions = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([id, data]) => ({
      value: `ability:${id}`, label: localizeLabel(data) || id
    }));
    const saveOptions = Object.entries(CONFIG.DND5E?.abilities ?? {}).map(([id, data]) => ({
      value: `save:${id}`, label: `${localizeLabel(data) || id} Saving Throw`
    }));
    const proficiencyValues = (this.draft?.craftingResolution?.proficiencies ?? []).map(row => `${row.type}:${row.id}`);
    const checkValue = `${this.draft?.craftingResolution?.check?.type ?? "skill"}:${this.draft?.craftingResolution?.check?.id ?? ""}`;
    const progressCheckValue = `${this.draft?.project?.progressCheck?.type ?? "tool"}:${this.draft?.project?.progressCheck?.id ?? ""}`;
    const extraEffortCheckValue = `${this.draft?.project?.extraEffort?.type ?? "ability"}:${this.draft?.project?.extraEffort?.id ?? ""}`;
    return {
      activeView: this.activeView,
      recipeCount: recipes.length,
      publishedCount: publishedSources.length,
      recipes: recipes.map(recipe => {
        const source = publishedById.get(recipe.id) ?? null;
        const pending = Boolean(source && !KnowledgeItemService.sameRecipeDefinition(recipe, source.recipe));
        return {
          ...recipe,
          selected: recipe.id === this.selectedId,
          published: Boolean(source),
          pending,
          sourceType: source?.sourceType ?? recipe.knowledge?.label ?? "Recipe",
          publicationStatus: source ? (pending ? "Published · Changes pending" : "Published · Up to date") : "Draft only"
        };
      }),
      publishedSources: publishedSources.map(source => {
        const draft = RecipeService.get(source.recipeId);
        const pending = Boolean(draft && !KnowledgeItemService.sameRecipeDefinition(draft, source.recipe));
        return {
          recipeId: source.recipeId,
          uuid: source.uuid,
          itemId: source.item.id,
          name: source.recipe.name,
          sourceName: source.item.name,
          img: source.item.img || source.recipe.img,
          sourceType: source.sourceType,
          selected: source.recipeId === this.selectedPublishedRecipeId,
          hasDraft: Boolean(draft),
          pending,
          draftStatus: !draft ? "No Builder draft" : (pending ? "Unpublished changes" : "Draft synchronized")
        };
      }),
      selectedPublished: selectedPublished ? {
        recipeId: selectedPublished.recipeId,
        uuid: selectedPublished.uuid,
        itemId: selectedPublished.item.id,
        sourceName: selectedPublished.item.name,
        sourceType: selectedPublished.sourceType,
        img: selectedPublished.item.img || selectedPublished.recipe.img,
        publishedAtLabel: selectedPublished.publishedAt ? new Date(selectedPublished.publishedAt).toLocaleString() : "",
        updatedAtLabel: selectedPublished.updatedAt ? new Date(selectedPublished.updatedAt).toLocaleString() : "",
        recipe: foundry.utils.deepClone(selectedPublished.recipe),
        hasDraft: Boolean(selectedPublishedDraft),
        draftPending: selectedPublishedDraftPending,
        draftActionLabel: selectedPublishedDraft ? "Continue Editing" : "Edit as Draft",
        draftStatus: !selectedPublishedDraft ? "No Builder draft" : (selectedPublishedDraftPending ? "Unpublished changes" : "Draft synchronized")
      } : null,
      draft: foundry.utils.deepClone(this.draft),
      editingExisting: Boolean(this.selectedId),
      published: Boolean(currentSource),
      draftMatchesPublished,
      draftHasUnpublishedChanges: Boolean(currentSource && !draftMatchesPublished),
      defaultKnowledgeIcon: DEFAULT_KNOWLEDGE_ICON,
      knowledgeIcons: KNOWLEDGE_ICONS,
      outputRarity: rarityLabel,
      knowledgePrice: Number(KNOWLEDGE_PRICE_BY_RARITY[rarity] ?? 0),
      craftingResolutionOptions: {
        skillOptions, toolOptions, abilityOptions, saveOptions,
        proficiency1: proficiencyValues[0] ?? "",
        proficiency2: proficiencyValues[1] ?? "",
        checkValue,
        progressCheckValue,
        extraEffortCheckValue
      }
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[data-action="show-drafts"]')?.addEventListener("click", event => {
      event.preventDefault();
      if (this.activeView === "drafts") return;
      this.activeView = "drafts";
      this.render({ force: true });
    });
    root.querySelector('[data-action="show-knowledge-base"]')?.addEventListener("click", event => {
      event.preventDefault();
      if (this.activeView === "knowledge") return;
      this.#syncDraftFromForm();
      this.activeView = "knowledge";
      this.render({ force: true });
    });
    root.querySelector('[data-action="new-recipe"]')?.addEventListener("click", event => {
      event.preventDefault(); this.activeView = "drafts"; this.#newDraft(); this.render({ force: true });
    });
    root.querySelector('[data-action="open-material-catalog"]')?.addEventListener("click", event => {
      event.preventDefault();
      new MaterialCatalogApp().render({ force: true });
    });
    root.querySelector('[data-action="open-material-generator"]')?.addEventListener("click", event => {
      event.preventDefault();
      const launcher = game.modules?.get?.(MODULE_ID)?.api?.openGenerator;
      if (typeof launcher === "function") launcher();
      else new MaterialGeneratorApp().render({ force: true });
    });
    root.querySelector('[data-action="open-creature-scanner"]')?.addEventListener("click", event => {
      event.preventDefault();
      new CreatureScannerApp().render({ force: true });
    });
    root.querySelector('[data-action="open-learn-sources"]')?.addEventListener("click", async event => {
      event.preventDefault();
      const pack = KnowledgeItemService.pack() ?? await KnowledgeItemService.ensurePack();
      pack.render?.(true);
    });
    root.querySelectorAll('[data-recipe-id]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault(); this.#loadRecipe(button.dataset.recipeId); this.render({ force: true });
    }));
    root.querySelectorAll('[data-published-recipe-id]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.selectedPublishedRecipeId = String(button.dataset.publishedRecipeId || "");
      this.render({ force: true });
    }));
    root.querySelector('[data-action="edit-published-source"]')?.addEventListener("click", event => this.#editPublished(event));
    root.querySelector('[data-action="open-published-item"]')?.addEventListener("click", event => this.#openPublishedItem(event));
    root.querySelector('[data-action="unpublish-source"]')?.addEventListener("click", event => this.#unpublish(event));
    root.querySelector('[data-action="save-recipe"]')?.addEventListener("click", event => this.#save(event));
    root.querySelector('[data-action="delete-recipe"]')?.addEventListener("click", event => this.#delete(event));
    root.querySelector('[data-action="publish-recipe"]')?.addEventListener("click", event => this.#publish(event));
    root.querySelectorAll('[data-action="remove-ingredient"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#syncDraftFromForm();
      this.draft.ingredients.splice(Number(button.dataset.index), 1);
      this.#rerenderPreservingScroll();
    }));
    root.querySelector('[data-action="clear-result"]')?.addEventListener("click", event => {
      event.preventDefault(); this.#syncDraftFromForm(); this.draft.result = null; this.#rerenderPreservingScroll();
    });
    root.querySelectorAll('[data-drop-kind]').forEach(zone => {
      zone.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", event => this.#onDrop(event, zone.dataset.dropKind));
    });
    root.querySelectorAll('[data-action="browse-image"]').forEach(button => button.addEventListener("click", event => this.#browseImage(event, button.dataset.target)));
    root.querySelector('[name="knowledgeLabel"]')?.addEventListener("change", event => {
      this.#syncDraftFromForm();
      const oldDefaults = new Set(["icons/svg/book.svg", DEFAULT_KNOWLEDGE_ICON, ...Object.values(KNOWLEDGE_ICONS)]);
      const current = String(this.draft.knowledge?.img || "");
      if (!current || oldDefaults.has(current)) this.draft.knowledge.img = KNOWLEDGE_ICONS[event.currentTarget.value] ?? DEFAULT_KNOWLEDGE_ICON;
      this.#rerenderPreservingScroll();
    });
    root.querySelectorAll('[data-resolution-rerender]').forEach(input => input.addEventListener("change", () => {
      this.#syncDraftFromForm();
      this.#rerenderPreservingScroll();
    }));
    const lossSlider = root.querySelector('[name="failureLossPercent"]');
    const lossOutput = root.querySelector('[data-failure-loss-output]');
    if (lossSlider && lossOutput) lossSlider.addEventListener("input", () => { lossOutput.textContent = `${lossSlider.value}%`; });
    const progressLossSlider = root.querySelector('[name="progressFailLossPercent"]');
    const progressLossOutput = root.querySelector('[data-progress-failure-loss-output]');
    if (progressLossSlider && progressLossOutput) progressLossSlider.addEventListener("input", () => { progressLossOutput.textContent = `${progressLossSlider.value}%`; });

    if (this.pendingContentScroll !== null) {
      const scrollTop = this.pendingContentScroll;
      this.pendingContentScroll = null;
      requestAnimationFrame(() => {
        const content = this.element?.querySelector?.(".cc-content");
        if (content) content.scrollTop = scrollTop;
      });
    }
  }

  #rerenderPreservingScroll() {
    this.pendingContentScroll = this.element?.querySelector?.(".cc-content")?.scrollTop ?? 0;
    this.render({ force: true });
  }

  #newDraft() {
    this.selectedId = null;
    this.draft = RecipeService.normalize({
      id: foundry.utils.randomID(20),
      name: "New Recipe",
      description: "",
      craftingMode: "timed",
      craftingTime: 10,
      project: {
        requiredWork: 2,
        cadence: "long",
        progressCheck: {
          required: false, timing: "every", type: "tool", id: "smith", dc: 12,
          failure: { mode: "noProgress", regressBy: 1, loseMaterials: false, lossPercent: 50 }
        },
        extraEffort: {
          enabled: false, type: "ability", id: "con", dc: 12, progressGain: 1,
          failure: { mode: "noProgress", regressBy: 1 }
        }
      },
      craftingResolution: {
        proficiencies: [],
        proficiencyMatch: "any",
        attemptPolicy: "anyone",
        proficientPolicy: "rollNormally",
        check: { required: false, type: "skill", id: "arc", dc: 15 },
        failure: { mode: "failProject", regressBy: 1, loseMaterials: false, lossPercent: 50 }
      },
      learning: { access: "followCraftingEligibility" },
      playerVisibility: {
        output: true, ingredients: true, ingredientQuantities: true, craftCount: true, proficiencies: true, attemptPolicy: true,
        craftingCheck: true, craftingDC: true, failure: true, failurePercent: true, craftingTime: true,
        projectProgress: true, progressCheck: true, progressDC: true, progressFailure: true, progressFailurePercent: true,
        extraEffort: true, extraEffortCheck: true, extraEffortDC: true, extraEffortFailure: true, description: true
      },
      ingredients: [],
      result: null,
      knowledge: { label: "Recipe", name: "", img: KNOWLEDGE_ICONS.Recipe }
    });
  }

  #loadRecipe(id) {
    const recipe = RecipeService.get(id);
    if (!recipe) return;
    this.selectedId = recipe.id;
    this.draft = RecipeService.normalize(foundry.utils.deepClone(recipe));
  }

  async #editPublished(event) {
    event.preventDefault();
    const recipeId = String(this.selectedPublishedRecipeId || "");
    if (!recipeId) return;
    try {
      const draft = await KnowledgeItemService.draftFromPublished(recipeId);
      this.activeView = "drafts";
      this.selectedId = draft.id;
      this.draft = RecipeService.normalize(foundry.utils.deepClone(draft));
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Could not open published Knowledge Source as a draft.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not open that published source for editing.");
    }
  }

  async #openPublishedItem(event) {
    event.preventDefault();
    const recipeId = String(this.selectedPublishedRecipeId || "");
    if (!recipeId) return;
    try {
      const source = await KnowledgeItemService.publishedSource(recipeId);
      if (!source?.item) throw new Error("That Knowledge Source is no longer published.");
      source.item.sheet?.render?.({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Could not open published Knowledge Item.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not open that Knowledge Source.");
    }
  }

  async #unpublish(event) {
    event.preventDefault();
    const recipeId = String(this.selectedPublishedRecipeId || "");
    if (!recipeId) return;
    const source = await KnowledgeItemService.publishedSource(recipeId);
    if (!source) {
      ui.notifications.warn("That Knowledge Source is no longer published.");
      this.render({ force: true });
      return;
    }
    const recipeName = foundry.utils.escapeHTML(String(source.recipe?.name || source.item?.name || "this Recipe"));
    const confirmation = await foundry.applications.api.DialogV2.input({
      window: { title: "Unpublish Knowledge Source" },
      content: `<section class="cc-unpublish-dialog"><p>Unpublish <strong>${recipeName}</strong>?</p><p>This is a global action. It removes the authoritative source from <strong>Crafting Core — Learn Sources</strong> and Characters who learned it will forget it. Active Projects keep their frozen Recipe snapshot.</p><p>To confirm, type <strong>I AGREE</strong>.</p><input type="text" name="confirmation" autocomplete="off" autofocus placeholder="I AGREE"></section>`,
      ok: { label: "Unpublish", icon: "fa-solid fa-book-skull" },
      rejectClose: false,
      modal: true
    });
    if (!confirmation) return;
    const confirmed = String(confirmation.confirmation ?? "").trim().replace(/\s+/g, " ").toLowerCase() === "i agree";
    if (!confirmed) {
      await ResultDialog.show({
        title: "Confirmation Required",
        message: "The Knowledge Source was not unpublished. Type I AGREE exactly (capitalization and extra spaces do not matter).",
        tone: "warning",
        icon: "fa-solid fa-shield-halved"
      });
      return;
    }

    try {
      const result = await KnowledgeItemService.unpublishRecipe(recipeId);
      this.selectedPublishedRecipeId = null;
      if (result.reconciliation?.failed?.length) {
        await ResultDialog.show({
          title: "Unpublished — Reconciliation Pending",
          message: `${source.item.name} was removed from Learn Sources, but some derived knowledge cleanup is still pending. Crafting Core will retry at the next GM startup.`,
          facts: result.reconciliation.failed.map(row => row.actorName || row.recipeName || row.scope || row.error).filter(Boolean),
          tone: "warning",
          icon: "fa-solid fa-triangle-exclamation"
        });
      } else {
        ui.notifications.warn(`${source.item.name} was unpublished from Learn Sources.`);
      }
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Unpublish Knowledge Source failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not unpublish that Knowledge Source.");
    }
  }

  #syncDraftFromForm() {
    const root = this.element;
    if (!root || !this.draft) return;
    this.draft.name = root.querySelector('[name="name"]')?.value ?? this.draft.name;
    this.draft.img = root.querySelector('[name="img"]')?.value ?? this.draft.img;
    this.draft.description = root.querySelector('[name="description"]')?.value ?? this.draft.description ?? "";
    this.draft.craftingMode = root.querySelector('[name="craftingMode"]')?.value === "project" ? "project" : "timed";
    const craftingTimeInput = root.querySelector('[name="craftingTime"]');
    if (craftingTimeInput) this.draft.craftingTime = Math.max(0, Math.floor(Number(craftingTimeInput.value) || 0));
    const project = foundry.utils.deepClone(this.draft.project ?? {});
    const requiredWorkInput = root.querySelector('[name="requiredWork"]');
    const cadenceInput = root.querySelector('[name="projectCadence"]');
    if (requiredWorkInput) project.requiredWork = Math.clamp(Math.floor(Number(requiredWorkInput.value) || 1), 1, 99);
    if (cadenceInput) project.cadence = cadenceInput.value === "short" ? "short" : "long";
    project.progressCheck ??= {};
    const requireProgressInput = root.querySelector('[name="requireProgressCheck"]');
    if (requireProgressInput) project.progressCheck.required = Boolean(requireProgressInput.checked);
    const progressTimingInput = root.querySelector('[name="progressCheckTiming"]');
    if (progressTimingInput) project.progressCheck.timing = progressTimingInput.value === "midpoint" ? "midpoint" : "every";
    const progressCheckInput = root.querySelector('[name="progressCheck"]');
    if (progressCheckInput) {
      const [progressCheckType, progressCheckId] = String(progressCheckInput.value || "tool:smith").split(":", 2);
      project.progressCheck.type = progressCheckType;
      project.progressCheck.id = progressCheckId;
    }
    const progressDCInput = root.querySelector('[name="progressDC"]');
    if (progressDCInput) project.progressCheck.dc = Math.clamp(Math.floor(Number(progressDCInput.value) || 10), 1, 40);
    project.progressCheck.failure ??= {};
    const progressFailureMode = root.querySelector('[name="progressFailureMode"]:checked');
    if (progressFailureMode) project.progressCheck.failure.mode = progressFailureMode.value;
    const progressRegressInput = root.querySelector('[name="progressRegressBy"]');
    if (progressRegressInput) project.progressCheck.failure.regressBy = Math.max(1, Math.floor(Number(progressRegressInput.value) || 1));
    const progressLoseInput = root.querySelector('[name="progressFailLoseMaterials"]');
    if (progressLoseInput) project.progressCheck.failure.loseMaterials = Boolean(progressLoseInput.checked);
    else if (project.progressCheck.failure.mode !== "failProject") project.progressCheck.failure.loseMaterials = false;
    const progressLossInput = root.querySelector('[name="progressFailLossPercent"]');
    if (progressLossInput) project.progressCheck.failure.lossPercent = Math.clamp(Math.round(Number(progressLossInput.value) || 0), 0, 100);
    project.extraEffort ??= {};
    const enableExtraEffort = root.querySelector('[name="enableExtraEffort"]');
    if (enableExtraEffort) project.extraEffort.enabled = Boolean(enableExtraEffort.checked);
    const extraEffortCheckInput = root.querySelector('[name="extraEffortCheck"]');
    if (extraEffortCheckInput) {
      const [extraType, extraId] = String(extraEffortCheckInput.value || "ability:con").split(":", 2);
      project.extraEffort.type = extraType;
      project.extraEffort.id = extraId;
    }
    const extraEffortDCInput = root.querySelector('[name="extraEffortDC"]');
    if (extraEffortDCInput) project.extraEffort.dc = Math.clamp(Math.floor(Number(extraEffortDCInput.value) || 12), 1, 40);
    const extraEffortGainInput = root.querySelector('[name="extraEffortProgressGain"]');
    if (extraEffortGainInput) project.extraEffort.progressGain = Math.clamp(Math.floor(Number(extraEffortGainInput.value) || 1), 1, 9);
    project.extraEffort.failure ??= {};
    const extraLoseProgressInput = root.querySelector('[name="extraEffortLoseProgress"]');
    if (extraLoseProgressInput) project.extraEffort.failure.mode = extraLoseProgressInput.checked ? "regress" : "noProgress";
    const extraRegressInput = root.querySelector('[name="extraEffortRegressBy"]');
    if (extraRegressInput) project.extraEffort.failure.regressBy = Math.max(1, Math.floor(Number(extraRegressInput.value) || 1));
    this.draft.project = RecipeService.normalizeProject(project);
    const resolution = foundry.utils.deepClone(this.draft.craftingResolution ?? {});
    const parseProficiency = value => {
      const [type, id] = String(value || "").split(":", 2);
      return (["skill", "tool"].includes(type) && id) ? { type, id } : null;
    };
    resolution.proficiencies = [
      parseProficiency(root.querySelector('[name="proficiency1"]')?.value),
      parseProficiency(root.querySelector('[name="proficiency2"]')?.value)
    ].filter(Boolean);
    resolution.proficiencyMatch = root.querySelector('[name="proficiencyMatch"]')?.value ?? resolution.proficiencyMatch ?? "any";
    resolution.attemptPolicy = root.querySelector('[name="attemptPolicy"]')?.value ?? resolution.attemptPolicy ?? "anyone";
    resolution.proficientPolicy = root.querySelector('[name="proficientPolicy"]')?.value ?? resolution.proficientPolicy ?? "rollNormally";
    resolution.check ??= {};
    resolution.check.required = Boolean(root.querySelector('[name="requireCraftingCheck"]')?.checked);
    const [checkType, checkId] = String(root.querySelector('[name="craftingCheck"]')?.value || "skill:arc").split(":", 2);
    resolution.check.type = checkType;
    resolution.check.id = checkId;
    resolution.check.dc = Math.clamp(Math.floor(Number(root.querySelector('[name="craftingDC"]')?.value) || 10), 1, 40);
    resolution.failure ??= {};
    resolution.failure.mode = root.querySelector('[name="finalFailureMode"]:checked')?.value ?? resolution.failure.mode ?? "failProject";
    resolution.failure.regressBy = Math.max(1, Math.floor(Number(root.querySelector('[name="finalRegressBy"]')?.value) || 1));
    resolution.failure.loseMaterials = Boolean(root.querySelector('[name="loseMaterialsOnFailure"]')?.checked);
    resolution.failure.lossPercent = Math.clamp(Math.round(Number(root.querySelector('[name="failureLossPercent"]')?.value) || 0), 0, 100);
    this.draft.craftingResolution = RecipeService.normalizeCraftingResolution(resolution);
    this.draft.learning = {
      access: root.querySelector('[name="learningAccess"]')?.value ?? this.draft.learning?.access ?? "followCraftingEligibility"
    };
    const currentVisibility = RecipeService.normalizePlayerVisibility(this.draft.playerVisibility);
    const visibility = {};
    for (const key of [
      "output", "ingredients", "ingredientQuantities", "craftCount", "proficiencies", "attemptPolicy", "craftingCheck",
      "craftingDC", "failure", "failurePercent", "craftingTime", "projectProgress", "progressCheck",
      "progressDC", "progressFailure", "progressFailurePercent", "extraEffort", "extraEffortCheck",
      "extraEffortDC", "extraEffortFailure", "description"
    ]) {
      const input = root.querySelector(`[name="visibility.${key}"]`);
      visibility[key] = input ? Boolean(input.checked) : currentVisibility[key];
    }
    this.draft.playerVisibility = RecipeService.normalizePlayerVisibility(visibility);
    this.draft.knowledge ??= {};
    this.draft.knowledge.label = root.querySelector('[name="knowledgeLabel"]')?.value ?? "Recipe";
    this.draft.knowledge.name = root.querySelector('[name="knowledgeName"]')?.value ?? "";
    this.draft.knowledge.img = root.querySelector('[name="knowledgeImg"]')?.value ?? KNOWLEDGE_ICONS[this.draft.knowledge.label] ?? DEFAULT_KNOWLEDGE_ICON;
    root.querySelectorAll('[data-ingredient-quantity]').forEach(input => {
      const index = Number(input.dataset.ingredientQuantity);
      if (this.draft.ingredients[index]) this.draft.ingredients[index].quantity = Math.max(1, Math.floor(Number(input.value) || 1));
    });
    const resultQty = root.querySelector('[name="resultQuantity"]');
    if (this.draft.result && resultQty) this.draft.result.quantity = Math.max(1, Math.floor(Number(resultQty.value) || 1));
  }

  async #onDrop(event, kind) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");
    this.#syncDraftFromForm();
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.type !== "Item") {
        ui.notifications.warn("Drop a D&D5e Item here.");
        return;
      }
      const item = await Item.implementation.fromDropData(data);
      if (!(item instanceof Item)) {
        ui.notifications.warn("Crafting Core could not resolve that Item.");
        return;
      }
      const ref = RecipeService.itemReference(item, 1, { snapshot: kind === "result" });
      if (kind === "result") this.draft.result = ref;
      else {
        const existing = this.draft.ingredients.find(row => row.uuid === ref.uuid
          || (row.sourceUuid && ref.sourceUuid && row.sourceUuid === ref.sourceUuid)
          || (row.identifier && ref.identifier && row.identifier === ref.identifier && row.type === ref.type));
        if (existing) existing.quantity += 1;
        else this.draft.ingredients.push(ref);
      }
      if (!this.draft.img || this.draft.img === "icons/svg/item-bag.svg") this.draft.img = this.draft.result?.img ?? this.draft.img;
      this.#rerenderPreservingScroll();
    } catch (error) {
      console.error(`${MODULE_ID} | Item drop failed.`, error);
      ui.notifications.error("Crafting Core could not read the dropped Item.");
    }
  }

  async #browseImage(event, targetName) {
    event.preventDefault();
    this.#syncDraftFromForm();
    const FilePicker = foundry.applications?.apps?.FilePicker?.implementation
      ?? foundry.applications?.apps?.FilePicker
      ?? globalThis.FilePicker;
    if (!FilePicker) return ui.notifications.error("Foundry File Picker is unavailable.");
    const picker = new FilePicker({
      type: "image",
      current: FILE_PICKER_ROOT,
      callback: path => {
        if (targetName === "img") this.draft.img = path;
        if (targetName === "knowledgeImg") this.draft.knowledge.img = path;
        this.#rerenderPreservingScroll();
      }
    });
    await picker.render({ force: true });
  }

  #validateDraft() {
    if (!this.draft.name?.trim()) throw new Error("Give the recipe a name.");
    if (!this.draft.result?.uuid) throw new Error("Drop a result Item into the recipe first.");
    if (!this.draft.ingredients.length) throw new Error("Add at least one required Item.");
    const resolution = RecipeService.normalizeCraftingResolution(this.draft.craftingResolution);
    if (resolution.attemptPolicy === "requiresProficiency" && !resolution.proficiencies.length) {
      throw new Error("Choose at least one relevant proficiency when the recipe requires proficiency to attempt.");
    }
    if (resolution.check.required && !resolution.check.id) {
      throw new Error("Choose a valid Crafting Check.");
    }
    if (this.draft.craftingMode === "project") {
      const project = RecipeService.normalizeProject(this.draft.project);
      if (project.progressCheck.required && !project.progressCheck.id) throw new Error("Choose a valid Progress Check.");
      if (project.extraEffort.enabled && !project.extraEffort.id) throw new Error("Choose a valid Extra Effort Check.");
    }
  }

  async #save(event) {
    event.preventDefault();
    this.#syncDraftFromForm();
    try {
      this.#validateDraft();
      const saved = await RecipeService.save(this.draft);
      this.selectedId = saved.id;
      this.draft = foundry.utils.deepClone(saved);
      ui.notifications.info(`Saved draft: ${saved.name}.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Save recipe failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save this draft.");
    }
  }

  async #publish(event) {
    event.preventDefault();
    this.#syncDraftFromForm();
    try {
      this.#validateDraft();
      const saved = await RecipeService.save(this.draft);
      this.selectedId = saved.id;
      this.draft = foundry.utils.deepClone(saved);
      const { item, recipe, syncPending, syncIssues=[] } = await KnowledgeItemService.publishRecipe(saved.id);
      this.draft = foundry.utils.deepClone(recipe);
      if (syncPending) {
        await ResultDialog.show({
          title: "Published — Sync Pending",
          message: `${item.name} was successfully saved to Learn Sources, but part of the Knowledge synchronization is still pending. Crafting Core will retry reconciliation on the next GM startup.`,
          facts: syncIssues,
          tone: "warning",
          icon: "fa-solid fa-triangle-exclamation"
        });
      } else {
        ui.notifications.info(`Published ${item.name} to the private Crafting Core — Learn Sources Compendium.`);
      }
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Publish recipe failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not publish this Knowledge Source.");
    }
  }

  async #delete(event) {
    event.preventDefault();
    if (!this.selectedId) return;
    const recipe = RecipeService.get(this.selectedId);
    const publishedSource = recipe ? await KnowledgeItemService.publishedSource(recipe.id) : null;
    const published = Boolean(publishedSource);
    const content = published
      ? `<p>Delete the Recipe Builder draft <strong>${foundry.utils.escapeHTML(recipe?.name ?? "this recipe")}</strong>?</p><p>The published Knowledge Source and any Characters who already learned it remain fully functional.</p>`
      : `<p><strong>${foundry.utils.escapeHTML(recipe?.name ?? "This draft")}</strong> has not been published to the Crafting Core library.</p><p>Deleting it now permanently destroys this draft.</p>`;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: published ? "Delete Published Draft" : "Delete Unpublished Draft" },
      content,
      yes: { label: "Delete Draft", icon: "fa-solid fa-trash" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    await RecipeService.delete(this.selectedId);
    this.#newDraft();
    this.render({ force: true });
  }
}
