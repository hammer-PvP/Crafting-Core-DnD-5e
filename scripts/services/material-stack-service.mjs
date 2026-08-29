import { FLAGS, MODULE_ID } from "../constants.mjs";

/**
 * Forward-only stacking for Crafting Core Materials.
 * Embedded Item UUIDs are intentionally NOT identities: every Actor copy receives a new UUID.
 * Stable materialId + container context decides whether an incoming material joins an existing stack.
 */
export class MaterialStackService {
  static #queues = new Map();
  static #installed = false;

  static installHooks() {
    if (this.#installed) return;
    this.#installed = true;
    Hooks.on("createItem", (item, _options, userId) => {
      if (String(userId ?? "") !== String(game.user?.id ?? "")) return;
      if (!this.isCraftingMaterial(item)) return;
      const actor = item.parent;
      if (!(actor instanceof Actor)) return;
      // Item Piles and D&D5e may perform follow-up mutations immediately after creation.
      // Defer consolidation briefly so their transaction can finish before the incoming copy is removed.
      setTimeout(() => this.#enqueue(actor, () => this.#mergeIncomingEmbeddedItem(item)), 100);
    });
  }

  static isCraftingMaterial(itemOrData) {
    const flags = itemOrData?.flags?.[MODULE_ID] ?? {};
    const material = itemOrData?.getFlag?.(MODULE_ID, FLAGS.MATERIAL) ?? flags?.[FLAGS.MATERIAL];
    const materialId = itemOrData?.getFlag?.(MODULE_ID, FLAGS.MATERIAL_ID) ?? flags?.[FLAGS.MATERIAL_ID];
    return Boolean(material && String(materialId || ""));
  }

  static materialId(itemOrData) {
    return String(itemOrData?.getFlag?.(MODULE_ID, FLAGS.MATERIAL_ID)
      ?? itemOrData?.flags?.[MODULE_ID]?.[FLAGS.MATERIAL_ID]
      ?? "");
  }

  static containerKey(itemOrData) {
    return String(itemOrData?.system?.container ?? "");
  }

  static quantity(itemOrData) {
    return Math.max(0, Number(itemOrData?.system?.quantity) || 0);
  }

  static async createOrStack(actor, sourceData, quantity=1) {
    if (!(actor instanceof Actor)) throw new Error("Crafting Core material stacking requires an Actor.");
    const data = foundry.utils.deepClone(sourceData ?? {});
    delete data._id; delete data.folder; delete data.ownership;
    const amount = Math.max(1, Math.floor(Number(quantity) || 1));
    if (!this.isCraftingMaterial(data) || !foundry.utils.hasProperty(data, "system.quantity")) {
      if (foundry.utils.hasProperty(data, "system.quantity")) data.system.quantity = amount;
      return actor.createEmbeddedDocuments("Item", [data]);
    }

    const materialId = this.materialId(data);
    const containerKey = this.containerKey(data);
    const existing = actor.items.find(item => this.isCraftingMaterial(item)
      && this.materialId(item) === materialId
      && this.containerKey(item) === containerKey);
    if (existing) {
      const next = this.quantity(existing) + amount;
      await existing.update({ "system.quantity": next });
      return [existing];
    }

    data.system.quantity = amount;
    return actor.createEmbeddedDocuments("Item", [data]);
  }

  static #enqueue(actor, task) {
    const key = String(actor.uuid ?? actor.id ?? "actor");
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(task).catch(error => {
      console.warn(`${MODULE_ID} | Crafting material auto-stack failed.`, error);
    }).finally(() => {
      if (this.#queues.get(key) === next) this.#queues.delete(key);
    });
    this.#queues.set(key, next);
  }

  static async #mergeIncomingEmbeddedItem(incoming) {
    const actor = incoming?.parent;
    if (!(actor instanceof Actor)) return false;
    const liveIncoming = actor.items.get(incoming.id);
    if (!liveIncoming || !this.isCraftingMaterial(liveIncoming)) return false;

    const materialId = this.materialId(liveIncoming);
    const containerKey = this.containerKey(liveIncoming);
    const existing = actor.items.find(item => item.id !== liveIncoming.id
      && this.isCraftingMaterial(item)
      && this.materialId(item) === materialId
      && this.containerKey(item) === containerKey);
    if (!existing) return false;

    const incomingQty = this.quantity(liveIncoming);
    if (incomingQty <= 0) return false;
    const next = this.quantity(existing) + incomingQty;
    await existing.update({ "system.quantity": next });
    if (actor.items.has(liveIncoming.id)) await actor.deleteEmbeddedDocuments("Item", [liveIncoming.id]);
    return true;
  }
}
