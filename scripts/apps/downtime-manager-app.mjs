import { MODULE_ID } from "../constants.mjs";
import { DowntimeService } from "../services/downtime-service.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM-only ledger manager; checkbox selection deliberately updates in place. */
export class DowntimeManagerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "crafting-core-downtime-manager",
    classes: ["crafting-core", "cc-downtime-manager", "standard-form"],
    tag: "section", position: { width: 780, height: 660 },
    window: { title: "Crafting Core — Downtime Manager", resizable: true }
  };
  static PARTS = { main: { template: `modules/${MODULE_ID}/templates/downtime-manager.hbs` } };

  selected = new Set();
  filters = null;
  #busy = false;
  #scrollTop = 0;

  async _prepareContext() {
    if (!game.user?.isGM) throw new Error("Only GMs may open Downtime Manager.");
    this.filters ??= DowntimeService.filters();
    const folderOptions = game.folders.contents.filter(folder => folder.type === "Actor")
      .map(folder => ({ id: folder.id, name: folder.name, selected: this.filters.folders.includes(folder.id) }))
      .sort((a,b) => a.name.localeCompare(b.name));
    const groupOptions = DowntimeService.groups().map(g => ({ id: g.id, name: g.name, selected: this.filters.groups.includes(g.id) }));
    const characters = DowntimeService.characters(this.filters);
    // Don't silently select newly visible Actors after filtering.
    const visibleIds = new Set(characters.map(a => a.id));
    return {
      active: DowntimeService.active,
      folders: folderOptions,
      groups: groupOptions,
      hasFilters: folderOptions.length > 0 || groupOptions.length > 0,
      characters: characters.map(actor => ({
        id: actor.id, name: actor.name, img: actor.img,
        folder: actor.folder?.name || "Unfiled", balance: DowntimeService.available(actor),
        selected: this.selected.has(actor.id)
      })),
      count: characters.length,
      selectedCount: [...this.selected].filter(id => visibleIds.has(id)).length
    };
  }

  _onRender() {
    const root = this.element;
    const list = root.querySelector("[data-cc-downtime-list]");
    if (list) list.scrollTop = this.#scrollTop;
    list?.addEventListener("scroll", () => { this.#scrollTop = list.scrollTop; }, { passive: true });
    const refreshSelected = () => {
      const count = root.querySelector("[data-cc-selected-count]");
      const total = [...root.querySelectorAll("input[data-cc-character]:checked")].length;
      if (count) count.textContent = String(total);
      const grant = root.querySelector('[data-action="grant"]');
      const revoke = root.querySelector('[data-action="revoke"]');
      if (grant) grant.disabled = this.#busy || total === 0;
      if (revoke) revoke.disabled = this.#busy || total === 0;
    };
    root.querySelectorAll("input[data-cc-character]").forEach(box => box.addEventListener("change", () => {
      if (box.checked) this.selected.add(box.value);
      else this.selected.delete(box.value);
      // Intentionally do not re-render: no scroll reset and no lost checkbox state.
      refreshSelected();
    }));
    const visible = () => [...root.querySelectorAll("input[data-cc-character]")];
    root.querySelector('[data-action="select-all"]')?.addEventListener("click", () => {
      visible().forEach(box => { box.checked = true; this.selected.add(box.value); }); refreshSelected();
    });
    root.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
      visible().forEach(box => { box.checked = false; this.selected.delete(box.value); }); refreshSelected();
    });
    root.querySelectorAll("input[data-cc-folder],input[data-cc-group]").forEach(box => box.addEventListener("change", async () => {
      const filters = {
        folders: [...root.querySelectorAll("input[data-cc-folder]:checked")].map(i => i.value),
        groups: [...root.querySelectorAll("input[data-cc-group]:checked")].map(i => i.value)
      };
      try {
        this.filters = await DowntimeService.saveFilters(filters);
        this.#scrollTop = 0; // explicit filter changes, not character selections
        this.render({ force: true });
      } catch (error) { ui.notifications.error(error.message); box.checked = !box.checked; }
    }));
    root.querySelector('[data-action="toggle-downtime"]')?.addEventListener("click", async button => {
      if (this.#busy) return;
      this.#busy = true;
      try { await DowntimeService.setActive(!DowntimeService.active); this.render({ force: true }); }
      catch (error) { ui.notifications.error(error.message); }
      finally { this.#busy = false; }
    });
    root.querySelector('[data-action="grant"]')?.addEventListener("click", () => void this.#adjust("grant"));
    root.querySelector('[data-action="revoke"]')?.addEventListener("click", () => void this.#adjust("revoke"));
  }

  async #adjust(type) {
    if (this.#busy) return;
    const root = this.element;
    const selected = [...root.querySelectorAll("input[data-cc-character]:checked")].map(input => game.actors.get(input.value)).filter(Boolean);
    if (!selected.length) return ui.notifications.warn("Select one or more Characters.");
    const amount = Number(root.querySelector('[name="grantHours"]')?.value ?? 0);
    if (type === "grant" && (!Number.isSafeInteger(amount) || amount < 1)) return ui.notifications.warn("Enter a positive whole number of hours.");
    if (type === "revoke") {
      const hours = selected.reduce((total, actor) => total + DowntimeService.available(actor), 0);
      const names = selected.slice(0, 5).map(actor => foundry.utils.escapeHTML(actor.name)).join(", ");
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Crafting Core — Revoke Unused Hours" },
        content: `<p>Revoke <strong>${hours} unused hours</strong> from <strong>${selected.length} Characters</strong>?</p><p>${names}${selected.length > 5 ? ", …" : ""}</p><p>This will not undo previously completed work, crafting progress, or spent hours.</p>`,
        yes: { label: "Revoke Unused Hours", icon: "fa-solid fa-rotate-left" }, no: { label: "Cancel" }, rejectClose: false
      });
      if (!confirmed) return;
    }
    this.#busy = true;
    this.#scrollTop = root.querySelector("[data-cc-downtime-list]")?.scrollTop ?? 0;
    let updated = 0; const errors = [];
    try {
      for (const actor of selected) {
        try {
          await DowntimeService.adjust(actor, { type, hours: amount,
            reason: type === "grant" ? "GM Downtime grant" : "GM revoked unused downtime" });
          updated++;
        } catch (error) { errors.push(`${actor.name}: ${error.message}`); }
      }
      if (updated) ui.notifications.info(type === "grant"
        ? `Added ${amount} hours to each of ${updated} Characters.`
        : `Revoked remaining Downtime hours from ${updated} Characters.`);
      if (errors.length) ui.notifications.error(`Downtime: ${errors.join("; ")}`);
      await this.render({ force: true });
    } finally { this.#busy = false; }
  }
}
