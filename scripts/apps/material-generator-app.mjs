import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";
import { MaterialGenerationService } from "../services/material-generation-service.mjs";
import { ItemPilesBridge } from "../services/item-piles-bridge.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MaterialGeneratorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-material-generator",
    classes: ["crafting-core", "crafting-core-generator-app", "standard-form"],
    tag: "form",
    position: { width: 760, height: 650 },
    window: { title: "Crafting Core — Generate Materials", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-generator.hbs` }
  };

  state = {
    source: "creature",
    creatureNatures: ["undead"],
    creatureProfiles: ["undead:general"],
    sources: 1,
    essenceAffinities: [],
    environmentBiomes: ["forest"],
    resources: ["flora"],
    environmentAbundances: ["normal"],
    gatherAttempts: 1,
    huntBiomes: ["forest"],
    huntAbundances: ["normal"],
    huntAttempts: 1
  };

  lastResult = null;

  async _prepareContext() {
    const { entries, creatureNatures, biomes, huntBiomes } = await MaterialGenerationService.options();
    this.#normalizeState({ entries, creatureNatures, biomes, huntBiomes });

    const allProfileOptions = creatureNatures.flatMap(nature => MaterialGenerationService.profilesFor(nature).map(profile => ({
      key: `${nature}:${profile.id}`,
      nature,
      id: profile.id,
      label: `${MaterialGenerationService.title(nature)} — ${profile.label}`,
      selected: this.state.creatureProfiles.includes(`${nature}:${profile.id}`),
      enabled: this.state.creatureNatures.includes(nature)
    })));

    const resourceCategories = MaterialGenerationService.resourceCategories(entries, []);
    const resourceOptions = resourceCategories.map(value => {
      const supportedBiomes = [...new Set(entries
        .filter(entry => entry.family === "gathering" && !(entry.tags ?? []).includes("game-hunt") && entry.category === value)
        .flatMap(entry => entry.biomes ?? []).map(String))];
      const enabled = supportedBiomes.some(biome => this.state.environmentBiomes.includes(biome));
      return {
        value,
        label: MaterialCatalogService.categoryLabel("gathering", value),
        selected: enabled && this.state.resources.includes(value),
        enabled,
        biomesCsv: supportedBiomes.join(",")
      };
    });

    const abundanceOptions = Object.entries(MaterialGenerationService.ABUNDANCE).map(([value, row]) => ({ value, label: row.label }));
    const huntAbundanceOptions = Object.entries(MaterialGenerationService.GAME_HUNT_ABUNDANCE).map(([value, row]) => ({ value, label: row.label }));

    return {
      state: foundry.utils.deepClone(this.state),
      isCreature: this.state.source === "creature",
      isEnvironment: this.state.source === "environment",
      isHunt: this.state.source === "hunt",
      creatureOptions: creatureNatures.map(value => ({ value, label: MaterialGenerationService.title(value), selected: this.state.creatureNatures.includes(value) })),
      creatureSummary: this.#summary(this.state.creatureNatures, value => MaterialGenerationService.title(value), "Select creature types"),
      profileOptions: allProfileOptions,
      profileSummary: this.#summary(this.state.creatureProfiles, key => allProfileOptions.find(row => row.key === key)?.label ?? key, "Select harvest profiles"),
      environmentBiomeOptions: biomes.map(value => ({ value, label: MaterialGenerationService.title(value), selected: this.state.environmentBiomes.includes(value) })),
      environmentBiomeSummary: this.#summary(this.state.environmentBiomes, value => MaterialGenerationService.title(value), "Select biomes"),
      resourceOptions,
      resourceSummary: this.#summary(this.state.resources.filter(value => resourceOptions.some(row => row.value === value && row.enabled)), value => MaterialCatalogService.categoryLabel("gathering", value), "Select resources"),
      environmentAbundanceOptions: abundanceOptions.map(row => ({ ...row, selected: this.state.environmentAbundances.includes(row.value) })),
      environmentAbundanceSummary: this.#summary(this.state.environmentAbundances, value => MaterialGenerationService.ABUNDANCE[value]?.label ?? MaterialGenerationService.title(value), "Select abundance"),
      huntBiomeOptions: huntBiomes.map(value => ({ value, label: MaterialGenerationService.title(value), selected: this.state.huntBiomes.includes(value) })),
      huntBiomeSummary: this.#summary(this.state.huntBiomes, value => MaterialGenerationService.title(value), "Select hunt biomes"),
      huntAbundanceOptions: huntAbundanceOptions.map(row => ({ ...row, selected: this.state.huntAbundances.includes(row.value) })),
      huntAbundanceSummary: this.#summary(this.state.huntAbundances, value => MaterialGenerationService.GAME_HUNT_ABUNDANCE[value]?.label ?? MaterialGenerationService.title(value), "Select abundance"),
      essenceOptions: MaterialGenerationService.essenceAffinityOptions(this.state.essenceAffinities),
      itemPilesAvailable: ItemPilesBridge.isAvailable(),
      lastResult: this.lastResult ? {
        ...this.lastResult,
        empty: !this.lastResult.items?.length,
        created: Boolean(this.lastResult.folder),
        pileCreated: Boolean(this.lastResult.itemPile?.uuid),
        folderLabel: this.lastResult.folder?.name ?? "",
        pileLabel: this.lastResult.itemPile?.uuid ? "Item Pile created on the viewed Scene" : ""
      } : null
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelector('[name="source"]')?.addEventListener("change", event => {
      this.#syncState();
      this.state.source = event.currentTarget.value;
      this.lastResult = null;
      this.render({ force: true });
    });

    for (const name of ["sources", "gatherAttempts", "huntAttempts"]) {
      root.querySelector(`[name="${name}"]`)?.addEventListener("change", () => this.#syncState());
    }

    root.querySelectorAll('[name="essenceAffinity"]').forEach(input => input.addEventListener("change", () => {
      this.#syncState();
      this.lastResult = null;
    }));

    this.#wireMultiSelects(root);

    root.querySelector('[data-action="generate"]')?.addEventListener("click", event => this.#generate(event));
    root.querySelector('[data-action="generate-again"]')?.addEventListener("click", event => this.#generate(event));
    root.querySelector('[data-action="create-folder"]')?.addEventListener("click", event => this.#createFolder(event));
    root.querySelector('[data-action="create-item-pile"]')?.addEventListener("click", event => this.#createItemPile(event));
    root.querySelector('[data-action="open-items"]')?.addEventListener("click", event => {
      event.preventDefault();
      ui.items?.render?.(true);
    });
  }

  #normalizeState({ entries, creatureNatures, biomes, huntBiomes }) {
    this.state.creatureNatures = this.#validArray(this.state.creatureNatures, creatureNatures, creatureNatures.includes("undead") ? "undead" : creatureNatures[0]);
    const profileKeys = new Set(creatureNatures.flatMap(nature => MaterialGenerationService.profilesFor(nature).map(profile => `${nature}:${profile.id}`)));
    this.state.creatureProfiles = [...new Set((this.state.creatureProfiles ?? []).filter(key => profileKeys.has(key) && this.state.creatureNatures.includes(String(key).split(":")[0])))];
    if (!this.state.creatureProfiles.length && this.state.creatureNatures[0]) this.state.creatureProfiles = [`${this.state.creatureNatures[0]}:general`];

    this.state.environmentBiomes = this.#validArray(this.state.environmentBiomes, biomes, biomes.includes("forest") ? "forest" : biomes[0]).slice(0, 3);
    const availableResources = MaterialGenerationService.resourceCategories(entries, this.state.environmentBiomes);
    this.state.resources = this.#validArray(this.state.resources, availableResources, availableResources.includes("flora") ? "flora" : availableResources[0]);
    this.state.environmentAbundances = this.#validArray(this.state.environmentAbundances, Object.keys(MaterialGenerationService.ABUNDANCE), "normal").slice(0, 2);

    this.state.huntBiomes = this.#validArray(this.state.huntBiomes, huntBiomes, huntBiomes.includes("forest") ? "forest" : huntBiomes[0]).slice(0, 3);
    this.state.huntAbundances = this.#validArray(this.state.huntAbundances, Object.keys(MaterialGenerationService.GAME_HUNT_ABUNDANCE), "normal").slice(0, 2);
  }

  #validArray(values, allowed, fallback="") {
    const allowedSet = new Set((allowed ?? []).map(String));
    const rows = [...new Set((values ?? []).map(String).filter(value => allowedSet.has(value)))];
    if (!rows.length && fallback && allowedSet.has(String(fallback))) rows.push(String(fallback));
    return rows;
  }

  #summary(values, labelFor, emptyLabel) {
    const labels = (values ?? []).map(labelFor).filter(Boolean);
    if (!labels.length) return emptyLabel;
    if (labels.length <= 2) return labels.join(" + ");
    return `${labels.slice(0, 2).join(" + ")} +${labels.length - 2}`;
  }

  #wireMultiSelects(root) {
    root.querySelectorAll("[data-multi-select]").forEach(widget => {
      const group = String(widget.dataset.multiSelect ?? "");
      const max = Math.max(0, Number(widget.dataset.maxSelections) || 0);
      const inputs = [...widget.querySelectorAll('input[type="checkbox"]')];
      const updateLimits = () => {
        const checked = inputs.filter(input => input.checked && !input.disabled);
        const atMax = max > 0 && checked.length >= max;
        inputs.forEach(input => {
          if (input.dataset.unavailable === "true") input.disabled = true;
          else input.disabled = atMax && !input.checked;
        });
      };
      updateLimits();
      inputs.forEach(input => input.addEventListener("change", event => {
        if (max > 0 && inputs.filter(row => row.checked).length > max) event.currentTarget.checked = false;
        this.#syncState();
        if (group === "creature-natures") this.#syncProfileAvailability(root);
        if (group === "environment-biomes") this.#syncResourceAvailability(root);
        this.#updateMultiSummaries(root);
        updateLimits();
        this.lastResult = null;
      }));
    });
    this.#syncProfileAvailability(root);
    this.#syncResourceAvailability(root);
    this.#updateMultiSummaries(root);
  }

  #syncProfileAvailability(root) {
    const selectedNatures = new Set([...root.querySelectorAll('[name="creatureNature"]:checked')].map(input => input.value));
    root.querySelectorAll('[name="creatureProfile"]').forEach(input => {
      const nature = String(input.dataset.nature ?? "");
      const enabled = selectedNatures.has(nature);
      input.disabled = !enabled;
      input.dataset.unavailable = enabled ? "false" : "true";
      input.closest("label")?.classList.toggle("disabled", !enabled);
      if (!enabled) input.checked = false;
    });

    for (const nature of selectedNatures) {
      const rows = [...root.querySelectorAll('[name="creatureProfile"]')].filter(input => String(input.dataset.nature ?? "") === nature);
      if (rows.length && !rows.some(input => input.checked)) {
        const general = rows.find(input => input.value.endsWith(":general")) ?? rows[0];
        if (general) general.checked = true;
      }
    }
    this.#syncState();
  }

  #syncResourceAvailability(root) {
    const selectedBiomes = new Set([...root.querySelectorAll('[name="environmentBiome"]:checked')].map(input => input.value));
    root.querySelectorAll('[name="resourceCategory"]').forEach(input => {
      const supported = new Set(String(input.dataset.biomes ?? "").split(",").filter(Boolean));
      const enabled = [...selectedBiomes].some(biome => supported.has(biome));
      input.disabled = !enabled;
      input.dataset.unavailable = enabled ? "false" : "true";
      input.closest("label")?.classList.toggle("disabled", !enabled);
      if (!enabled) input.checked = false;
    });
    const enabledRows = [...root.querySelectorAll('[name="resourceCategory"]:not(:disabled)')];
    if (enabledRows.length && !enabledRows.some(input => input.checked)) enabledRows[0].checked = true;
    this.#syncState();
  }

  #updateMultiSummaries(root) {
    root.querySelectorAll("[data-multi-select]").forEach(widget => {
      const summary = widget.querySelector("[data-multi-summary]");
      if (!summary) return;
      const checked = [...widget.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')];
      const labels = checked.map(input => String(input.dataset.label || input.closest("label")?.querySelector("span")?.textContent || input.value).trim()).filter(Boolean);
      const empty = String(widget.dataset.emptyLabel || "Select options");
      summary.textContent = !labels.length ? empty : labels.length <= 2 ? labels.join(" + ") : `${labels.slice(0, 2).join(" + ")} +${labels.length - 2}`;
    });
  }

  #syncState() {
    const root = this.element;
    if (!root) return;
    const source = root.querySelector('[name="source"]');
    if (source) this.state.source = source.value;

    if (root.querySelector('[name="creatureNature"]')) this.state.creatureNatures = [...root.querySelectorAll('[name="creatureNature"]:checked')].map(input => input.value);
    if (root.querySelector('[name="creatureProfile"]')) this.state.creatureProfiles = [...root.querySelectorAll('[name="creatureProfile"]:checked:not(:disabled)')].map(input => input.value);
    if (root.querySelector('[name="essenceAffinity"]')) this.state.essenceAffinities = [...root.querySelectorAll('[name="essenceAffinity"]:checked')].map(input => input.value);
    if (root.querySelector('[name="environmentBiome"]')) this.state.environmentBiomes = [...root.querySelectorAll('[name="environmentBiome"]:checked')].map(input => input.value).slice(0, 3);
    if (root.querySelector('[name="resourceCategory"]')) this.state.resources = [...root.querySelectorAll('[name="resourceCategory"]:checked:not(:disabled)')].map(input => input.value);
    if (root.querySelector('[name="environmentAbundance"]')) this.state.environmentAbundances = [...root.querySelectorAll('[name="environmentAbundance"]:checked')].map(input => input.value).slice(0, 2);
    if (root.querySelector('[name="huntBiome"]')) this.state.huntBiomes = [...root.querySelectorAll('[name="huntBiome"]:checked')].map(input => input.value).slice(0, 3);
    if (root.querySelector('[name="huntAbundance"]')) this.state.huntAbundances = [...root.querySelectorAll('[name="huntAbundance"]:checked')].map(input => input.value).slice(0, 2);

    const sources = root.querySelector('[name="sources"]');
    if (sources) this.state.sources = Math.clamp(Math.floor(Number(sources.value) || 1), 1, 100);
    const gatherAttempts = root.querySelector('[name="gatherAttempts"]');
    if (gatherAttempts) this.state.gatherAttempts = Math.clamp(Math.floor(Number(gatherAttempts.value) || 1), 1, 100);
    const huntAttempts = root.querySelector('[name="huntAttempts"]');
    if (huntAttempts) this.state.huntAttempts = Math.clamp(Math.floor(Number(huntAttempts.value) || 1), 1, 100);
  }

  #request() {
    if (this.state.source === "environment") return {
      source: "environment",
      biomes: [...this.state.environmentBiomes],
      resources: [...this.state.resources],
      abundances: [...this.state.environmentAbundances],
      attempts: this.state.gatherAttempts
    };
    if (this.state.source === "hunt") return {
      source: "hunt",
      biomes: [...this.state.huntBiomes],
      abundances: [...this.state.huntAbundances],
      attempts: this.state.huntAttempts
    };
    return {
      source: "creature",
      natures: [...this.state.creatureNatures],
      profileKeys: [...this.state.creatureProfiles],
      sources: this.state.sources,
      essenceAffinities: [...this.state.essenceAffinities]
    };
  }

  async #generate(event) {
    event.preventDefault();
    this.#syncState();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      this.lastResult = await MaterialGenerationService.generate(this.#request());
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Material generation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not generate materials.");
      button.disabled = false;
    }
  }

  async #createFolder(event) {
    event.preventDefault();
    if (!this.lastResult?.items?.length || this.lastResult.folder) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      this.lastResult = await MaterialGenerationService.createWorldLoot(this.lastResult);
      if (this.lastResult.folder) ui.notifications.info(`Created loot folder: ${this.lastResult.folder.name}.`);
      else ui.notifications.warn("No loot folder was created.");
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Loot folder creation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not create the loot folder.");
      button.disabled = false;
    }
  }

  async #createItemPile(event) {
    event.preventDefault();
    if (!this.lastResult?.items?.length || this.lastResult.itemPile?.uuid) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const itemPile = await ItemPilesBridge.createGeneratedLootPile(this.lastResult);
      this.lastResult = { ...this.lastResult, itemPile };
      ui.notifications.info("Generated loot Item Pile at the center of the viewed Scene.");
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Generated Item Pile creation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not create the Item Pile.");
      button.disabled = false;
    }
  }
}
