import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { GearNormalizationService } from "./gear-normalization-service.mjs";

/**
 * Optional Item Piles bridge used by explicit GM Token Harvest.
 *
 * v0.0.17 keeps the known-good corpse conversion + addItems() flow while
 * making the two immersive gear modes deterministic. Remove All and Keep All
 * retain their v0.0.16 behavior. Normalize explicitly replaces the live
 * transferable pile inventory; Keep Physical only removes disallowed live pile
 * items and never re-adds gear that Item Piles already transferred.
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
    if (typeof api.turnTokensIntoItemPiles !== "function") throw new Error("The active Item Piles version does not expose turnTokensIntoItemPiles().");
    if (typeof api.addItems !== "function") throw new Error("The active Item Piles version does not expose addItems().");
    return api;
  }

  static async buildHarvestPayload(result) {
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
      // Quantity is passed separately to Item Piles. Keep the cloned Item at 1
      // so D&D5e's Item transformer cannot multiply the requested stack twice.
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
    const startedAt = globalThis.performance?.now?.() ?? Date.now();
    const api = this.api();
    if (!tokenDocument) throw new Error("A Token is required to create an Item Pile.");

    const actor = tokenDocument.actor;
    if (!actor) throw new Error("The harvested Token has no Actor.");

    // Ask Item Piles which source Items are actually transferable before the
    // Token is converted. This excludes system features/spells according to the
    // active D&D5e Item Piles integration and prevents Crafting Core from ever
    // trying to normalize stat-block-only embedded Items such as Grab.
    const transferable = typeof api.getActorItems === "function"
      ? await api.getActorItems(tokenDocument)
      : [...(actor.items?.contents ?? actor.items ?? [])];

    // Resolve all normalization matches before Item Piles changes the Token.
    // Crafting Core never edits the source Actor directly.
    const gearPlan = await GearNormalizationService.buildPlan(actor, { sourceItems: transferable });
    const harvestPayload = await this.buildHarvestPayload(result);
    const hasGearOutput = GearNormalizationService.hasOutput(gearPlan);
    if (!harvestPayload.length && !hasGearOutput) {
      return { converted: false, added: [], empty: true, gearPlan };
    }

    const originalAppearance = this.#appearanceSnapshot(tokenDocument);
    const defaultDeleteWhenEmpty = api.PILE_DEFAULTS?.deleteWhenEmpty;

    if (!this.#isItemPile(tokenDocument, api)) {
      // Keep the original corpse appearance and prevent single-item piles from
      // replacing it with the contained Item's icon. deleteWhenEmpty is disabled
      // only while we rebuild the corpse inventory transactionally.
      await api.turnTokensIntoItemPiles([tokenDocument], {
        pileSettings: {
          deleteWhenEmpty: false,
          displayOne: false,
          showItemName: false,
          overrideSingleItemScale: false
        },
        tokenSettings: foundry.utils.deepClone(originalAppearance)
      });
    }

    const refreshed = canvas?.tokens?.get?.(tokenDocument.id)?.document ?? tokenDocument;
    if (!refreshed?.actor) throw new Error(`Item Piles converted ${actor.name}, but the corpse Token no longer has an Actor.`);

    const mode = gearPlan.mode;
    let payload = [];
    let added = [];
    let transactionComplete = false;
    let inventoryStrategy = "append-harvest";
    let rollbackPayload = null;
    let inventoryMutated = false;

    try {
      if (mode === GearNormalizationService.MODES.NORMALIZE) {
        // Item Piles may stack an equivalent normalized Item onto the original
        // corpse gear before removeExistingActorItems is applied. Avoid that
        // ambiguity completely: snapshot the *live* transferable pile Items,
        // remove those current IDs while deleteWhenEmpty=false, then add exactly
        // one final payload (normalized gear + Harvest).
        const liveItems = await this.#transferablePileItems(refreshed, api);
        rollbackPayload = GearNormalizationService.payloadFromItems(liveItems);
        await this.#removePileItems(refreshed, api, liveItems);
        inventoryMutated = liveItems.length > 0;
        payload = [...GearNormalizationService.outputPayload(gearPlan), ...harvestPayload];
        inventoryStrategy = "replace-transferable-with-normalized";
        if (payload.length) added = await api.addItems(refreshed, payload) ?? [];
      } else if (mode === GearNormalizationService.MODES.REMOVE_ALL) {
        // v0.0.16 live-validated stable path. Do not refactor it in this patch.
        payload = [...harvestPayload];
        inventoryStrategy = "item-piles-remove-existing";
        added = await api.addItems(refreshed, payload, { removeExistingActorItems: true }) ?? [];
      } else if (mode === GearNormalizationService.MODES.FILTER) {
        // Item Piles already transferred the physical corpse gear. Re-adding the
        // same gear is what produced Holy Mace/Scimitar/Armor duplication in
        // v0.0.16. Only remove live transferable entries that violate the mode,
        // then append Harvest.
        const liveItems = await this.#transferablePileItems(refreshed, api);
        rollbackPayload = GearNormalizationService.payloadFromItems(liveItems);
        const disallowed = liveItems.filter(item => !GearNormalizationService.isPhysicalCandidate(item) || GearNormalizationService.isNaturalWeapon(item));
        await this.#removePileItems(refreshed, api, disallowed);
        inventoryMutated = disallowed.length > 0;
        payload = [...harvestPayload];
        inventoryStrategy = "keep-live-physical-plus-harvest";
        if (payload.length) added = await api.addItems(refreshed, payload) ?? [];
      } else {
        // KEEP_ALL live-validated stable path: preserve exactly what Item Piles
        // transferred and append only generated Crafting Core materials.
        payload = [...harvestPayload];
        inventoryStrategy = "keep-all-plus-harvest";
        if (payload.length) added = await api.addItems(refreshed, payload) ?? [];
      }
      transactionComplete = true;
    } catch (error) {
      // If Normalize/Keep Physical changed the live pile before addItems failed,
      // restore the exact transferable snapshot first. This keeps the corpse
      // recoverable even when the third-party transaction fails mid-flight.
      if (inventoryMutated && rollbackPayload) {
        try { await this.#restoreTransferableSnapshot(refreshed, api, rollbackPayload); }
        catch (restoreError) {
          console.error(`${MODULE_ID} | Could not restore the pre-normalization corpse inventory for ${actor.name}.`, restoreError);
        }
      }

      if (typeof api.revertTokensFromItemPiles === "function") {
        try {
          await api.revertTokensFromItemPiles([refreshed], { tokenSettings: foundry.utils.deepClone(originalAppearance) });
        } catch (rollbackError) {
          console.error(`${MODULE_ID} | Item Piles rollback failed for ${actor.name}.`, rollbackError);
        }
      }
      throw error;
    } finally {
      // Reassert the corpse look after Item Piles evaluates its contents.
      try { await refreshed.update(foundry.utils.deepClone(originalAppearance)); }
      catch (error) { console.warn(`${MODULE_ID} | Could not restore corpse appearance for ${actor.name}.`, error); }

      // Restore the Item Piles default auto-delete behavior after the inventory
      // operation. Failure here is non-fatal to generated loot.
      if (transactionComplete && typeof api.updateItemPile === "function" && defaultDeleteWhenEmpty !== undefined) {
        try { await api.updateItemPile(refreshed, { deleteWhenEmpty: defaultDeleteWhenEmpty }); }
        catch (error) { console.warn(`${MODULE_ID} | Could not restore Item Piles deleteWhenEmpty default for ${actor.name}.`, error); }
      }
    }

    const elapsed = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    console.debug(`${MODULE_ID} | Token Harvest Item Piles transaction for ${actor.name}: ${elapsed} ms; mode=${mode}; strategy=${inventoryStrategy}; planned=${payload.length}; added=${Array.isArray(added) ? added.length : 0}.`);

    return {
      converted: true,
      added: Array.isArray(added) ? added : [],
      empty: false,
      tokenDocument: refreshed,
      gearPlan,
      inventoryStrategy,
      elapsedMs: elapsed
    };
  }

  static async #transferablePileItems(tokenDocument, api) {
    if (typeof api.getActorItems !== "function") {
      throw new Error("The active Item Piles version does not expose getActorItems(), which is required for safe immersive corpse gear handling.");
    }
    const raw = await api.getActorItems(tokenDocument);
    if (!Array.isArray(raw)) return [];
    return raw.map(row => row?.item ?? row).filter(item => Boolean(item) && Boolean(this.#itemId(item)));
  }

  static async #removePileItems(tokenDocument, api, items=[]) {
    const ids = [...new Set((items ?? []).map(item => this.#itemId(item)).filter(Boolean))];
    if (!ids.length) return [];
    if (typeof api.removeItems !== "function") {
      throw new Error("The active Item Piles version does not expose removeItems(), which is required for safe immersive corpse gear handling.");
    }
    return await api.removeItems(tokenDocument, ids) ?? [];
  }

  static async #restoreTransferableSnapshot(tokenDocument, api, snapshot=[]) {
    const liveItems = await this.#transferablePileItems(tokenDocument, api);
    await this.#removePileItems(tokenDocument, api, liveItems);
    if (snapshot.length) await api.addItems(tokenDocument, snapshot);
  }

  static #itemId(item) {
    return String(item?.id ?? item?._id ?? "").trim();
  }

  static #appearanceSnapshot(tokenDocument) {
    const texture = tokenDocument?.texture ?? {};
    return {
      name: String(tokenDocument?.name ?? tokenDocument?.actor?.name ?? "Loot"),
      width: Number(tokenDocument?.width ?? 1) || 1,
      height: Number(tokenDocument?.height ?? 1) || 1,
      elevation: Number(tokenDocument?.elevation ?? 0) || 0,
      rotation: Number(tokenDocument?.rotation ?? 0) || 0,
      texture: {
        src: String(texture?.src ?? tokenDocument?.actor?.img ?? "icons/svg/item-bag.svg"),
        scaleX: Number(texture?.scaleX ?? 1) || 1,
        scaleY: Number(texture?.scaleY ?? 1) || 1,
        offsetX: Number(texture?.offsetX ?? 0) || 0,
        offsetY: Number(texture?.offsetY ?? 0) || 0,
        rotation: Number(texture?.rotation ?? 0) || 0,
        tint: texture?.tint ?? null
      }
    };
  }

  static #isItemPile(tokenDocument, api) {
    try {
      if (typeof api.isValidItemPile === "function") return Boolean(api.isValidItemPile(tokenDocument));
      if (typeof api.isItemPile === "function") return Boolean(api.isItemPile(tokenDocument));
    } catch (_) {}
    const flags = tokenDocument?.flags?.[this.MODULE_ID] ?? tokenDocument?.actor?.flags?.[this.MODULE_ID];
    return Boolean(flags?.data?.enabled || flags?.enabled);
  }
}
