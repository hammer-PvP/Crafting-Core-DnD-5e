import { FLAGS, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "../services/material-catalog-service.mjs";
import { CuratedContentService } from "../services/curated-content-service.mjs";
import { CuratedAlchemyService } from "../services/curated-alchemy-service.mjs";
import { CuratedEquipmentService } from "../services/curated-equipment-service.mjs";
import { ProductSourceService } from "../services/product-source-service.mjs";
import { MaterialEditorApp } from "./material-editor-app.mjs";
import { OperationProgressApp } from "../ui/operation-progress.mjs";
import { ContentPackService } from "../services/content-pack-service.mjs";
import { CatalogAuditService } from "../services/catalog-audit-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TextEditor = foundry.applications.ux.TextEditor.implementation;

export class MaterialCatalogApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-materials",
    classes: ["crafting-core", "crafting-core-materials-app", "standard-form"],
    tag: "form",
    position: { width: 1280, height: 820 },
    window: { title: "Crafting Core — Catalog", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/material-catalog.hbs` }
  };

  filters = { search: "", family: "all", nature: "all", rarity: "all" };
  catalogView = "materials";
  contextCache = new Map();

  async _prepareContext() {
    const cacheKey = this.catalogView;
    let specific = this.contextCache.get(cacheKey);
    if (!specific) {
      specific = this.catalogView === "materials"
        ? await this.#materialsContext()
        : this.catalogView === "products"
          ? await this.#productsContext()
          : await this.#contentPacksContext();
      this.contextCache.set(cacheKey, specific);
    }
    return {
      ...specific,
      catalogView: this.catalogView,
      isMaterials: this.catalogView === "materials",
      isProducts: this.catalogView === "products",
      isContentPacks: this.catalogView === "packs"
    };
  }

  async #materialsContext() {
    const entries = await MaterialCatalogService.installedEntries();
    const materialPack = MaterialCatalogService.pack();
    const summary = {
      exists: Boolean(materialPack),
      collection: materialPack?.collection ?? MaterialCatalogService.PACK_ID,
      count: entries.length,
      managed: entries.filter(row => row.managed).length,
      custom: entries.filter(row => !row.managed).length,
      private: materialPack?.metadata?.private !== false
    };
    const filtered = entries.filter(entry => this.#matches(entry, { includeSearch: false })).map(entry => {
      const row = MaterialCatalogService.withIconChoices(entry);
      row.searchText = this.#searchText(entry);
      row.rarityLabel = MaterialCatalogService.rarityLabel(row.rarity);
      row.sourceLabel = row.managed ? "Content Pack" : "World";
      return row;
    });
    const natures = [...new Set(entries.map(entry => entry.nature).filter(Boolean))].sort((a,b) => a.localeCompare(b, game.i18n.lang));
    return {
      summary,
      groups: MaterialCatalogService.groupedEntries(filtered),
      economy: MaterialCatalogService.economy(),
      catalogCount: entries.length,
      shownCount: filtered.filter(entry => !this.filters.search || entry.searchText.includes(String(this.filters.search).trim().toLowerCase())).length,
      filters: this.filters,
      natureOptions: natures.map(value => ({ value, label: value.replace(/[-_]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()), selected: this.filters.nature === value })),
      familyOptions: [
        { value: "all", label: "All Families", selected: this.filters.family === "all" },
        { value: "creature", label: "Creature Harvest", selected: this.filters.family === "creature" },
        { value: "essence", label: "Essences", selected: this.filters.family === "essence" },
        { value: "gathering", label: "Gathering", selected: this.filters.family === "gathering" },
        { value: "profession", label: "Profession & Trade", selected: this.filters.family === "profession" }
      ],
      rarityOptions: MaterialCatalogService.rarityOptions({ includeAll: true }).map(option => ({ ...option, selected: this.filters.rarity === option.value }))
    };
  }

  async #productsContext() {
    const pack = ProductSourceService.productsPack();
    if (!pack) return { productPackExists: false, productCount: 0, productGroups: [] };
    const index = await pack.getIndex({ fields: [
      "name", "img", "type", "system.rarities", "system.identifier",
      `flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`, `flags.${MODULE_ID}.${FLAGS.PRODUCT_SYNC_STATUS}`,
      `flags.${MODULE_ID}.${FLAGS.PRODUCT_MIRROR}`, `flags.${MODULE_ID}.${FLAGS.CURATED_KIND}`,
      `flags.${MODULE_ID}.${FLAGS.CONTENT_PACK_ID}`, `flags.${MODULE_ID}.${FLAGS.CONTENT_ORIGIN}`
    ] });
    const rows = Array.from(index ?? []).map(row => {
      const flags = row.flags?.[MODULE_ID] ?? {};
      const sourceLabel = ContentPackService.sourceLabelForDocument(row);
      const origin = ContentPackService.originForDocument(row);
      return {
        id: row._id ?? row.id, name: row.name, img: row.img || "icons/svg/item-bag.svg", type: row.type || "Item",
        productId: String(flags[FLAGS.PRODUCT_ID] ?? ""), sourceLabel, origin,
        statusLabel: ProductSourceService.statusLabel(flags[FLAGS.PRODUCT_SYNC_STATUS] ?? ProductSourceService.STATUS.SYNCED),
        curatedKind: String(flags[FLAGS.CURATED_KIND] ?? ""),
        identifier: String(row.system?.identifier ?? "")
      };
    }).sort((a,b) => a.name.localeCompare(b.name, game.i18n.lang));
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.sourceLabel)) groups.set(row.sourceLabel, []);
      groups.get(row.sourceLabel).push(row);
    }
    return {
      productPackExists: true, productCount: rows.length,
      productGroups: [...groups.entries()].map(([label, products]) => ({ label, count: products.length, products }))
        .sort((a,b) => a.label.localeCompare(b.label, game.i18n.lang))
    };
  }

  async #contentPacksContext() {
    const packs = await ContentPackService.statusCards();
    return {
      contentPacks: packs,
      installedPackCount: packs.filter(row => row.installed).length,
      totalPackCount: packs.length,
      allPacksInstalled: packs.every(row => row.installed),
      itemCreatorCompatible: CuratedContentService.itemCreatorCompatible(),
      equipmentSourceAvailable: Boolean(CuratedEquipmentService.sourcePack())
    };
  }

  _onRender() {
    const root = this.element;
    root.querySelectorAll('[data-action="catalog-tab"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.catalogView = String(button.dataset.catalogView ?? "materials");
      this.render({ force: true });
    }));
    root.querySelector('[data-action="validate-catalog"]')?.addEventListener("click", event => this.#validateCatalog(event));
    root.querySelectorAll('[data-action="install-content-pack"]').forEach(button => button.addEventListener("click", event => this.#installContentPack(event)));
    root.querySelector('[data-action="install-all-content"]')?.addEventListener("click", event => this.#installAllContent(event));

    root.querySelector('[data-action="create-material"]')?.addEventListener("click", event => this.#createMaterial(event));
    root.querySelector('[data-action="create-product"]')?.addEventListener("click", event => this.#createProduct(event));
    root.querySelector('[data-action="open-materials"]')?.addEventListener("click", event => {
      event.preventDefault();
      if (!MaterialCatalogService.openPack()) ui.notifications.warn("No Materials Compendium exists yet.");
    });
    root.querySelector('[data-action="open-products"]')?.addEventListener("click", event => {
      event.preventDefault();
      if (!CuratedContentService.openProductsPack()) ui.notifications.warn("No Products Compendium exists yet.");
    });
    root.querySelectorAll('[data-action="open-product"]').forEach(button => button.addEventListener("click", event => this.#openProduct(event)));
    root.querySelector('[data-action="save-economy"]')?.addEventListener("click", event => this.#saveEconomy(event));
    root.querySelectorAll('[data-action="edit-material"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      new MaterialEditorApp(button.dataset.materialId).render({ force: true });
    }));
    root.querySelectorAll('[data-action="choose-material-icon"]').forEach(input => input.addEventListener("change", event => this.#chooseIcon(event)));

    for (const selector of ['[name="filter.family"]','[name="filter.nature"]','[name="filter.rarity"]']) {
      root.querySelector(selector)?.addEventListener("change", event => {
        const key = event.currentTarget.name.split(".")[1];
        this.filters[key] = event.currentTarget.value;
        this.#invalidate("materials");
        this.render({ force: true });
      });
    }
    const searchInput = root.querySelector('[name="filter.search"]');
    searchInput?.addEventListener("input", event => {
      this.filters.search = event.currentTarget.value;
      this.#applySearchFilter();
    });
    this.#applySearchFilter();

    for (const [selector, kind] of [['[data-drop-kind="custom-material"]', "material"], ['[data-drop-kind="custom-product"]', "product"]]) {
      const dropZone = root.querySelector(selector);
      if (!dropZone) continue;
      dropZone.addEventListener("dragover", event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; dropZone.classList.add("drag-over"); });
      dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
      dropZone.addEventListener("drop", event => kind === "material" ? this.#registerDrop(event, dropZone) : this.#registerProductDrop(event, dropZone));
    }

    this._ccMaterialSavedHook ??= Hooks.on(`${MODULE_ID}.materialEditorSaved`, () => { this.#invalidate("materials"); this.render({ force: true }); });
  }

  #invalidate(...views) {
    if (!views.length) this.contextCache.clear();
    else for (const view of views) this.contextCache.delete(view);
  }

  #setMaintenanceButtonsDisabled(disabled) {
    const selectors = [
      '[data-action="sync-materials"]',
      '[data-action="reset-curated-defaults"]',
      '[data-action="restore-curated-culinary"]',
      '[data-action="restore-curated-alchemy"]',
      '[data-action="restore-curated-equipment"]',
      '[data-action="sync-product-sources"]'
    ];
    this.element?.querySelectorAll?.(selectors.join(","))?.forEach(button => { button.disabled = Boolean(disabled); });
  }

  async close(options={}) {
    if (this._ccMaterialSavedHook) Hooks.off(`${MODULE_ID}.materialEditorSaved`, this._ccMaterialSavedHook);
    this._ccMaterialSavedHook = null;
    return super.close(options);
  }

  #matches(entry, { includeSearch=true }={}) {
    if (this.filters.family !== "all" && entry.family !== this.filters.family) return false;
    if (this.filters.nature !== "all" && entry.nature !== this.filters.nature) return false;
    if (this.filters.rarity !== "all" && entry.rarity !== this.filters.rarity) return false;
    if (!includeSearch) return true;
    const search = String(this.filters.search || "").trim().toLowerCase();
    return !search || this.#searchText(entry).includes(search);
  }

  #searchText(entry) {
    return [entry.name, entry.id, entry.nature, entry.category, ...(entry.tags ?? []), ...(entry.biomes ?? [])]
      .join(" ").toLowerCase();
  }

  #applySearchFilter() {
    const root = this.element;
    if (!root) return;

    // Product groups intentionally reuse the same visual <details> class as material groups,
    // but they contain .cc-product-table-row rather than .cc-material-table-row. The material
    // search pass used to see zero material rows and hide every Product group immediately after
    // render, producing a misleading 15/15 count above an empty catalog. Product filtering is
    // currently presentation-only, so leave those groups untouched.
    if (this.catalogView !== "materials") {
      root.querySelectorAll(".cc-material-group").forEach(group => { group.hidden = false; });
      return;
    }

    const search = String(this.filters.search || "").trim().toLowerCase();
    let shown = 0;
    root.querySelectorAll(".cc-material-group").forEach(group => {
      let groupShown = 0;
      group.querySelectorAll(".cc-material-table-row").forEach(row => {
        const matches = !search || String(row.dataset.search ?? "").includes(search);
        row.hidden = !matches;
        if (matches) { shown += 1; groupShown += 1; }
      });
      group.hidden = groupShown === 0;
      const count = group.querySelector("[data-role=group-visible-count]");
      if (count) count.textContent = `${groupShown} material${groupShown === 1 ? "" : "s"}`;
    });
    const counter = root.querySelector("[data-role=material-visible-count]");
    if (counter) counter.textContent = String(shown);
  }

  async #chooseIcon(event) {
    const input = event.currentTarget;
    if (!input?.checked) return;
    const row = input.closest(".cc-material-table-row");
    const materialId = String(input.dataset.materialId ?? "");
    const path = String(input.value ?? "");
    const previousPath = String(row?.dataset.currentIcon ?? "");
    const controls = [...(row?.querySelectorAll('[data-action="choose-material-icon"]') ?? [])];
    const labels = [...(row?.querySelectorAll(".cc-icon-choice") ?? [])];

    controls.forEach(control => control.disabled = true);
    row?.classList.add("saving-icon");
    try {
      const saved = await MaterialCatalogService.saveIconChoice(materialId, path);
      const savedPath = String(saved?.img ?? path);
      const preview = row?.querySelector(".cc-material-name img");
      if (preview && savedPath) preview.src = savedPath;
      controls.forEach(control => { control.checked = control.value === savedPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === savedPath));
      if (row) row.dataset.currentIcon = savedPath;
      row?.classList.add("icon-saved");
      setTimeout(() => row?.classList.remove("icon-saved"), 550);
    } catch (error) {
      console.error(`${MODULE_ID} | Material icon selection failed.`, error);
      controls.forEach(control => { control.checked = control.value === previousPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === previousPath));
      ui.notifications.error(error.message ?? "Crafting Core could not save that material icon.");
    } finally {
      row?.classList.remove("saving-icon");
      controls.forEach(control => control.disabled = false);
    }
  }

  async #sync(event) {
    event.preventDefault();
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      await this.#saveEconomy(null, { notify: false });
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Synchronize Materials",
        initial: { phase: "Preparing Materials", label: "Starting catalog synchronization…" },
        task: report => MaterialCatalogService.sync({ onProgress: report }),
        summarize: result => ({
          message: "Materials synchronized successfully.",
          summary: [
            { label: "Created", value: result.created ?? 0 },
            { label: "Updated", value: result.updated ?? 0 },
            { label: "Catalog Materials", value: result.total ?? 0 }
          ]
        })
      });
      if (!result) return;
      ui.notifications.info(`Materials synchronized: ${result.created} created, ${result.updated} updated.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Material sync failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not synchronize materials.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #syncProductSources(event) {
    event.preventDefault();
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Synchronize Product Sources",
        initial: { phase: "Preparing Product Sources", label: "Resolving mother Items and fallback mirrors…" },
        task: report => ProductSourceService.syncAll({ onProgress: report, reconcile: true }),
        summarize: result => ({
          message: "Product Sources synchronized.",
          summary: [
            { label: "Synced", value: result.synced ?? 0 },
            { label: "Updated", value: result.updated ?? 0 },
            { label: "Source Missing", value: result.sourceMissing ?? 0 },
            { label: "Needs Review", value: result.needsReview ?? 0 },
            { label: "Recipes Updated", value: (result.draftsUpdated ?? 0) + (result.publishedUpdated ?? 0) },
            { label: "Legacy Knowledge Preserved", value: result.reconciliation?.legacyPreserved ?? 0 },
            { label: "Legacy Knowledge Relinked", value: result.reconciliation?.relinked ?? 0 }
          ]
        })
      });
      if (!result) return;
      const legacyPreserved = Number(result.reconciliation?.legacyPreserved ?? 0);
      const warning = Number(result.sourceMissing ?? 0) + Number(result.needsReview ?? 0) + legacyPreserved;
      const text = `Product Sources: ${result.synced ?? 0} synced, ${result.updated ?? 0} updated, ${result.sourceMissing ?? 0} source missing, ${result.needsReview ?? 0} need review${legacyPreserved ? `; ${legacyPreserved} learned Recipe entr${legacyPreserved === 1 ? "y" : "ies"} preserved as Legacy Knowledge` : ""}.`;
      if (warning) ui.notifications.warn(text);
      else ui.notifications.info(text);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Product Source sync failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not synchronize Product Sources.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #resetCuratedDefaults(event) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reset Curated Material Catalog" },
      content: "<p>Reset every <strong>built-in curated material</strong> to the Crafting Core defaults?</p><p>This restores curated names, icons, rarity/value/drop defaults, quantities, tags and biome metadata. Registered custom materials are preserved.</p>",
      yes: { label: "Reset Curated Defaults", icon: "fa-solid fa-rotate-left" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Reset Curated Materials",
        initial: { phase: "Preparing Curated Reset", label: "Comparing the catalog with Crafting Core defaults…" },
        task: report => MaterialCatalogService.resetCuratedDefaults({ onProgress: report }),
        summarize: result => ({
          message: "Curated Material defaults restored successfully.",
          summary: [
            { label: "Created", value: result.created ?? 0 },
            { label: "Restored", value: result.updated ?? 0 },
            { label: "Catalog Materials", value: result.total ?? 0 }
          ]
        })
      });
      if (!result) return;
      ui.notifications.info(`Curated catalog reset: ${result.created} created, ${result.updated} restored.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Curated material reset failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not reset the curated catalog.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #restoreCuratedCulinary(event) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Restore Curated Product Library" },
      content: "<p>Repair and restore the <strong>58 official Curated Products and Recipe Learn Sources</strong>?</p><p>This includes 15 Meals, 28 Alcoholic Drinks, and 15 Non-Alcoholic Drinks. Missing official content is recreated and existing Curated definitions are restored to the current Crafting Core defaults. Duplicate or fork a Recipe first if you want to preserve a custom version.</p>",
      yes: { label: "Restore Curated Defaults", icon: "fa-solid fa-utensils" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Restore Curated Products",
        initial: { phase: "Preparing Curated Culinary", label: "Resolving Materials and Product definitions…" },
        task: report => CuratedContentService.restoreAll({ onProgress: report }),
        summarize: result => {
          const products = result.products ?? {};
          const recipes = result.recipes ?? {};
          return {
            message: "Curated Product library restored successfully.",
            summary: [
              { label: "Products", value: `${products.created ?? 0} created · ${products.updated ?? 0} updated` },
              { label: "Recipes", value: `${recipes.created ?? 0} created · ${recipes.updated ?? 0} updated` },
              { label: "Folder Repairs", value: recipes.foldersRepaired ?? 0 }
            ]
          };
        }
      });
      if (!result) return;
      const products = result.products ?? {};
      const recipes = result.recipes ?? {};
      const repairedFolders = Number(recipes.foldersRepaired ?? 0);
      const folderSuffix = repairedFolders ? `; ${repairedFolders} Recipe folder placement${repairedFolders === 1 ? "" : "s"} repaired` : "";
      ui.notifications.info(`Curated Product library restored: ${products.created ?? 0} Products created, ${products.updated ?? 0} updated; ${recipes.created ?? 0} Recipes created, ${recipes.updated ?? 0} updated${folderSuffix}.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Curated Product restore failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not restore the Curated Product library.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #restoreCuratedAlchemy(event) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Install / Restore Alchemy & Inscription" },
      content: "<p>Install or repair the optional <strong>Curated Alchemy & Inscription</strong> library?</p><p>Canonical Products are cloned at runtime only from the installed D&D5e <strong>SRD 5.2 / SRD 5.1 CC-BY-4.0</strong> packs. Inscription variants preserve the original SRD Activities and effects while changing presentation and crafting.</p><p>New Creature Harvest materials use the Scanner v2 eligibility rules. Re-run Creature Scanner after installation to populate their World-specific creature sources.</p>",
      yes: { label: "Install / Restore", icon: "fa-solid fa-flask-vial" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Restore Alchemy & Inscription",
        initial: { phase: "Checking SRD Sources", label: "Validating native D&D5e source Items…" },
        task: async report => {
          report({ phase: "Checking SRD Sources", label: "Validating native D&D5e source Items…", current: 0, total: 0, overallCurrent: 0, overallTotal: 0 });
          const audit = await CuratedAlchemyService.auditSrdSources();
          if (!audit.ok) throw new Error(`Missing SRD sources: ${audit.missing.map(row => row.key).join(", ")}`);
          report({ phase: "SRD Sources Ready", label: "All required native source Items were resolved. Starting curated restore…", current: 0, total: 0, overallCurrent: 0, overallTotal: 0 });
          return CuratedAlchemyService.restoreAll({ onProgress: report });
        },
        summarize: result => {
          const products = result.products ?? {};
          const recipes = result.recipes ?? {};
          return {
            message: result.complete ? "Alchemy & Inscription restored successfully." : "Alchemy & Inscription completed with partial failures.",
            summary: [
              { label: "Products", value: `${products.created ?? 0} created · ${products.updated ?? 0} updated` },
              { label: "Recipes", value: `${recipes.created ?? 0} created · ${recipes.updated ?? 0} updated` },
              { label: "Product Failures", value: products.failures?.length ?? 0 },
              { label: "Recipes Skipped", value: recipes.skipped?.length ?? 0 }
            ]
          };
        }
      });
      if (!result) return;
      const products = result.products ?? {};
      const recipes = result.recipes ?? {};
      const failed = Number(products.failures?.length ?? 0);
      const skipped = Number(recipes.skipped?.length ?? 0);
      const message = `Alchemy & Inscription: ${products.created ?? 0} Products created, ${products.updated ?? 0} rebuilt/updated; ${recipes.created ?? 0} Recipes created, ${recipes.updated ?? 0} updated${failed ? `; ${failed} Product failures` : ""}${skipped ? `; ${skipped} Recipes skipped` : ""}.`;
      if (result.complete) ui.notifications.info(`${message} Re-run Creature Scanner for the new harvest-source links.`);
      else {
        console.warn(`${MODULE_ID} | Alchemy & Inscription completed with partial failures.`, { products: products.failures ?? [], recipes: recipes.skipped ?? [] });
        ui.notifications.warn(`${message} The remaining entries were still processed; check the console for the failure summary.`);
      }
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Curated Alchemy & Inscription restore failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not restore Alchemy & Inscription.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #restoreCuratedEquipment(event) {
    event.preventDefault();
    let cleanupPreview = null;
    try {
      cleanupPreview = await CuratedEquipmentService.cleanupPreview();
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not preflight Equipment cleanup. Restore can still continue.`, error);
    }
    const obsoleteProducts = Number(cleanupPreview?.obsoleteProducts ?? 0);
    const obsoleteRecipes = Number(cleanupPreview?.obsoleteRecipes ?? 0);
    const affectedActors = Number(cleanupPreview?.affectedActors ?? 0);
    const knownObsoleteRecipes = Number(cleanupPreview?.knownObsoleteRecipes ?? 0);
    const cleanupNotice = obsoleteProducts || obsoleteRecipes
      ? `<p><strong>Cleanup:</strong> ${obsoleteProducts} obsolete Equipment Product${obsoleteProducts === 1 ? "" : "s"} and ${obsoleteRecipes} obsolete Blueprint${obsoleteRecipes === 1 ? "" : "s"} were detected. Obsolete managed entries will be retired. ${affectedActors ? `<strong>${affectedActors} Character${affectedActors === 1 ? "" : "s"}</strong> currently know ${knownObsoleteRecipes} of those Blueprint${knownObsoleteRecipes === 1 ? "" : "s"}; their learned Recipes will be preserved as <strong>Legacy Knowledge</strong> and active Projects will not be changed.` : "No Character knowledge is affected."}</p>`
      : "";
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Install / Restore Equipment Crafting" },
      content: `<p>Install or repair the <strong>Curated Equipment</strong> library from the installed D&D5e <strong>SRD 5.2 Equipment</strong> pack?</p><p>Each mundane weapon, armor, shield, and ammunition entry receives +0, +1, +2, and +3 Products and Blueprint Recipes. Ammunition crafts in batches of 10. Recipes use flexible Ingredient Slots, Long-Rest Projects, Constitution Extra Effort, and the configured equipment proficiency rules.</p>${cleanupNotice}`,
      yes: { label: "Install / Restore", icon: "fa-solid fa-shield-halved" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    if (OperationProgressApp.busy) return ui.notifications.warn("Crafting Core is already running another maintenance operation.");
    this.#setMaintenanceButtonsDisabled(true);
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Restore Equipment",
        initial: { phase: "Scanning SRD Equipment", label: "Resolving mundane SRD 5.2 equipment…", overallCurrent: 0, overallTotal: 1 },
        task: report => CuratedEquipmentService.restoreAll({ onProgress: report }),
        summarize: result => ({
          message: "Equipment crafting library restored successfully.",
          summary: [
            { label: "SRD Base Items", value: result.baseItems ?? 0 },
            { label: "Products", value: `${result.products?.created ?? 0} created · ${result.products?.updated ?? 0} updated` },
            { label: "Blueprints", value: `${result.recipes?.created ?? 0} created · ${result.recipes?.updated ?? 0} updated` },
            { label: "Retired Obsolete", value: `${result.cleanup?.productsRemoved ?? 0} Products · ${result.cleanup?.recipesRemoved ?? 0} Blueprints` },
            { label: "Legacy Knowledge Preserved", value: result.cleanup?.legacy?.entries ?? 0 },
            { label: "Total Variants", value: result.total ?? 0 }
          ]
        })
      });
      if (!result) return;
      const legacy = Number(result.cleanup?.legacy?.entries ?? 0);
      const retired = Number(result.cleanup?.productsRemoved ?? 0) + Number(result.cleanup?.recipesRemoved ?? 0);
      ui.notifications.info(`Equipment Crafting: ${result.baseItems ?? 0} SRD base Items, ${result.total ?? 0} Product/Blueprint variants restored${retired ? `; ${retired} obsolete managed entries retired` : ""}${legacy ? `; ${legacy} learned Recipe entr${legacy === 1 ? "y" : "ies"} preserved as Legacy Knowledge` : ""}.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Curated Equipment restore failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not restore Equipment Crafting.");
    } finally {
      this.#setMaintenanceButtonsDisabled(false);
    }
  }

  async #chooseProductIcon(event) {
    const input = event.currentTarget;
    if (!input?.checked) return;
    const row = input.closest(".cc-product-table-row");
    const productId = String(input.dataset.productId ?? "");
    const path = String(input.value ?? "");
    const previousPath = String(row?.dataset.currentIcon ?? "");
    const controls = [...(row?.querySelectorAll('[data-action="choose-product-icon"]') ?? [])];
    const labels = [...(row?.querySelectorAll(".cc-icon-choice") ?? [])];
    controls.forEach(control => control.disabled = true);
    row?.classList.add("saving-icon");
    try {
      const saved = await CuratedContentService.saveProductIconChoice(productId, path);
      const savedPath = String(saved?.img ?? path);
      const preview = row?.querySelector(".cc-material-name img");
      if (preview && savedPath) preview.src = savedPath;
      controls.forEach(control => { control.checked = control.value === savedPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === savedPath));
      if (row) row.dataset.currentIcon = savedPath;
      row?.classList.add("icon-saved");
      setTimeout(() => row?.classList.remove("icon-saved"), 550);
    } catch (error) {
      console.error(`${MODULE_ID} | Curated Product icon selection failed.`, error);
      controls.forEach(control => { control.checked = control.value === previousPath; });
      labels.forEach(label => label.classList.toggle("selected", label.querySelector("input")?.value === previousPath));
      ui.notifications.error(error.message ?? "Crafting Core could not save that Product icon.");
    } finally {
      row?.classList.remove("saving-icon");
      controls.forEach(control => control.disabled = false);
    }
  }

  async #createMaterial(event) {
    event.preventDefault();
    try {
      const item = await MaterialCatalogService.createCustomMaterial();
      this.#invalidate("materials", "packs");
      new MaterialEditorApp(String(item.getFlag(MODULE_ID, FLAGS.MATERIAL_ID) ?? item.id)).render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Custom material creation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not create that material.");
    }
  }

  async #createProduct(event) {
    event.preventDefault();
    try {
      const item = await ProductSourceService.createCustomProduct();
      this.#invalidate("products", "packs");
      item.sheet?.render?.({ force: true });
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Custom Product creation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not create that Product.");
    }
  }

  async #registerProductDrop(event, dropZone) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.type !== "Item") return ui.notifications.warn("Drop a D&D5e Item here.");
      const item = await Item.implementation.fromDropData(data);
      if (!(item instanceof Item)) return ui.notifications.warn("Crafting Core could not resolve that Item.");
      const created = await ProductSourceService.registerExistingProduct(item);
      ui.notifications.info(`${created.name} registered in Crafting Core — Products.`);
      this.#invalidate("products", "packs");
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Product registration failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not register that Product.");
    }
  }

  async #openProduct(event) {
    event.preventDefault();
    const id = String(event.currentTarget?.dataset?.itemId ?? "");
    const pack = ProductSourceService.productsPack();
    if (!id || !pack) return;
    const item = await pack.getDocument(id);
    item?.sheet?.render?.({ force: true });
  }

  async #installContentPack(event) {
    event.preventDefault();
    const packId = String(event.currentTarget?.dataset?.packId ?? "");
    const title = String(event.currentTarget?.dataset?.packTitle ?? "Content Pack");
    if (!packId || OperationProgressApp.busy) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `${title} — ${event.currentTarget?.dataset?.installed === "true" ? "Restore Defaults" : "Install"}` },
      content: `<p>${event.currentTarget?.dataset?.installed === "true" ? "Restore the managed defaults for" : "Install"} <strong>${title}</strong>?</p><p>World-owned content, learned Character Recipes and active Projects are not removed by this operation.</p>`,
      yes: { label: event.currentTarget?.dataset?.installed === "true" ? "Restore Defaults" : "Install", icon: `fa-solid ${event.currentTarget?.dataset?.installed === "true" ? "fa-rotate-left" : "fa-download"}` },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    try {
      await OperationProgressApp.run({
        title: `Crafting Core — ${title}`,
        initial: { phase: "Preparing Content Pack", label: title, current: 0, total: 1, overallCurrent: 0, overallTotal: 1 },
        task: report => ContentPackService.install(packId, { onProgress: report }),
        summarize: () => ({ message: `${title} is ready.`, summary: [] })
      });
      this.#invalidate();
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Content Pack installation failed.`, error);
      ui.notifications.error(error.message ?? `Crafting Core could not install ${title}.`);
    }
  }

  async #installAllContent(event) {
    event.preventDefault();
    if (OperationProgressApp.busy) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Install Crafting Core Content" },
      content: "<p>Install all currently missing Crafting Core content packs?</p><p>Missing packs are installed in dependency order: Materials first, then Culinary, Alchemy &amp; Inscription, and SRD Equipment Crafting. The Creature Scanner remains a separate GM action after installation.</p>",
      yes: { label: "Install All", icon: "fa-solid fa-download" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Install All Content",
        initial: { phase: "Preparing Content", label: "Resolving installed dependencies…", current: 0, total: 4, overallCurrent: 0, overallTotal: 4 },
        task: report => ContentPackService.installAll({ onProgress: report }),
        summarize: rows => ({
          message: "Content installation complete.",
          summary: [
            { label: "Installed", value: rows.filter(row => !row.skipped).length },
            { label: "Skipped", value: rows.filter(row => row.skipped).length },
            { label: "Next", value: "Run Creature Scanner if you want Harvest links" }
          ]
        })
      });
      if (!result) return;
      this.#invalidate();
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Install All failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not install all content packs.");
    }
  }

  async #validateCatalog(event) {
    event.preventDefault();
    if (OperationProgressApp.busy) return;
    try {
      const result = await OperationProgressApp.run({
        title: "Crafting Core — Validate Catalog",
        initial: { phase: "Validating Catalog", label: "Checking Materials, Products, Recipes and source integrity…", current: 0, total: 1, overallCurrent: 0, overallTotal: 1 },
        task: async report => {
          const audit = await CatalogAuditService.audit();
          report({ phase: "Catalog Validation Complete", label: audit.healthy ? "No catalog integrity issues were detected." : `${audit.issueCount} issue${audit.issueCount === 1 ? "" : "s"} detected.`, current: 1, total: 1, overallCurrent: 1, overallTotal: 1, stats: { materials: audit.materials, products: audit.products, recipes: audit.recipes, sourceMissing: audit.issues.sourceMissing, needsReview: audit.issues.needsReview, duplicates: audit.issues.duplicateMaterials + audit.issues.duplicateProducts + audit.issues.duplicateRecipes, incompletePacks: audit.issues.incompletePacks, legacyKnowledge: audit.legacyKnowledge } });
          return audit;
        },
        summarize: audit => ({
          message: audit.healthy ? "Catalog validation passed." : "Catalog validation found items that need review.",
          summary: [
            { label: "Materials", value: audit.materials },
            { label: "Products", value: audit.products },
            { label: "Published Recipes", value: audit.recipes },
            { label: "Source Missing", value: audit.issues.sourceMissing },
            { label: "Needs Review", value: audit.issues.needsReview },
            { label: "Duplicate IDs", value: audit.issues.duplicateMaterials + audit.issues.duplicateProducts + audit.issues.duplicateRecipes },
            { label: "Packs Need Restore", value: audit.issues.incompletePacks },
            { label: "Legacy Knowledge", value: audit.legacyKnowledge }
          ]
        })
      });
      if (!result) return;
      const sourceIssues = Number(result.issues?.sourceMissing ?? 0) + Number(result.issues?.needsReview ?? 0);
      if (sourceIssues > 0) {
        const repair = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Product Source Integrity" },
          content: `<p>Validation found <strong>${sourceIssues}</strong> Product Source issue${sourceIssues === 1 ? "" : "s"}.</p><p>Run Product Source synchronization now? Needs Review entries remain reviewable; the operation does not reconnect by name.</p>`,
          yes: { label: "Synchronize Sources", icon: "fa-solid fa-arrows-rotate" },
          no: { label: "Not Now" }
        });
        if (repair) {
          await OperationProgressApp.run({
            title: "Crafting Core — Product Source Sync",
            initial: { phase: "Synchronizing Product Sources", label: "Checking current mother Items and stable fallbacks…", current: 0, total: 1, overallCurrent: 0, overallTotal: 1 },
            task: report => ProductSourceService.syncAll({ onProgress: report, reconcile: true }),
            summarize: sync => ({ message: "Product Source synchronization complete.", summary: [
              { label: "Synced", value: sync.synced ?? 0 }, { label: "Updated", value: sync.updated ?? 0 },
              { label: "Source Missing", value: sync.sourceMissing ?? 0 }, { label: "Needs Review", value: sync.needsReview ?? 0 }
            ] })
          });
          this.#invalidate("products", "packs");
        }
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Catalog validation failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not validate the catalog.");
    }
  }

  async #saveEconomy(event, { notify=true }={}) {
    event?.preventDefault?.();
    const root = this.element;
    const economy = {};
    for (const rarity of MaterialCatalogService.RARITIES) {
      economy[rarity] = {
        price: Number(root.querySelector(`[name="economy.${rarity}.price"]`)?.value ?? 0),
        chance: Number(root.querySelector(`[name="economy.${rarity}.chance"]`)?.value ?? 0),
        denomination: "gp"
      };
    }
    await MaterialCatalogService.saveEconomy(economy);
    if (notify) {
      ui.notifications.info("Material rarity defaults saved. Restore the Materials content pack to apply defaults to managed Materials.");
      this.#invalidate("materials", "packs");
      this.render({ force: true });
    }
  }

  async #registerDrop(event, dropZone) {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    try {
      const data = TextEditor.getDragEventData(event);
      if (data?.type !== "Item") return ui.notifications.warn("Drop a D&D5e Item here.");
      const item = await Item.implementation.fromDropData(data);
      if (!(item instanceof Item)) return ui.notifications.warn("Crafting Core could not resolve that Item.");
      const created = await MaterialCatalogService.registerItem(item);
      ui.notifications.info(`${created.name} registered in Crafting Core — Materials.`);
      this.#invalidate("materials", "packs");
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Custom material registration failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not register that material.");
    }
  }
}
