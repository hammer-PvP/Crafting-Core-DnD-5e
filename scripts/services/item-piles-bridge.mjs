import { FLAGS, MODULE_ID } from "../constants.mjs";
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
    if (typeof api.createItemPile !== "function") throw new Error("The active Item Piles version does not expose createItemPile().");
    if (typeof api.addItems !== "function") throw new Error("The active Item Piles version does not expose addItems().");

    const documents = await MaterialCatalogService.materialDocumentsById({ ensureComplete: true });
    const payload = [];
    const missing = [];
    const batchId = foundry.utils.randomID(16);
    for (const row of result.items) {
      const materialId = String(row.materialId ?? "");
      const source = documents.get(materialId);
      if (!source) {
        missing.push(materialId);
        continue;
      }
      const data = source.toObject();
      delete data._id;
      delete data._stats;
      delete data.folder;
      data.sort = 0;
      data.system ??= {};
      // Item Piles owns stack quantity in addItems(). Keep the cloned D&D5e Item
      // at one so system transformers cannot multiply the requested stack.
      data.system.quantity = 1;
      data.flags ??= {};
      data.flags[MODULE_ID] = {
        ...(data.flags[MODULE_ID] ?? {}),
        generatedLoot: true,
        generatedAt: Date.now(),
        generationSource: String(result.source ?? "manual-generation"),
        generatedLootBatch: batchId
      };
      payload.push({ item: data, quantity: Math.max(1, Math.floor(Number(row.quantity) || 1)) });
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
    let created = null;
    let tokenDocument = null;
    try {
      // Intentionally create the pile empty. Item Piles v100 returns an object
      // containing tokenUuid/actorUuid here even though older API docs describe
      // a string return. Populate the synthetic Token Actor only after resolving
      // that token explicitly.
      created = await api.createItemPile({
        sceneId: targetSceneId,
        position: pilePosition,
        tokenOverrides: { name, hidden: Boolean(hidden), texture: { src: icon } },
        actorOverrides: { name, img: icon },
        itemPileFlags: { displayOne: false, showItemName: false }
      });
      console.debug(`${MODULE_ID} | createItemPile() generated-loot return`, created);

      tokenDocument = await this.#resolveGeneratedPileToken(created, { sceneId: targetSceneId });
      await api.addItems(tokenDocument, payload);

      // Resolve again after Item Piles' socket transaction so validation reads
      // the current synthetic Actor rather than a potentially stale reference.
      tokenDocument = await this.#resolveGeneratedPileToken(created, { sceneId: targetSceneId, fallback: tokenDocument });
      this.#assertGeneratedPileInventory(tokenDocument, result.items, batchId);

      return {
        uuid: String(tokenDocument.uuid ?? created?.tokenUuid ?? created ?? ""),
        tokenUuid: String(tokenDocument.uuid ?? created?.tokenUuid ?? ""),
        actorUuid: String(created?.actorUuid ?? tokenDocument.actor?.uuid ?? ""),
        icon,
        position: pilePosition,
        itemCount: payload.length,
        hidden: Boolean(hidden),
        sceneId: targetSceneId
      };
    } catch (error) {
      // Never leave a silent partial/empty pile behind when population fails.
      try {
        tokenDocument ??= await this.#resolveGeneratedPileToken(created, { sceneId: targetSceneId, allowMissing: true });
        if (tokenDocument) {
          if (typeof api.deleteItemPile === "function") await api.deleteItemPile(tokenDocument);
          else await tokenDocument.delete?.();
        }
      } catch (cleanupError) {
        console.error(`${MODULE_ID} | Could not remove an incomplete generated Item Pile after population failed.`, cleanupError);
      }
      throw error;
    }
  }

  static async #resolveGeneratedPileToken(created, { sceneId="", fallback=null, allowMissing=false }={}) {
    if (created?.documentName === "Token" && created?.actor) return created;
    if (created?.document?.documentName === "Token" && created.document?.actor) return created.document;
    if (fallback?.documentName === "Token" && fallback?.actor) return fallback;

    let tokenUuid = "";
    if (typeof created === "string") tokenUuid = created;
    else if (created && typeof created === "object") {
      tokenUuid = String(created.tokenUuid ?? created.tokenUUID ?? created.uuid ?? "");
    }

    if (tokenUuid) {
      const resolver = foundry.utils?.fromUuid ?? globalThis.fromUuid;
      const resolved = typeof resolver === "function" ? await resolver(tokenUuid) : null;
      const tokenDocument = resolved?.documentName === "Token" ? resolved : resolved?.document?.documentName === "Token" ? resolved.document : null;
      if (tokenDocument?.actor) return tokenDocument;
    }

    // Compatibility fallback for an Item Piles build that returns only an Actor
    // identifier: locate the just-created token on the requested Scene. Current
    // Item Piles v100 supplies tokenUuid, so this should normally not be needed.
    const actorUuid = created && typeof created === "object" ? String(created.actorUuid ?? "") : "";
    const actorId = actorUuid.startsWith("Actor.") ? actorUuid.split(".")[1] : "";
    if (sceneId && actorId) {
      const scene = game.scenes?.get?.(String(sceneId));
      const matches = [...(scene?.tokens?.contents ?? scene?.tokens ?? [])].filter(token => String(token?.actorId ?? "") === actorId);
      const tokenDocument = matches.at(-1) ?? null;
      if (tokenDocument?.actor) return tokenDocument;
    }

    if (allowMissing) return null;
    const shape = created && typeof created === "object" ? Object.keys(created).join(", ") || "object" : String(created);
    throw new Error(`Crafting Core could not resolve the generated Item Pile Token (${shape || "empty return"}).`);
  }

  static #assertGeneratedPileInventory(tokenDocument, expectedRows=[], batchId="") {
    const actor = tokenDocument?.actor;
    if (!actor) throw new Error("Crafting Core created an Item Pile Token, but its synthetic Actor could not be read after population.");

    const expected = new Map();
    for (const row of expectedRows ?? []) {
      const materialId = String(row?.materialId ?? "");
      if (!materialId) continue;
      expected.set(materialId, (expected.get(materialId) ?? 0) + Math.max(1, Math.floor(Number(row?.quantity) || 1)));
    }

    const actual = new Map();
    for (const item of actor.items?.contents ?? actor.items ?? []) {
      const flags = item?.flags?.[MODULE_ID] ?? {};
      if (batchId && flags.generatedLootBatch && String(flags.generatedLootBatch) !== batchId) continue;
      const materialId = String(flags[FLAGS.MATERIAL_ID] ?? item?.getFlag?.(MODULE_ID, FLAGS.MATERIAL_ID) ?? "");
      if (!materialId || !expected.has(materialId)) continue;
      const quantity = Math.max(0, Math.floor(Number(item?.system?.quantity) || 0));
      actual.set(materialId, (actual.get(materialId) ?? 0) + quantity);
    }

    const mismatches = [];
    for (const [materialId, quantity] of expected) {
      const found = actual.get(materialId) ?? 0;
      if (found !== quantity) mismatches.push(`${materialId}: expected ${quantity}, found ${found}`);
    }
    if (mismatches.length) {
      throw new Error(`Crafting Core created the Item Pile, but its inventory did not match the generated preview (${mismatches.join("; ")}).`);
    }
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
