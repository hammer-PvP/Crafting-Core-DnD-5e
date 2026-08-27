import { MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";

/**
 * Narrow optional bridge to Item Piles. Crafting Core never requires Item Piles
 * to load; Token Harvest controls are simply unavailable while its public API
 * is missing.
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
      // Item Piles receives the requested stack quantity separately. Keep the
      // item data itself at quantity 1 to avoid multiplying stack sizes twice.
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
    const payload = await this.buildItemPayload(result);
    if (!payload.length) return { converted: false, added: [], empty: true };

    // The public API accepts Token / TokenDocument objects. Preserve the corpse
    // token itself rather than creating a second chest beside it.
    if (!this.#isItemPile(tokenDocument, api)) {
      await api.turnTokensIntoItemPiles([tokenDocument]);
    }

    const refreshed = canvas?.tokens?.get?.(tokenDocument.id)?.document ?? tokenDocument;
    const added = await api.addItems(refreshed, payload);
    return { converted: true, added: added ?? [], empty: false, tokenDocument: refreshed };
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
