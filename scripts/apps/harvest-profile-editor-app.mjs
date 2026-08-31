import { MODULE_ID } from "../constants.mjs";
import { HarvestProfileService } from "../services/harvest-profile-service.mjs";
import { PopoverSelect } from "../ui/popover-select.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HarvestProfileEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-harvest-profile-editor",
    classes: ["crafting-core", "crafting-core-profile-editor-app", "standard-form"],
    tag: "form",
    position: { width: 900, height: 740 },
    window: { title: "Crafting Core — Harvest Profile", resizable: true }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/harvest-profile-editor.hbs` }
  };

  constructor(profileId, options={}) {
    super(options);
    this.profileId = String(profileId);
    this.draft = HarvestProfileService.get(this.profileId);
  }

  async _prepareContext() {
    if (!this.draft) throw new Error("Harvest Profile could not be resolved.");
    const hydrated = await HarvestProfileService.hydrateProfile(this.draft);
    const autoOptions = await HarvestProfileService.materialOptions({ nature: hydrated.creatureType });
    const allOptions = await HarvestProfileService.materialOptions({ includeAll: true });
    const decoratePinpoint = (options, selected) => [
      { value: "", label: "— Empty —", selected: !selected, chance: 0, quantity: "1", rarity: "common" },
      ...options.map(option => ({ ...option, selected: option.value === selected }))
    ];

    return {
      profile: {
        ...hydrated,
        slots: hydrated.slots.map(slot => {
          const selected = new Set(slot.materialIds ?? []);
          const options = autoOptions
            .filter(option => (slot.rarities ?? []).includes(option.rarity))
            .map(option => ({ ...option, selected: selected.has(option.value) }));
          const selectedRows = options.filter(option => option.selected);
          return {
            ...slot,
            options,
            selectedCount: selectedRows.length,
            selectionSummary: selectedRows.length
              ? `${selectedRows.length} selected · ${selectedRows.slice(0, 3).map(row => row.name).join(", ")}${selectedRows.length > 3 ? "…" : ""}`
              : "No material selected"
          };
        }),
        pinpointOverrides: hydrated.pinpointOverrides.map(row => ({ ...row, options: decoratePinpoint(allOptions, row.materialId) }))
      },
      anatomy: hydrated.analysis.anatomy.map(tag => ({ tag, label: HarvestProfileService.title(tag) })),
      anatomyText: hydrated.analysis.anatomy.join(", "),
      reasons: hydrated.analysis.reasons,
      harvestSignals: (hydrated.analysis.harvestSignals ?? []).map(tag => ({ tag, label: HarvestProfileService.title(tag) })),
      essenceReasons: hydrated.analysis.essenceReasons ?? [],
      essenceEnabled: hydrated.essenceSlot?.enabled === true,
      essenceAffinities: hydrated.essenceSlot?.affinities ?? [],
      essenceHasSpecific: Boolean(hydrated.essenceSlot?.affinities?.length),
      analyzedAt: hydrated.analyzedAt ? new Date(hydrated.analyzedAt).toLocaleString() : "Unknown"
    };
  }

  _onRender() {
    const root = this.element;
    PopoverSelect.wire(root);
    root.querySelector('[data-action="save-profile"]')?.addEventListener("click", event => this.#save(event));
    root.querySelector('[data-action="reanalyze-profile"]')?.addEventListener("click", event => this.#reanalyze(event));
    root.querySelector('[data-action="add-pinpoint"]')?.addEventListener("click", event => this.#addPinpoint(event));
    root.querySelectorAll('[data-action="remove-pinpoint"]').forEach(button => button.addEventListener("click", event => this.#removePinpoint(event, Number(button.dataset.index))));
    root.querySelectorAll('[data-pool-material]').forEach(input => input.addEventListener("change", event => this.#poolChanged(event)));
    root.querySelectorAll("select[data-material-select]").forEach(select => select.addEventListener("change", event => this.#materialChanged(event)));
  }

  #syncDraft() {
    const root = this.element;
    if (!root || !this.draft) return;
    const anatomyText = root.querySelector('[name="analysis.anatomy"]')?.value ?? "";
    this.draft.analysis ??= {};
    this.draft.analysis.anatomy = [...new Set(String(anatomyText).split(",").map(value => value.trim().toLowerCase()).filter(Boolean))].sort();

    root.querySelectorAll("[data-slot-index]").forEach(row => {
      const index = Number(row.dataset.slotIndex);
      const slot = this.draft.slots[index];
      if (!slot) return;
      slot.materialIds = [...row.querySelectorAll('[data-pool-material]:checked')].map(input => String(input.value)).filter(Boolean);
      slot.materialId = slot.materialIds[0] ?? ""; // compatibility alias for older integrations
      slot.chance = Math.clamp(Number(row.querySelector('[name="slot.chance"]')?.value ?? 0) || 0, 0, 100);
      slot.quantityOverrides ??= {};
      for (const materialId of Object.keys(slot.quantityOverrides)) {
        if (!slot.materialIds.includes(materialId)) delete slot.quantityOverrides[materialId];
      }
    });

    root.querySelectorAll("[data-pinpoint-index]").forEach(row => {
      const index = Number(row.dataset.pinpointIndex);
      const pinpoint = this.draft.pinpointOverrides[index];
      if (!pinpoint) return;
      const select = row.querySelector("select[data-material-select]");
      const option = select?.selectedOptions?.[0];
      pinpoint.materialId = select?.value ?? "";
      pinpoint.rarity = option?.dataset?.rarity ?? pinpoint.rarity;
      pinpoint.chance = Math.clamp(Number(row.querySelector('[name="pinpoint.chance"]')?.value ?? 100) || 0, 0, 100);
      pinpoint.quantity = String(row.querySelector('[name="pinpoint.quantity"]')?.value || "1").trim() || "1";
    });
    this.draft.pinpointOverrides = this.draft.pinpointOverrides.filter(row => row.materialId);
  }

  #poolChanged(event) {
    const row = event.currentTarget.closest("[data-slot-index]");
    if (!row) return;
    const checked = [...row.querySelectorAll('[data-pool-material]:checked')];
    const summary = row.querySelector('[data-pool-summary]');
    if (summary) {
      const names = checked.slice(0, 3).map(input => input.dataset.materialName || input.value);
      summary.textContent = checked.length
        ? `${checked.length} selected · ${names.join(", ")}${checked.length > 3 ? "…" : ""}`
        : "No material selected";
    }
    const count = row.querySelector('[data-pool-count]');
    if (count) count.textContent = String(checked.length);
  }

  #materialChanged(event) {
    const select = event.currentTarget;
    const row = select.closest("[data-pinpoint-index]");
    if (!row) return;
    const option = select.selectedOptions?.[0];
    const chance = row.querySelector('[name="pinpoint.chance"]');
    const quantity = row.querySelector('[name="pinpoint.quantity"]');
    if (chance && option?.dataset?.chance !== undefined) chance.value = option.dataset.chance;
    if (quantity && option?.dataset?.quantity) quantity.value = option.dataset.quantity;
    const badge = row.querySelector("[data-row-rarity]");
    if (badge) {
      badge.textContent = option?.dataset?.rarityLabel || "Empty";
      badge.className = `cc-rarity ${option?.dataset?.rarity ?? "common"}`;
      badge.dataset.rowRarity = "";
    }
  }

  async #save(event) {
    event.preventDefault();
    const button = event.currentTarget;
    button.disabled = true;
    try {
      this.#syncDraft();
      this.draft.analyzedAt = this.draft.analyzedAt || Date.now();
      this.draft = await HarvestProfileService.save(this.draft);
      ui.notifications.info(`Saved Harvest Profile: ${this.draft.name}.`);
      await this.close();
    } catch (error) {
      console.error(`${MODULE_ID} | Harvest Profile save failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not save that Harvest Profile.");
      button.disabled = false;
    }
  }

  async #reanalyze(event) {
    event.preventDefault();
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Reanalyze Creature" },
      content: "<p>Rebuild the four automatic rarity pools and the Essence slot from the current source Actor data?</p><p>Pinpoint Overrides are preserved. Unsaved pool edits are replaced.</p>",
      yes: { label: "Reanalyze", icon: "fa-solid fa-wand-magic-sparkles" },
      no: { label: "Cancel" }
    });
    if (!confirmed) return;
    try {
      this.draft = await HarvestProfileService.reanalyze(this.profileId);
      ui.notifications.info(`Reanalyzed ${this.draft.name}.`);
      this.render({ force: true });
    } catch (error) {
      console.error(`${MODULE_ID} | Harvest Profile reanalysis failed.`, error);
      ui.notifications.error(error.message ?? "Crafting Core could not reanalyze the source Actor.");
    }
  }

  async #addPinpoint(event) {
    event.preventDefault();
    this.#syncDraft();
    const options = await HarvestProfileService.materialOptions({ includeAll: true });
    const first = options[0];
    if (!first) return ui.notifications.warn("Sync the Crafting Core Materials Catalog first.");
    this.draft.pinpointOverrides.push({
      id: foundry.utils.randomID(12),
      materialId: first.value,
      rarity: first.rarity,
      chance: 100,
      quantity: first.quantity || "1",
      generated: false
    });
    this.render({ force: true });
  }

  #removePinpoint(event, index) {
    event.preventDefault();
    this.#syncDraft();
    this.draft.pinpointOverrides.splice(index, 1);
    this.render({ force: true });
  }
}
