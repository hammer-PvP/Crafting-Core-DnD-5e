import { MODULE_ID, SETTINGS, SOCKET_CHANNEL } from "../constants.mjs";

/**
 * GM-managed, per-Character boolean access to a suitable workstation.
 * Access is recorded in a GM-controlled World setting rather than an Actor
 * flag (which a player owning an Actor could otherwise modify).
 * Requests are World settings (not client-only dialogs), so a GM can review
 * them later in the same manager that grants/revokes access.
 * No recipe depends on a workstation name or mutable workshop document.
 */
export class WorkstationAccessService {
  static #queue = Promise.resolve();

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.WORKSTATION_REQUESTS, {
      name: "Crafting Core — Pending Workstation Requests", scope: "world", config: false,
      type: Object, default: {},
      onChange: () => Hooks.callAll(`${MODULE_ID}.workstationChanged`)
    });
    game.settings.register(MODULE_ID, SETTINGS.WORKSTATION_ACCESS, {
      name: "Crafting Core — Workstation Access by Character", scope: "world", config: false,
      type: Object, default: {},
      onChange: () => Hooks.callAll(`${MODULE_ID}.workstationChanged`)
    });
  }

  static get hasActiveGM() {
    return Boolean(game.users?.activeGM ?? game.users?.contents?.find(user => user.isGM && user.active));
  }

  static #assertGM() {
    if (!game.user?.isGM) throw new Error("Only GMs can manage workstation access.");
    const gm = game.users?.activeGM ?? game.users?.contents?.find(user => user.isGM && user.active);
    if (gm && gm.id !== game.user.id) throw new Error("Only the active GM can change workstation access.");
  }

  static hasAccess(actor) {
    if (!actor?.id || game.actors?.get?.(actor.id) !== actor) return false;
    const permissions = game.settings.get(MODULE_ID, SETTINGS.WORKSTATION_ACCESS);
    return Boolean(permissions?.[actor.id] === true);
  }

  static requests() {
    const raw = game.settings.get(MODULE_ID, SETTINGS.WORKSTATION_REQUESTS);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return foundry.utils.deepClone(raw);
  }

  static pendingList() {
    return Object.values(this.requests()).filter(row => {
      const actor = game.actors?.get(row?.actorId);
      return actor?.type === "character" && game.users?.get(row?.requesterId);
    }).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  static #serialized(action) {
    const next = this.#queue.catch(() => {}).then(action);
    this.#queue = next;
    return next;
  }

  static #key({actorId, scope, projectId="", checkpointId=""}) {
    return [actorId, scope, projectId, checkpointId].map(value => String(value || "")).join(":");
  }

  static async enqueue({ actor, requesterId, recipeId, recipeName, scope, projectId="", checkpointId="" }) {
    this.#assertGM();
    if (!actor || actor.type !== "character") throw new Error("A valid Character is required.");
    if (this.hasAccess(actor)) return { authorized: true };
    const key = this.#key({ actorId: actor.id, scope, projectId, checkpointId });
    return this.#serialized(async () => {
      if (this.hasAccess(actor)) return { authorized: true };
      const rows = this.requests();
      if (rows[key]) return { pending: true, requestId: key };
      rows[key] = {
        key, actorId: actor.id, requesterId: String(requesterId),
        recipeId: String(recipeId), recipeName: String(recipeName || "Crafting Project").slice(0, 160),
        scope: String(scope), projectId: String(projectId || ""), checkpointId: String(checkpointId || ""),
        createdAt: Date.now()
      };
      await game.settings.set(MODULE_ID, SETTINGS.WORKSTATION_REQUESTS, rows);
      ui.notifications?.info?.(`${actor.name} requested access to a suitable workstation. Review Crafting Core → Downtime Manager → Workstation Access.`);
      return { pending: true, requestId: key };
    });
  }

  static async setAccess(actors, allowed) {
    this.#assertGM();
    const unique = [...new Map((actors ?? []).filter(a => a?.type === "character" && game.actors.get(a.id) === a)
      .map(a => [a.id, a])).values()];
    if (!unique.length) return 0;
    const granted = Boolean(allowed);
    return this.#serialized(async () => {
      const old = game.settings.get(MODULE_ID, SETTINGS.WORKSTATION_ACCESS);
      const permissions = old && typeof old === "object" && !Array.isArray(old)
        ? foundry.utils.deepClone(old) : {};
      let updated = 0;
      for (const actor of unique) {
        if (Boolean(permissions[actor.id]) !== granted) updated++;
        if (granted) permissions[actor.id] = true;
        else delete permissions[actor.id];
      }
      if (updated) await game.settings.set(MODULE_ID, SETTINGS.WORKSTATION_ACCESS, permissions);
      if (granted) {
        const rows = this.requests();
        const ids = new Set(unique.map(actor => actor.id));
        const resolved = Object.values(rows).filter(row => ids.has(row.actorId));
        for (const row of resolved) delete rows[row.key];
        if (resolved.length) {
          await game.settings.set(MODULE_ID, SETTINGS.WORKSTATION_REQUESTS, rows);
          for (const row of resolved) this.#notifyRequester(row, true);
        }
      }
      Hooks.callAll(`${MODULE_ID}.workstationChanged`);
      return updated;
    });
  }

  static async deny(keys) {
    this.#assertGM();
    const set = new Set((keys ?? []).map(String));
    return this.#serialized(async () => {
      const rows = this.requests();
      const denied = Object.values(rows).filter(row => set.has(row.key));
      for (const row of denied) delete rows[row.key];
      if (denied.length) await game.settings.set(MODULE_ID, SETTINGS.WORKSTATION_REQUESTS, rows);
      for (const row of denied) this.#notifyRequester(row, false);
      return denied.length;
    });
  }

  static #notifyRequester(row, allowed) {
    // Informational only: authorization is always revalidated server-side.
    game.socket?.emit?.(SOCKET_CHANNEL, {
      action: "craft-station-access-notice", requesterId: row.requesterId,
      actorId: row.actorId, allowed: Boolean(allowed)
    });
  }
}
