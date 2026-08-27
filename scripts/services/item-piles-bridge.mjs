import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { GearNormalizationService } from "./gear-normalization-service.mjs";

/**
 * Narrow optional bridge to Item Piles. Crafting Core never requires Item Piles
 * to load; Token Harvest controls are simply unavailable while its public API
 * is missing.
 *
 * Token Harvest is transactional: the complete corpse loot payload is resolved
 * first, a new populated Item Pile is created at the corpse position, and only
 * after that succeeds is the original Token removed. This deliberately avoids
 * an empty intermediate pile, which can be auto-deleted by Item Piles.
 */
export class ItemPilesBridge {
  static MODULE_ID = "item-piles";

  static isAvailable() {
    return game.modules?.get?.(this.MODULE_ID)?.active === true
      && Boolean(game.itempiles?.API);
  }

  static api() {
    if (!this.isAvailable()) throw new Error("Item Piles is not active. Enable Item Piles before generating Token Harvest loot.");
    const api = game.itempiles.API;
    if (typeof api.createItemPile !== "function") throw new Error("The active Item Piles version does not expose createItemPile().");
    if (typeof api.getActorItems !== "function") throw new Error("The active Item Piles version does not expose getActorItems().");
    return api;
  }

  static async buildItemPayload(result) {
    const rows = Array.isArray(result?.items) ? result.items : [];
    if (!rows.length) return [];
    const documents = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const payload = [];
    const missing = [];
    for (const row of rows) {
      const source = documents.get(String(row.materialId));
      if (!source) {
        console.warn(`${MODULE_ID} | Token Harvest material ${row.materialId} is missing from Crafting Core — Materials.`);
        missing.push(String(row.materialId));
        continue;
      }
      const data = source.toObject();
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      data.system ??= {};
      // Planning payload keeps quantity separate so Gear Normalization and
      // Harvest use one common shape. Before createItemPile(), Crafting Core
      // materializes that quantity into the Item data itself because the
      // current Item Piles create API unwraps { item, quantity } entries.
      data.system.quantity = 1;
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        generatedLoot: true,
        generatedAt: Date.now(),
        generationSource: "token-harvest"
      };
      payload.push({ item: data, quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)) });
    }
    if (missing.length) {
      throw new Error(`Crafting Core material Items are missing (${missing.join(", ")}). Run Materials → Create / Sync Materials and retry the corpse.`);
    }
    return payload;
  }

  static async turnTokenIntoLootPile(tokenDocument, result) {
    const api = this.api();
    if (!tokenDocument) throw new Error("A Token is required to create an Item Pile.");
    if (!tokenDocument.actor) throw new Error("The corpse Token no longer has a valid Actor.");

    // Ask Item Piles what this Actor can actually transfer BEFORE touching the
    // canvas. Features filtered by Item Piles (Grab, Amphibious, Brute, etc.)
    // therefore never enter the final corpse payload or normalization pass.
    const transferable = await api.getActorItems(tokenDocument);
    const sourceItems = Array.isArray(transferable) ? transferable : [];

    const gearPlan = await GearNormalizationService.buildPlan(tokenDocument.actor, { sourceItems });
    const gearPayload = GearNormalizationService.outputPayload(gearPlan);
    const harvestPayload = await this.buildItemPayload(result);
    const plannedPayload = [...gearPayload, ...harvestPayload];

    // Empty harvests are still marked by TokenHarvestService, but the corpse is
    // left untouched. We never create an empty pile just to delete the Token.
    if (!plannedPayload.length) {
      return { converted: false, added: [], empty: true, gearPlan, normalized: this.#normalizationSummary(gearPlan) };
    }

    // Item Piles createItemPile() does NOT use the same payload contract as
    // addItems(). Current builds unwrap { item, quantity } and then create the
    // embedded Item from `item`, which drops the wrapper quantity. Build raw
    // Item data up front, with the real stack quantity embedded at the public
    // Item Piles quantity attribute and a temporary transaction marker used to
    // verify that every distinct payload row actually materialized.
    const transactionId = this.#transactionId();
    const createPayload = this.#createItemPayload(plannedPayload, api, transactionId);
    const expectedKeys = createPayload.map(data => String(foundry.utils.getProperty(data, `flags.${MODULE_ID}.corpsePayloadKey`) ?? ""));

    const sourceSnapshot = this.#tokenSnapshot(tokenDocument);
    const finalDeleteWhenEmpty = Boolean(api?.PILE_DEFAULTS?.deleteWhenEmpty ?? true);
    const created = await api.createItemPile({
      position: { x: Number(tokenDocument.x) || 0, y: Number(tokenDocument.y) || 0 },
      sceneId: String(tokenDocument.parent?.id ?? canvas?.scene?.id ?? game.user?.viewedScene ?? ""),
      tokenOverrides: sourceSnapshot.tokenOverrides,
      actorOverrides: sourceSnapshot.actorOverrides,
      itemPileFlags: {
        // Synthetic Item Piles create their Items asynchronously after the
        // Token exists. Keep the pile alive during that window and prevent the
        // single-item display rules from replacing the corpse artwork.
        deleteWhenEmpty: false,
        displayOne: false,
        showItemName: false,
        overrideSingleItemScale: false
      },
      items: createPayload
    });

    // Item Piles versions in the wild have returned more than one shape here:
    // a UUID string, a TokenDocument, or an object such as
    // { tokenUuid, actorUuid }. Normalize that public-API result before the
    // transaction commits so Crafting Core never mistakes a successfully
    // created pile for a failed creation.
    let createdPile = await this.#resolveCreatedPile(created, { sceneId: tokenDocument.parent?.id });
    let pileDocument = createdPile.tokenDocument;
    if (!pileDocument?.actor) {
      await this.#rollbackCreatedPile(createdPile);
      throw new Error(`Item Piles created a corpse pile for ${tokenDocument.name ?? tokenDocument.id}, but Crafting Core could not resolve its Token/Actor.`);
    }

    // Item Piles currently schedules synthetic pile Item creation roughly
    // 250ms after createItemPile() returns. Do not commit the corpse deletion
    // until every expected row exists on the new pile. This catches partial or
    // collapsed payloads instead of silently destroying the original corpse.
    const verified = await this.#awaitPayloadMaterialization(createdPile, expectedKeys);
    if (!verified.ok) {
      await this.#rollbackCreatedPile(createdPile);
      throw new Error(`Item Piles created an incomplete corpse pile for ${tokenDocument.name ?? tokenDocument.id}: expected ${expectedKeys.length} loot item${expectedKeys.length === 1 ? "" : "s"}, resolved ${verified.found}/${expectedKeys.length}. The new pile was rolled back and the corpse was preserved.`);
    }
    createdPile = verified.createdPile ?? createdPile;
    pileDocument = createdPile.tokenDocument ?? pileDocument;

    // The pile is populated now, so normal Item Piles cleanup-on-empty behavior
    // is safe again. Keep displayOne disabled so the corpse Token artwork is
    // preserved even when only one loot Item rolled.
    if (typeof api.updateItemPile === "function") {
      try {
        await api.updateItemPile(pileDocument, {
          deleteWhenEmpty: finalDeleteWhenEmpty,
          displayOne: false,
          showItemName: false,
          overrideSingleItemScale: false
        });
      } catch (error) {
        console.warn(`${MODULE_ID} | Corpse pile was populated, but Item Piles display/cleanup flags could not be finalized.`, error);
      }
    }

    // Commit: only now remove the original corpse. If this fails, roll back the
    // newly created pile so a retry cannot duplicate loot.
    try {
      await tokenDocument.delete();
    } catch (error) {
      await this.#rollbackCreatedPile(createdPile);
      throw new Error(`The loot pile was created and verified, but the original corpse could not be removed. The new pile was rolled back. ${error?.message ?? error}`);
    }

    return {
      converted: true,
      added: createPayload,
      empty: false,
      tokenDocument: pileDocument,
      gearPlan,
      normalized: this.#normalizationSummary(gearPlan)
    };
  }

  static #transactionId() {
    try {
      if (typeof foundry.utils?.randomID === "function") return foundry.utils.randomID(16);
    } catch (_) {}
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  static #createItemPayload(plannedPayload, api, transactionId) {
    const quantityPath = String(api?.ITEM_QUANTITY_ATTRIBUTE ?? "system.quantity") || "system.quantity";
    return (plannedPayload ?? []).map((row, index) => {
      const source = row?.item ?? row;
      const data = foundry.utils.deepClone(source ?? {});
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      const quantity = Math.max(1, Math.floor(Number(row?.quantity) || Number(foundry.utils.getProperty(data, quantityPath)) || 1));
      foundry.utils.setProperty(data, quantityPath, quantity);
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        corpsePayloadTransaction: transactionId,
        corpsePayloadKey: `${transactionId}:${index}`
      };
      return data;
    });
  }

  static async #awaitPayloadMaterialization(createdPile, expectedKeys=[]) {
    const expected = new Set((expectedKeys ?? []).map(String).filter(Boolean));
    if (!expected.size) return { ok: true, found: 0, createdPile };

    const tokenUuid = String(createdPile?.tokenUuid ?? createdPile?.tokenDocument?.uuid ?? "");
    const delays = [0, 150, 200, 300, 450, 650, 900];
    let bestFound = 0;
    let currentPile = createdPile;

    for (const delay of delays) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const resolved = tokenUuid ? await this.#fromUuidSafe(tokenUuid) : currentPile?.tokenDocument;
      if (resolved?.documentName === "Token" && resolved.actor) {
        currentPile = {
          ...currentPile,
          tokenDocument: resolved,
          actorDocument: resolved.actor,
          tokenUuid: resolved.uuid ?? tokenUuid,
          actorUuid: resolved.actor.uuid ?? currentPile?.actorUuid ?? ""
        };
      }
      const items = [...(currentPile?.tokenDocument?.actor?.items?.contents ?? currentPile?.tokenDocument?.actor?.items ?? [])];
      const found = new Set(items
        .map(item => String(item?.getFlag?.(MODULE_ID, "corpsePayloadKey")
          ?? foundry.utils.getProperty(item, `flags.${MODULE_ID}.corpsePayloadKey`)
          ?? ""))
        .filter(key => expected.has(key)));
      bestFound = Math.max(bestFound, found.size);
      if (found.size === expected.size) return { ok: true, found: found.size, createdPile: currentPile };
    }

    return { ok: false, found: bestFound, createdPile: currentPile };
  }

  static #normalizationSummary(plan) {
    const output = Array.isArray(plan?.output) ? plan.output : [];
    return {
      mode: String(plan?.mode ?? ""),
      source: Number(plan?.sourceItemCount) || 0,
      retained: Number(plan?.retainedItemCount) || 0,
      added: output.length,
      unmatched: Array.isArray(plan?.unmatched) ? plan.unmatched.length : 0,
      failed: false
    };
  }

  static #tokenSnapshot(tokenDocument) {
    const raw = tokenDocument.toObject?.() ?? {};
    const texture = foundry.utils.deepClone(raw.texture ?? tokenDocument.texture ?? {});
    const actor = tokenDocument.actor;
    const tokenOverrides = {
      name: String(raw.name ?? tokenDocument.name ?? actor?.name ?? "Loot"),
      width: Number(raw.width ?? tokenDocument.width) || 1,
      height: Number(raw.height ?? tokenDocument.height) || 1,
      elevation: Number(raw.elevation ?? tokenDocument.elevation) || 0,
      rotation: Number(raw.rotation ?? tokenDocument.rotation) || 0,
      alpha: Number(raw.alpha ?? tokenDocument.alpha) || 1,
      hidden: Boolean(raw.hidden ?? tokenDocument.hidden),
      disposition: Number(raw.disposition ?? tokenDocument.disposition) || 0,
      texture
    };
    const actorOverrides = {
      name: String(actor?.name ?? tokenOverrides.name),
      img: String(actor?.img ?? texture?.src ?? "icons/svg/item-bag.svg")
    };
    return { tokenOverrides, actorOverrides };
  }

  static async #resolveCreatedPile(created, { sceneId="" }={}) {
    const tokenCandidates = [];
    const actorCandidates = [];
    const documentCandidates = [];
    const queue = Array.isArray(created) ? [...created] : [created];

    for (const candidate of queue) {
      if (!candidate) continue;
      if (candidate.documentName === "Token") {
        documentCandidates.push(candidate);
        continue;
      }
      if (candidate.document?.documentName === "Token") {
        documentCandidates.push(candidate.document);
        continue;
      }
      if (candidate.documentName === "Actor") {
        actorCandidates.push(candidate.uuid ?? candidate.id);
        continue;
      }
      if (typeof candidate === "string") {
        tokenCandidates.push(candidate);
        continue;
      }
      if (typeof candidate === "object") {
        if (candidate.tokenDocument?.documentName === "Token") documentCandidates.push(candidate.tokenDocument);
        if (candidate.token?.documentName === "Token") documentCandidates.push(candidate.token);
        if (candidate.token?.document?.documentName === "Token") documentCandidates.push(candidate.token.document);
        if (candidate.tokenUuid) tokenCandidates.push(String(candidate.tokenUuid));
        if (candidate.uuid && String(candidate.uuid).includes(".Token.")) tokenCandidates.push(String(candidate.uuid));
        if (candidate.actorUuid) actorCandidates.push(String(candidate.actorUuid));
        if (candidate.actor?.uuid) actorCandidates.push(String(candidate.actor.uuid));
      }
    }

    for (const tokenDocument of documentCandidates) {
      if (tokenDocument?.actor) {
        return { tokenDocument, actorDocument: tokenDocument.actor, tokenUuid: tokenDocument.uuid ?? "", actorUuid: tokenDocument.actor.uuid ?? "" };
      }
    }

    // A newly-created embedded Token may become locally resolvable one tick
    // after createItemPile() returns. Retry briefly without creating any
    // user-visible delay.
    const delays = [0, 0, 25, 75];
    for (const delay of delays) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      for (const uuid of [...new Set(tokenCandidates.filter(Boolean))]) {
        const document = await this.#fromUuidSafe(uuid);
        if (document?.documentName === "Token" && document.actor) {
          return { tokenDocument: document, actorDocument: document.actor, tokenUuid: document.uuid ?? uuid, actorUuid: document.actor.uuid ?? "" };
        }
      }
    }

    // Fallback for Item Piles variants that only provide actorUuid. The pile is
    // a synthetic/unlinked Token in the requested Scene, so resolve the Actor
    // and then locate the unique Token which represents it.
    for (const uuid of [...new Set(actorCandidates.filter(Boolean))]) {
      const actorDocument = await this.#fromUuidSafe(uuid);
      if (!actorDocument || actorDocument.documentName !== "Actor") continue;
      const scene = game.scenes?.get?.(String(sceneId || "")) ?? canvas?.scene ?? null;
      const matches = [...(scene?.tokens?.contents ?? scene?.tokens ?? [])].filter(token => token?.actor?.id === actorDocument.id || token?.actor?.uuid === actorDocument.uuid);
      if (matches.length === 1) {
        const tokenDocument = matches[0];
        return { tokenDocument, actorDocument: tokenDocument.actor ?? actorDocument, tokenUuid: tokenDocument.uuid ?? "", actorUuid: actorDocument.uuid ?? uuid };
      }
    }

    return {
      tokenDocument: null,
      actorDocument: null,
      tokenUuid: String(tokenCandidates[0] ?? ""),
      actorUuid: String(actorCandidates[0] ?? "")
    };
  }

  static async #fromUuidSafe(uuid) {
    if (!uuid) return null;
    try {
      const resolver = foundry.utils?.fromUuid ?? globalThis.fromUuid;
      if (typeof resolver !== "function") return null;
      return await resolver(uuid);
    } catch (_) {
      return null;
    }
  }

  static async #rollbackCreatedPile(createdPile) {
    const tokenDocument = createdPile?.tokenDocument ?? null;
    if (tokenDocument) {
      try {
        await tokenDocument.delete?.();
        return;
      } catch (error) {
        console.error(`${MODULE_ID} | Failed to roll back a newly-created corpse pile Token after Token Harvest failure.`, error);
      }
    }

    // Even when local resolution failed, Item Piles may already have created
    // the Token. Use its returned tokenUuid directly as a best-effort rollback.
    const tokenUuid = String(createdPile?.tokenUuid ?? "");
    const resolved = await this.#fromUuidSafe(tokenUuid);
    if (!resolved) return;
    try {
      await resolved.delete?.();
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to roll back a newly-created corpse pile after Token Harvest failure.`, error);
    }
  }
}
