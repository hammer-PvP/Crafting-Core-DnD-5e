import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { GearNormalizationService } from "./gear-normalization-service.mjs";

/**
 * Optional Item Piles bridge used by explicit GM Token Harvest.
 *
 * v0.0.16 deliberately keeps the known-good v0.0.10 flow: convert the existing
 * corpse Token, then use Item Piles' transactional addItems() API. Loot cleanup
 * is performed by addItems({ removeExistingActorItems: true }) so the pile is
 * never emptied in a separate removeItems() call.
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
      ? api.getActorItems(tokenDocument)
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
    let payload = harvestPayload;
    let replaceExisting = false;

    if (mode === GearNormalizationService.MODES.NORMALIZE) {
      payload = [...GearNormalizationService.outputPayload(gearPlan), ...harvestPayload];
      replaceExisting = true;
    } else if (mode === GearNormalizationService.MODES.REMOVE_ALL) {
      payload = [...harvestPayload];
      replaceExisting = true;
    } else if (mode === GearNormalizationService.MODES.FILTER) {
      payload = [...GearNormalizationService.outputPayload(gearPlan), ...harvestPayload];
      replaceExisting = true;
    } else {
      // KEEP_ALL intentionally leaves the Item Piles-filtered corpse inventory
      // untouched and only appends Crafting Core materials.
      payload = [...harvestPayload];
      replaceExisting = false;
    }

    let added = [];
    let transactionComplete = false;
    try {
      if (payload.length || replaceExisting) {
        added = await api.addItems(refreshed, payload, { removeExistingActorItems: replaceExisting }) ?? [];
      }
      transactionComplete = true;
    } catch (error) {
      // addItems() is the transaction boundary. If it fails after we converted
      // the corpse, revert the Token back to a normal NPC whenever the active
      // Item Piles version exposes the public rollback API. The source Actor
      // inventory was never edited directly by Crafting Core.
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

      // Restore the Item Piles default auto-delete behavior after the atomic
      // inventory rewrite. Failure here is non-fatal to the generated loot.
      if (transactionComplete && typeof api.updateItemPile === "function" && defaultDeleteWhenEmpty !== undefined) {
        try { await api.updateItemPile(refreshed, { deleteWhenEmpty: defaultDeleteWhenEmpty }); }
        catch (error) { console.warn(`${MODULE_ID} | Could not restore Item Piles deleteWhenEmpty default for ${actor.name}.`, error); }
      }
    }

    const elapsed = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);
    console.debug(`${MODULE_ID} | Token Harvest Item Piles transaction for ${actor.name}: ${elapsed} ms; mode=${mode}; planned=${payload.length}; added=${Array.isArray(added) ? added.length : 0}.`);

    return {
      converted: true,
      added: Array.isArray(added) ? added : [],
      empty: false,
      tokenDocument: refreshed,
      gearPlan,
      replaceExisting,
      elapsedMs: elapsed
    };
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
