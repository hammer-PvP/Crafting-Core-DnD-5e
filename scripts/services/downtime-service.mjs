import { FLAGS, MODULE_ID, SETTINGS } from "../constants.mjs";

/**
 * Optional campaign-wide Downtime gate. Balances live on Characters and are never
 * implicitly credited by rest hooks. The ordinary rest-driven Project engine stays
 * untouched until the GM explicitly enables Downtime.
 */
export class DowntimeService {
  static MAX_HOURS = 1000000;
  static #actorLocks = new Map();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.DOWNTIME_ACTIVE, {
      name: "Crafting Core — Downtime Active", scope: "world", config: false, type: Boolean, default: false,
      onChange: () => Hooks.callAll(`${MODULE_ID}.downtimeChanged`)
    });
    game.settings.register(MODULE_ID, SETTINGS.DOWNTIME_FILTERS, {
      name: "Crafting Core — Downtime Character Filters", scope: "world", config: false,
      type: Object, default: { folders: [], groups: [] }
    });
  }

  static get active() { return Boolean(game.settings.get(MODULE_ID, SETTINGS.DOWNTIME_ACTIVE)); }

  static state(actor) {
    const raw = actor?.getFlag?.(MODULE_ID, FLAGS.DOWNTIME) ?? {};
    const hours = Number(raw.balance);
    return {
      balance: Number.isSafeInteger(hours) && hours >= 0 ? hours : 0,
      granted: Math.max(0, Number(raw.granted) || 0),
      spent: Math.max(0, Number(raw.spent) || 0),
      revoked: Math.max(0, Number(raw.revoked) || 0),
      ledger: Array.isArray(raw.ledger) ? raw.ledger : []
    };
  }

  static available(actor) { return this.state(actor).balance; }
  static canWork(actor) { return this.active && this.available(actor) >= 1; }
  static requireHour(actor) {
    if (this.active && !this.canWork(actor)) throw new Error("No Downtime hours remain for this Character. Ask the GM to grant more hours or wait until Downtime ends.");
  }

  static #requireGM() {
    if (!game.user?.isGM) throw new Error("Only a GM can administer Downtime.");
    const activeGM = game.users?.activeGM ?? game.users?.contents?.find(user => user.isGM && user.active);
    if (activeGM && activeGM.id !== game.user.id) throw new Error("Only the active GM can edit Downtime while another GM is active.");
  }

  static async setActive(active) {
    this.#requireGM();
    await game.settings.set(MODULE_ID, SETTINGS.DOWNTIME_ACTIVE, Boolean(active));
    Hooks.callAll(`${MODULE_ID}.downtimeChanged`);
  }

  static filters() {
    const value = game.settings.get(MODULE_ID, SETTINGS.DOWNTIME_FILTERS) ?? {};
    return {
      folders: Array.isArray(value.folders) ? value.folders.map(String) : [],
      groups: Array.isArray(value.groups) ? value.groups.map(String) : []
    };
  }

  static async saveFilters(filters) {
    this.#requireGM();
    const normalized = {
      folders: [...new Set((filters?.folders ?? []).map(String))],
      groups: [...new Set((filters?.groups ?? []).map(String))]
    };
    await game.settings.set(MODULE_ID, SETTINGS.DOWNTIME_FILTERS, normalized);
    return normalized;
  }

  // D&D5e group Actors generally store member references in system.members.
  // Accept the supported common shapes without relying on translated group names.
  static groups() {
    return game.actors.contents.filter(a => a.type === "group" || a.type === "party").map(group => {
      const members = group.system?.members ?? [];
      const ids = new Set();
      const memberRows = Array.isArray(members) ? members : members instanceof Map ? [...members.values()] : Object.values(members);
      for (const row of memberRows) {
        const val = typeof row === "string" ? row : String(row?.uuid ?? row?.actor?.uuid ?? row?.actorId ?? row?.id ?? "");
        const id = val.split(".").at(-1);
        if (id) ids.add(id);
      }
      return { id: group.id, name: group.name, members: ids };
    });
  }

  static characters(filters=this.filters()) {
    const folderIds = new Set(filters.folders ?? []);
    const groupIds = new Set(filters.groups ?? []);
    const groups = this.groups().filter(group => groupIds.has(group.id));
    return game.actors.contents.filter(actor => {
      if (actor.type !== "character") return false;
      const folderMatches = folderIds.size > 0 && folderIds.has(actor.folder?.id ?? "");
      const groupMatches = groupIds.size > 0 && groups.some(group => group.members.has(actor.id));
      return (folderIds.size === 0 && groupIds.size === 0) || folderMatches || groupMatches;
    }).sort((a, b) => a.name.localeCompare(b.name, game.i18n?.lang ?? "en"));
  }

  static async adjust(actor, options={}) {
    // Serialize Actor balance writes, including simultaneous grants and crafting
    // transactions. A duplicate transaction ID is safe even when balance is now 0.
    const actorId = String(actor?.id ?? "");
    const previous = this.#actorLocks.get(actorId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(() => this.#adjustUnlocked(actor, options));
    this.#actorLocks.set(actorId, current);
    try { return await current; }
    finally { if (this.#actorLocks.get(actorId) === current) this.#actorLocks.delete(actorId); }
  }

  static async #adjustUnlocked(actor, { type, hours=0, reason="", transactionId=null }={}) {
    this.#requireGM();
    if (!actor || actor.type !== "character" || !game.actors.get(actor.id)) throw new Error("A valid World Character is required.");
    const current = this.state(actor);
    const id = String(transactionId || foundry.utils.randomID(20));
    if (current.ledger.some(row => row.id === id)) return this.state(actor); // repeated socket/request
    const amount = type === "revoke" ? current.balance : Number(hours);
    if (!Number.isSafeInteger(amount) || amount < 0 || (type !== "revoke" && amount < 1)) throw new Error("Enter a positive whole number of hours.");
    if (type === "grant" && amount + current.balance > this.MAX_HOURS) throw new Error("Downtime balance exceeds the safety limit.");
    if (type === "spend" && current.balance < amount) throw new Error("Insufficient Downtime hours.");
    if (!["grant", "revoke", "spend"].includes(type)) throw new Error("Unknown Downtime transaction.");
    if (type === "revoke" && amount === 0) return current;
    const next = {
      ...current,
      balance: type === "grant" ? current.balance + amount : current.balance - amount,
      granted: current.granted + (type === "grant" ? amount : 0),
      spent: current.spent + (type === "spend" ? amount : 0),
      revoked: current.revoked + (type === "revoke" ? amount : 0),
      ledger: [...current.ledger, {
        id, type, hours: amount, reason: String(reason ?? "").slice(0, 160),
        at: Date.now(), userId: game.user.id
      }]
    };
    await actor.setFlag(MODULE_ID, FLAGS.DOWNTIME, next);
    Hooks.callAll(`${MODULE_ID}.downtimeChanged`, actor);
    return next;
  }

  static async spendHour(actor, { requestId, recipeId }={}) {
    if (!this.active) return false;
    if (!requestId) throw new Error("A unique crafting request ID is required for Downtime spending.");
    const transactionId = `craft:${String(requestId)}`;
    if (this.state(actor).ledger.some(row => row.id === transactionId)) return true;
    // Re-check sufficient balance within adjust's per-Actor critical section.
    await this.adjust(actor, { type: "spend", hours: 1, transactionId, reason: `Crafting project: ${recipeId ?? ""}` });
    return true;
  }
}
