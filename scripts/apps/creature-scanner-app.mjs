import { MODULE_ID } from "../constants.mjs";
import { HarvestProfileService } from "../services/harvest-profile-service.mjs";
import { HarvestProfileEditorApp } from "./harvest-profile-editor-app.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CreatureScannerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-creature-scanner",
    classes: ["crafting-core", "crafting-core-scanner-app", "standard-form"],
    tag: "form",
    position: { width: 1040, height: 740 },
    window: { title: "Crafting Core — Creature Scanner", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/creature-scanner.hbs` }
  };

  selectedPacks = new Set();
  filters = { search: "", type: "all" };
  scanning = false;

  async _prepareContext() {
    const packs = HarvestProfileService.availableActorPacks();
    const profiles = HarvestProfileService.list();
    const types = [...new Set(profiles.map(profile => profile.creatureType).filter(Boolean))]
      .sort((a, b) => HarvestProfileService.creatureTypeLabel(a).localeCompare(HarvestProfileService.creatureTypeLabel(b), game.i18n.lang));
    const filtered = profiles.filter(profile => this.#matches(profile));

    return {
      packs: packs.map(pack => ({ ...pack, selected: this.selectedPacks.has(pack.collection) })),
      selectedPackCount: this.selectedPacks.size,
      profiles: filtered.map(profile => ({
        ...profile,
        anatomyLabel: profile.analysis?.anatomy?.join(", ") || "No anatomy tags",
        slotCount: profile.slots?.filter(slot => slot.materialId).length ?? 0,
        pinpointCount: profile.pinpointOverrides?.length ?? 0
      })),
      profileCount: profiles.length,
      visibleProfileCount: filtered.length,
      filterSearch: this.filters.search,
      typeOptions: [
        { value: "all", label: "All Creature Types", selected: this.filters.type === "all" },
        ...types.map(value => ({ value, label: HarvestProfileService.creatureTypeLabel(value), selected: this.filters.type === value }))
      ],
      scanning: this.scanning
    };
  }

  _onRender() {
    const root = this.element;

    root.querySelectorAll('[name="scan.pack"]').forEach(input => input.addEventListener("change", event => {
      if (event.currentTarget.checked) this.selectedPacks.add(event.currentTarget.value);
      else this.selectedPacks.delete(event.currentTarget.value);
      this.#updateSelectedCount();
    }));

    root.querySelector('[data-action="select-all-packs"]')?.addEventListener("click", event => {
      event.preventDefault();
      root.querySelectorAll('[name="scan.pack"]').forEach(input => { input.checked = true; this.selectedPacks.add(input.value); });
      this.#updateSelectedCount();
    });
    root.querySelector('[data-action="clear-packs"]')?.addEventListener("click", event => {
      event.preventDefault();
      root.querySelectorAll('[name="scan.pack"]').forEach(input => { input.checked = false; });
      this.selectedPacks.clear();
      this.#updateSelectedCount();
    });
    root.querySelector('[data-action="scan-packs"]')?.addEventListener("click", event => this.#scan(event));

    root.querySelector('[name="profile.search"]')?.addEventListener("input", event => {
      this.filters.search = event.currentTarget.value;
      clearTimeout(this._ccSearchTimer);
      this._ccSearchTimer = setTimeout(() => this.render({ force: true }), 180);
    });
    root.querySelector('[name="profile.type"]')?.addEventListener("change", event => {
      this.filters.type = event.currentTarget.value;
      this.render({ force: true });
    });

    root.querySelectorAll('[data-action="edit-profile"]').forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      new HarvestProfileEditorApp(button.dataset.profileId).render({ force: true });
    }));
    root.querySelectorAll('[data-action="reanalyze-profile"]').forEach(button => button.addEventListener("click", event => this.#reanalyze(event, button.dataset.profileId)));
    root.querySelectorAll('[data-action="delete-profile"]').forEach(button => button.addEventListener("click", event => this.#delete(event, button.dataset.profileId)));

    this._ccProfileHook ??= Hooks.on(`${MODULE_ID}.harvestProfilesChanged`, () => {
      if (!this.scanning) this.render({ force: true });
    });
  }

  async close(options={}) {
    if (this._ccProfileHook) Hooks.off(`${MODULE_ID}.harvestProfilesChanged`, this._ccProfileHook);
    this._ccProfileHook = null;
    return super.close(options);
  }

  #matches(profile) {
    if (this.filters.type !== "all" && profile.creatureType !== this.filters.type) return false;
    const search = String(this.filters.search || "").trim().toLowerCase();
    if (!search) return true;
    return [profile.name, profile.creatureTypeLabel, profile.subtype, profile.sourcePackLabel, ...(profile.analysis?.anatomy ?? [])]
      .join(" ").toLowerCase().includes(search);
  }

  #updateSelectedCount() {
    const node = this.element?.querySelector?.("[data-selected-pack-count]");
    if (node) node.textContent = String(this.selectedPacks.size);
  }

  #progress(data) {
    const root = this.element;
    if (!root) return;
    const label = root.querySelector("[data-scan-progress-label]");
    const bar = root.querySelector("[data-scan-progress-bar]");
    const wrap = root.querySelector("[data-scan-progress]");
    if (wrap) wrap.hidden = false;
    const total = Math.max(0, Number(data.total) || 0);
    const completed = Math.max(0, Number(data.completed) || 0);
    const percent = total ? Math.round((completed / total) * 100) : 0;
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = total
      ? `${completed}/${total} Actors · ${data.scanned ?? 0} profiles · ${data.failed ?? 0} failed`
      : "Reading Compendium indexes…";
  }

  async #scan(event) {
    event.preventDefault();
    if (this.scanning) return;
    if (!this.selectedPacks.size) return ui.notifications.warn("Choose at least one Actor Compendium to scan.");
    const button = event.currentTarget;
    button.disabled = true;
    this.scanning = true;
    try {
      const result = await HarvestProfileService.scanPacks([...this.selectedPacks], { onProgress: data => this.#progress(data) });
      const message = result.failed
        ? `Creature scan complete: ${result.scanned} profiles, ${result.failed} failures.`
        : `Creature scan complete: ${result.scanned} Harvest Profiles.`;
      result.failed ? ui.notifications.warn(message) : ui.notifications.info(message);
    } catch (error) {
      console.error(`${MODULE_ID} | Creature scan failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not scan those Compendiums.");
    } finally {
      this.scanning = false;
      button.disabled = false;
      this.render({ force: true });
    }
  }

  async #reanalyze(event, id) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const profile = await HarvestProfileService.reanalyze(id);
      ui.notifications.info(`Reanalyzed ${profile.name}. Pinpoint Overrides were preserved.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Profile reanalysis failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not reanalyze that Actor.");
      button.disabled = false;
    }
  }

  async #delete(event, id) {
    event.preventDefault();
    const profile = HarvestProfileService.get(id);
    if (!profile) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Harvest Profile" },
      content: `<p>Delete the Crafting Core Harvest Profile for <strong>${foundry.utils.escapeHTML(profile.name)}</strong>?</p><p>The source Actor is not changed.</p>`,
      yes: { label: "Delete Profile", icon: "fa-solid fa-trash" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    await HarvestProfileService.delete(id);
    ui.notifications.info(`Deleted Harvest Profile: ${profile.name}.`);
    this.render({ force: true });
  }
}
