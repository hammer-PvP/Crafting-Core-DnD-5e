import { MODULE_ID } from "../constants.mjs";
import { HarvestProfileService } from "./harvest-profile-service.mjs";
import { MaterialGenerationService } from "./material-generation-service.mjs";
import { ItemPilesBridge } from "./item-piles-bridge.mjs";

/** GM-only, explicit Token HUD harvesting. Never runs automatically on death. */
export class TokenHarvestService {
  static HARVEST_FLAG = "harvested";
  static active = new Set();

  static installHooks() {
    Hooks.on("renderTokenHUD", (hud, html) => this.#injectHudControl(hud, html));
  }

  static isDead(actor) {
    if (!actor) return false;
    try {
      if (actor.statuses?.has?.("dead")) return true;
    } catch (_) {}
    const hp = Number(foundry.utils.getProperty(actor, "system.attributes.hp.value"));
    return Number.isFinite(hp) && hp <= 0;
  }

  static isHarvested(tokenDocument) {
    return Boolean(tokenDocument?.getFlag?.(MODULE_ID, this.HARVEST_FLAG)
      ?? tokenDocument?.flags?.[MODULE_ID]?.[this.HARVEST_FLAG]);
  }

  static profileForToken(token) {
    const actor = token?.actor ?? token?.document?.actor ?? null;
    return actor ? HarvestProfileService.getForActor(actor) : null;
  }

  static eligibility(token) {
    const tokenDocument = token?.document ?? token;
    const actor = token?.actor ?? tokenDocument?.actor ?? null;
    if (!game.user?.isGM) return { eligible: false, reason: "not-gm", token, tokenDocument, actor, profile: null };
    if (!ItemPilesBridge.isAvailable()) return { eligible: false, reason: "item-piles", token, tokenDocument, actor, profile: null };
    if (!actor || !tokenDocument) return { eligible: false, reason: "no-actor", token, tokenDocument, actor, profile: null };
    if (!this.isDead(actor)) return { eligible: false, reason: "alive", token, tokenDocument, actor, profile: null };
    if (this.isHarvested(tokenDocument)) return { eligible: false, reason: "harvested", token, tokenDocument, actor, profile: null };
    const profile = HarvestProfileService.getForActor(actor);
    if (!profile) return { eligible: false, reason: "no-profile", token, tokenDocument, actor, profile: null };
    return { eligible: true, reason: "", token, tokenDocument, actor, profile };
  }

  static targetsFromHudToken(hudToken) {
    const controlled = canvas?.tokens?.controlled ?? [];
    if (controlled.length > 1 && controlled.some(token => token.id === hudToken?.id)) return controlled;
    return hudToken ? [hudToken] : [];
  }

  static async harvestTokens(tokens=[]) {
    if (!game.user?.isGM) throw new Error("Only a GM can generate Token Harvest loot.");
    if (!ItemPilesBridge.isAvailable()) throw new Error("Item Piles must be active to harvest Tokens.");

    const summary = { generated: 0, empty: 0, alive: 0, harvested: 0, noProfile: 0, failed: 0, skipped: 0 };
    const unique = [...new Map((tokens ?? []).filter(Boolean).map(token => [token.id ?? token.document?.id, token])).values()];

    for (const token of unique) {
      const tokenId = String(token?.id ?? token?.document?.id ?? "");
      if (!tokenId || this.active.has(tokenId)) { summary.skipped++; continue; }
      const check = this.eligibility(token);
      if (!check.eligible) {
        if (check.reason === "alive") summary.alive++;
        else if (check.reason === "harvested") summary.harvested++;
        else if (check.reason === "no-profile") summary.noProfile++;
        else summary.skipped++;
        continue;
      }

      this.active.add(tokenId);
      try {
        const result = await MaterialGenerationService.generate({ source: "profile", profile: check.profile, sources: 1 });
        if (!result.items?.length) {
          await this.#markHarvested(check.tokenDocument, check.profile, result, { empty: true });
          summary.empty++;
          continue;
        }

        const pile = await ItemPilesBridge.turnTokenIntoLootPile(check.tokenDocument, result);
        if (!pile.converted) {
          await this.#markHarvested(check.tokenDocument, check.profile, result, { empty: true });
          summary.empty++;
          continue;
        }
        const markTarget = pile.tokenDocument ?? check.tokenDocument;
        await this.#markHarvested(markTarget, check.profile, result, { empty: false });
        summary.generated++;
      } catch (error) {
        summary.failed++;
        console.error(`${MODULE_ID} | Token Harvest failed for ${check.actor?.name ?? tokenId}.`, error);
      } finally {
        this.active.delete(tokenId);
      }
    }

    this.#notify(summary, unique.length);
    return summary;
  }

  static async #markHarvested(tokenDocument, profile, result, { empty=false }={}) {
    const current = canvas?.tokens?.get?.(tokenDocument.id)?.document ?? tokenDocument;
    const items = (result?.items ?? []).map(row => ({ materialId: String(row.materialId), quantity: Math.max(1, Number(row.quantity) || 1) }));
    await current.setFlag(MODULE_ID, this.HARVEST_FLAG, {
      at: Date.now(),
      profileId: String(profile?.id ?? ""),
      sourceUuid: String(profile?.sourceUuid ?? ""),
      empty: Boolean(empty),
      items
    });
  }

