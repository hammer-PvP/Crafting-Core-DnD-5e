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
  static GENERATED_LOOT_DRAG_TYPE = `${MODULE_ID}.generated-loot`;
  static #generatedLootDropHookInstalled = false;

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

  static generatedLootDragData(result) {
    const rows = Array.isArray(result?.items) ? result.items : [];
    if (!rows.length) throw new Error("Generate at least one material before dragging an Item Pile.");
    return {
      type: this.GENERATED_LOOT_DRAG_TYPE,
      result: {
        source: String(result?.source ?? "manual-generation"),
        sourceLabel: String(result?.sourceLabel ?? "Generated Materials"),
        items: rows.map(row => ({
          materialId: String(row?.materialId ?? ""),
          name: String(row?.name ?? "Material"),
          img: String(row?.img ?? "icons/svg/item-bag.svg"),
          quantity: Math.max(1, Math.floor(Number(row?.quantity) || 1)),
          rarity: String(row?.rarity ?? "common"),
          rarityLabel: String(row?.rarityLabel ?? "Common")
        })).filter(row => row.materialId)
      }
    };
  }

  static installGeneratedLootDropHook() {
    if (this.#generatedLootDropHookInstalled) return;
    this.#generatedLootDropHookInstalled = true;
    Hooks.on("dropCanvasData", (canvasView, data) => {
      if (String(data?.type ?? "") !== this.GENERATED_LOOT_DRAG_TYPE) return true;
      if (!game.user?.isGM) return false;
      const result = data?.result;
      const x = Number(data?.x);
      const y = Number(data?.y);
      const sceneId = String(canvasView?.scene?.id ?? canvas?.scene?.id ?? game.user?.viewedScene ?? "");
      if (!result?.items?.length || !Number.isFinite(x) || !Number.isFinite(y) || !sceneId) {
        ui.notifications.error("Crafting Core could not resolve that generated-loot drop position.");
        return false;
      }
      void this.createGeneratedLootPile(result, { position: { x, y }, sceneId, hidden: true })
        .then(() => ui.notifications.info("Created a hidden generated-loot Item Pile at the drop position."))
        .catch(error => {
          console.error(`${MODULE_ID} | Dragged generated Item Pile creation failed.`, error);
          ui.notifications.error(error.message ?? "Crafting Core could not create the dropped Item Pile.");
        });
      return false;
    });
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
      throw new Error(`Crafting Core material Items are missing (${missing.join(", ")}). Run Materials → Sync Catalog and retry the corpse.`);
    }
    return payload;
  }

  static async createGeneratedLootPile(result, { position=null, sceneId=null, hidden=true }={}) {
    if (!game.user?.isGM) throw new Error("Only a GM can create generated Item Piles.");
    if (!this.isAvailable()) throw new Error("Item Piles is not active.");
    if (!Array.isArray(result?.items) || !result.items.length) throw new Error("Generate at least one material before creating an Item Pile.");

    const api = game.itempiles.API;
    if (typeof api.createItemPile !== "function") {
      throw new Error("The active Item Piles version does not expose createItemPile().");
    }
    if (typeof api.addItems !== "function") {
      throw new Error("The active Item Piles version does not expose addItems().");
    }

    const documents = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const batchId = `generated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const payload = [];
    const expected = [];
    const missing = [];

    for (const row of result.items) {
      const materialId = String(row?.materialId ?? "").trim();
      const source = documents.get(materialId);
      if (!source) {
        missing.push(materialId);
        continue;
      }

      const quantity = Math.max(1, Math.floor(Number(row?.quantity) || 1));
      const data = source.toObject();
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      data.system ??= {};
      // Item Piles addItems() owns the stack quantity. Keeping the source clone
      // at one mirrors the already-live-validated Token Harvest path and avoids
      // D&D5e quantity transforms multiplying the requested stack.
      data.system.quantity = 1;
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        generatedLoot: true,
        generatedLootBatch: batchId,
        generatedLootMaterialId: materialId,
        generatedAt: Date.now(),
        generationSource: String(result.source ?? "manual-generation")
      };

      payload.push({ item: data, quantity });
      expected.push({ materialId, name: String(data.name ?? row?.name ?? materialId), quantity });
    }

    if (missing.length) throw new Error(`Crafting Core material Items are missing (${missing.join(", ")}). Run Materials → Sync Catalog and retry.`);
    if (!payload.length) throw new Error("No generated material Items could be resolved.");

    const dominant = [...result.items].sort((a, b) => (Number(b.quantity) || 0) - (Number(a.quantity) || 0))[0] ?? null;
    const icon = String(dominant?.img || "icons/svg/item-bag.svg");
    const targetSceneId = String(sceneId ?? canvas?.scene?.id ?? game.user?.viewedScene ?? "");
    if (!targetSceneId) throw new Error("Open a Scene before creating an Item Pile.");

    let pilePosition = position;
    if (!pilePosition) {
      const scene = game.scenes?.get?.(targetSceneId) ?? canvas?.scene;
      const width = Number(scene?.width ?? canvas?.dimensions?.sceneWidth ?? canvas?.dimensions?.width ?? 0) || 0;
      const height = Number(scene?.height ?? canvas?.dimensions?.sceneHeight ?? canvas?.dimensions?.height ?? 0) || 0;
      const offsetX = Number(canvas?.dimensions?.sceneX ?? 0) || 0;
      const offsetY = Number(canvas?.dimensions?.sceneY ?? 0) || 0;
      pilePosition = { x: offsetX + (width / 2), y: offsetY + (height / 2) };
    }

    const name = String(result.sourceLabel || "Generated Materials");
    const defaultDeleteWhenEmpty = api.PILE_DEFAULTS?.deleteWhenEmpty;
    let createdUuid = null;
    let pileTarget = null;

    try {
      // Deliberately create an empty pile first. Passing a multi-item array to
      // createItemPile() is avoided here because the Generate Materials live
      // path showed that the D&D5e / Item Piles creation transform could retain
      // only the final entry. Inventory population is delegated to addItems(),
      // the same API path already proven by Token Harvest.
      createdUuid = await api.createItemPile({
        sceneId: targetSceneId,
        position: pilePosition,
        tokenOverrides: { name, hidden: Boolean(hidden), texture: { src: icon } },
        actorOverrides: { name, img: icon },
        itemPileFlags: {
          displayOne: false,
          showItemName: false,
          deleteWhenEmpty: false
        }
      });

      pileTarget = await this.#resolveGeneratedPileTarget(createdUuid, targetSceneId);
      const added = await api.addItems(pileTarget, payload) ?? [];

      // Re-resolve after the Item Piles transaction so validation reads the
      // authoritative embedded inventory rather than a potentially stale view.
      const refreshed = await this.#resolveGeneratedPileTarget(createdUuid, targetSceneId);
      const validation = this.#validateGeneratedPileContents(refreshed, expected, batchId);
      if (!validation.ok) {
        const detail = validation.problems.length ? ` ${validation.problems.join("; ")}` : "";
        throw new Error(`Item Piles created the pile, but Crafting Core could not verify the complete generated inventory.${detail}`);
      }

      if (typeof api.updateItemPile === "function" && defaultDeleteWhenEmpty !== undefined) {
        try { await api.updateItemPile(refreshed, { deleteWhenEmpty: defaultDeleteWhenEmpty }); }
        catch (error) { console.warn(`${MODULE_ID} | Could not restore generated Item Pile deleteWhenEmpty default.`, error); }
      }

      console.debug(`${MODULE_ID} | Generated Item Pile populated transactionally: expected=${expected.length}; added=${Array.isArray(added) ? added.length : 0}; uuid=${createdUuid}.`);
      return {
        uuid: createdUuid,
        icon,
        position: pilePosition,
        itemCount: expected.length,
        hidden: Boolean(hidden),
        sceneId: targetSceneId
      };
    } catch (error) {
      if (createdUuid || pileTarget) {
        try { await this.#deleteGeneratedPileTarget(pileTarget ?? await this.#resolveGeneratedPileTarget(createdUuid, targetSceneId)); }
        catch (cleanupError) {
          console.error(`${MODULE_ID} | Could not remove an incomplete generated Item Pile after population failed.`, cleanupError);
        }
      }
      throw error;
    }
  }

  static async #resolveGeneratedPileTarget(uuid, sceneId) {
    const rawUuid = String(uuid ?? "").trim();
    if (!rawUuid) throw new Error("Item Piles did not return a UUID for the generated pile.");

    const resolver = globalThis.fromUuid ?? foundry.utils?.fromUuid;
    let resolved = null;
    if (typeof resolver === "function") {
      try { resolved = await resolver(rawUuid); }
      catch (_) { resolved = null; }
    }

    const direct = resolved?.document ?? resolved;
    if (direct?.documentName === "Token" || direct?.documentName === "Actor") return direct;
    if (direct?.actor) return direct;

    // createItemPile() with a Scene position normally returns a Token UUID.
    // Keep a deterministic Scene lookup fallback in case the resolver has not
    // hydrated that embedded document yet on the current client.
    const tokenMatch = rawUuid.match(/^Scene\.([^.]+)\.Token\.([^.]+)$/i);
    if (tokenMatch) {
      const scene = game.scenes?.get?.(tokenMatch[1]) ?? (String(sceneId) === tokenMatch[1] ? canvas?.scene : null);
      const token = scene?.tokens?.get?.(tokenMatch[2]);
      if (token) return token;
    }

    throw new Error(`Crafting Core could not resolve the generated Item Pile document (${rawUuid}).`);
  }

  static #validateGeneratedPileContents(target, expected, batchId) {
    const actor = target?.documentName === "Actor" ? target : target?.actor;
    const actorItems = [...(actor?.items?.contents ?? actor?.items ?? [])];
    if (!actor || !actorItems.length) {
      return { ok: false, problems: ["the created pile has no readable Item inventory"] };
    }

    const expectedById = new Map(expected.map(row => [String(row.materialId), row]));
    const expectedByName = new Map(expected.map(row => [String(row.name).trim().toLowerCase(), row]));
    const actual = new Map();

    for (const item of actorItems) {
      const flags = item?.flags?.[MODULE_ID] ?? {};
      if (flags.generatedLootBatch && String(flags.generatedLootBatch) !== String(batchId)) continue;

      let materialId = String(flags.generatedLootMaterialId ?? "").trim();
      if (!materialId || !expectedById.has(materialId)) {
        const byName = expectedByName.get(String(item?.name ?? "").trim().toLowerCase());
        materialId = String(byName?.materialId ?? "").trim();
      }
      if (!materialId || !expectedById.has(materialId)) continue;

      const quantity = Math.max(0, Math.floor(Number(item?.system?.quantity) || 0));
      actual.set(materialId, (actual.get(materialId) ?? 0) + quantity);
    }

    const problems = [];
    for (const row of expected) {
      const actualQuantity = actual.get(String(row.materialId)) ?? 0;
      if (actualQuantity !== row.quantity) {
        problems.push(`${row.name}: expected ×${row.quantity}, found ×${actualQuantity}`);
      }
    }

    return { ok: problems.length === 0, problems };
  }

  static async #deleteGeneratedPileTarget(target) {
    const document = target?.document ?? target;
    if (document?.documentName === "Token" && typeof document.delete === "function") {
      await document.delete();
      return;
    }
    // Never delete an Actor fallback here: createGeneratedLootPile() uses the
    // shared default Item Piles actor unless explicitly told otherwise. Deleting
    // it would be destructive. A positioned generated pile should resolve to a
    // TokenDocument, so reaching this branch is intentionally a safe no-op.
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
