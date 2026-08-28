import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";
import { MaterialGenerationService } from "../services/material-generation-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MaterialGeneratorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-material-generator",
    classes: ["crafting-core", "crafting-core-generator-app", "standard-form"],
    tag: "form",
    position: { width: 700, height: 560 },
    window: { title: "Crafting Core — Generate Materials", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-generator.hbs` }
  };

  state = {
    source: "creature",
    nature: "undead",
    profileId: "general",
    sources: 1,
    biome: "forest",
    resource: "flora",
    abundance: "normal",
    huntAttempts: 1,
    essenceAffinities: []
  };

  lastResult = null;

  async _prepareContext() {
    const { entries, creatureNatures, biomes, huntBiomes } = await MaterialGenerationService.options();
    if (!creatureNatures.includes(this.state.nature)) this.state.nature = creatureNatures.includes("undead") ? "undead" : (creatureNatures[0] ?? "");
    const profiles = MaterialGenerationService.profilesFor(this.state.nature);
    if (!profiles.some(p => p.id === this.state.profileId)) this.state.profileId = profiles[0]?.id ?? "general";

    const activeBiomes = this.state.source === "hunt" ? huntBiomes : biomes;
    if (!activeBiomes.includes(this.state.biome)) this.state.biome = activeBiomes.includes("forest") ? "forest" : (activeBiomes[0] ?? "");
    const resources = MaterialGenerationService.resourceCategories(entries, this.state.biome);
    if (!resources.includes(this.state.resource)) this.state.resource = resources.includes("flora") ? "flora" : (resources[0] ?? "");

    return {
      state: foundry.utils.deepClone(this.state),
      isCreature: this.state.source === "creature",
      isEnvironment: this.state.source === "environment",
      isHunt: this.state.source === "hunt",
      creatureOptions: creatureNatures.map(value => ({ value, label: MaterialGenerationService.title(value), selected: value === this.state.nature })),
      profileOptions: profiles.map(profile => ({ ...profile, selected: profile.id === this.state.profileId })),
      biomeOptions: activeBiomes.map(value => ({ value, label: MaterialGenerationService.title(value), selected: value === this.state.biome })),
      resourceOptions: resources.map(value => ({ value, label: MaterialCatalogService.categoryLabel("gathering", value), selected: value === this.state.resource })),
      abundanceOptions: Object.entries(MaterialGenerationService.ABUNDANCE).map(([value, row]) => ({ value, label: row.label, selected: value === this.state.abundance })),
      essenceOptions: MaterialGenerationService.essenceAffinityOptions(this.state.essenceAffinities),
      hasEssenceAffinities: this.state.essenceAffinities.length > 0,
      lastResult: this.lastResult ? {
        ...this.lastResult,
        empty: !this.lastResult.items?.length,
        created: Boolean(this.lastResult.folder),
        folderLabel: this.lastResult.folder?.name ?? ""
      } : null
    };
  }

  _onRender() {
    const root = this.element;
    for (const name of ["source", "nature", "profileId", "biome", "resource", "abundance"]) {
      root.querySelector(`[name="${name}"]`)?.addEventListener("change", event => {
        this.#syncState();
        this.state[name] = event.currentTarget.value;
        if (name === "nature") this.state.profileId = "general";
        if (name === "biome") this.state.resource = "";
        this.lastResult = null;
        this.render({ force: true });
      });
    }
    root.querySelector('[name="sources"]')?.addEventListener("change", () => this.#syncState());
    root.querySelector('[name="huntAttempts"]')?.addEventListener("change", () => this.#syncState());
    root.querySelectorAll('[name="essenceAffinity"]').forEach(input => input.addEventListener("change", () => {
      this.#syncState();
      this.lastResult = null;
    }));
    root.querySelector('[data-action="generate"]')?.addEventListener("click", event => this.#generate(event));
    root.querySelector('[data-action="generate-again"]')?.addEventListener("click", event => this.#generate(event));
    root.querySelector('[data-action="create-folder"]')?.addEventListener("click", event => this.#createFolder(event));
    root.querySelector('[data-action="open-items"]')?.addEventListener("click", event => {
      event.preventDefault();
      ui.items?.render?.(true);
    });
  }

  #syncState() {
    const root = this.element;
    for (const name of ["source", "nature", "profileId", "biome", "resource", "abundance"]) {
      const input = root.querySelector(`[name="${name}"]`);
      if (input) this.state[name] = input.value;
    }
    const sources = root.querySelector('[name="sources"]');
    if (sources) this.state.sources = Math.clamp(Math.floor(Number(sources.value) || 1), 1, 100);
    const huntAttempts = root.querySelector('[name="huntAttempts"]');
    if (huntAttempts) this.state.huntAttempts = Math.clamp(Math.floor(Number(huntAttempts.value) || 1), 1, 100);
    this.state.essenceAffinities = [...root.querySelectorAll('[name="essenceAffinity"]:checked')].map(input => input.value);
  }

  #request() {
    if (this.state.source === "environment") return { source: "environment", biome: this.state.biome, resource: this.state.resource, abundance: this.state.abundance };
    if (this.state.source === "hunt") return { source: "hunt", biome: this.state.biome, abundance: this.state.abundance, attempts: this.state.huntAttempts };
    return { source: "creature", nature: this.state.nature, profileId: this.state.profileId, sources: this.state.sources, essenceAffinities: [...this.state.essenceAffinities] };
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
}