  static #notify(summary, total) {
    const bits = [];
    if (summary.generated) bits.push(`${summary.generated} loot pile${summary.generated === 1 ? "" : "s"}`);
    if (summary.empty) bits.push(`${summary.empty} empty harvest${summary.empty === 1 ? "" : "s"}`);
    if (summary.alive) bits.push(`${summary.alive} alive`);
    if (summary.harvested) bits.push(`${summary.harvested} already harvested`);
    if (summary.noProfile) bits.push(`${summary.noProfile} without profile`);
    if (summary.failed) bits.push(`${summary.failed} failed`);
    if (summary.skipped) bits.push(`${summary.skipped} skipped`);
    const message = bits.length ? `Harvest: ${bits.join(", ")}.` : `Harvest: no eligible Tokens among ${total}.`;
    if (summary.failed) ui.notifications.warn(message);
    else ui.notifications.info(message);
  }

  static #resolveHudToken(hud) {
    const object = hud?.object ?? hud?.token ?? hud?.document ?? null;
    if (object?.document?.documentName === "Token") return object;
    if (object?.documentName === "Token") return canvas?.tokens?.get?.(object.id) ?? object.object ?? null;
    const id = object?.id ?? hud?.options?.id ?? null;
    return id ? canvas?.tokens?.get?.(id) ?? null : null;
  }

  static #injectHudControl(hud, html) {
    if (!game.user?.isGM || !ItemPilesBridge.isAvailable()) return;
    const hudToken = this.#resolveHudToken(hud);
    if (!hudToken) return;
    const targets = this.targetsFromHudToken(hudToken);
    if (!targets.some(token => this.eligibility(token).eligible)) return;

    const root = html instanceof HTMLElement ? html : html?.[0] ?? hud?.element;
    if (!root) return;
    root.querySelectorAll(".crafting-core-harvest-control").forEach(node => node.remove());
    const column = root.querySelector(".col.right") ?? root.querySelector(".right") ?? root;

    const control = document.createElement("div");
    control.className = "control-icon crafting-core-harvest-control";
    control.dataset.action = "crafting-core-harvest";
    control.dataset.tooltip = targets.length > 1 ? "Generate Harvest for Selected" : "Generate Harvest";
    control.setAttribute("role", "button");
    control.setAttribute("tabindex", "0");
    control.innerHTML = '<i class="fa-solid fa-bag-shopping" inert></i>';

    const activate = async event => {
      event.preventDefault();
      event.stopPropagation();
      control.classList.add("cc-disabled");
      try {
        await this.harvestTokens(this.targetsFromHudToken(hudToken));
      } finally {
        hud?.render?.(true);
      }
    };
    control.addEventListener("click", activate);
    control.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") activate(event);
    });
    column.append(control);
  }
}
