import { FLAGS, MODULE_ID, SETTINGS } from "../constants.mjs";
import { normalizeActiveEffectSource, normalizeItemSourceForDnd5e6 } from "../utils/dnd5e-data.mjs";
import { forcedDeletionMap } from "../utils/foundry-data.mjs";
import { CompendiumService } from "./compendium-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { RecipeService } from "./recipe-service.mjs";

const PRODUCT_SOURCE_VERSION = 1;
const PRODUCTS_PACK_NAME = "crafting-core-products";
const PRODUCTS_PACK_LABEL = "Crafting Core — Products";
const PRODUCTS_PACK_ID = `world.${PRODUCTS_PACK_NAME}`;
const LINKED_FOLDER_KEY = "linked-products";
const LINKED_FOLDER_NAME = "Linked Products";

const STATUS = Object.freeze({
  SYNCED: "synced",
  UPDATED: "updated",
  SOURCE_MISSING: "sourceMissing",
  NEEDS_REVIEW: "needsReview"
});

function clone(value) { return foundry.utils.deepClone(value); }
function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function valuesOf(value) {
  if (value instanceof Map) return [...value.values()];
  if (Array.isArray(value)) return [...value];
  if (value?.values instanceof Function) { try { return [...value.values()]; } catch (_) { /* noop */ } }
  return value && typeof value === "object" ? Object.values(value) : [];
}

function hashValue(value) {
  const canonicalize = input => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (!input || typeof input !== "object") return input;
    const out = {};
    for (const key of Object.keys(input).sort()) {
      if (["_id", "sort"].includes(key)) continue;
      out[key] = canonicalize(input[key]);
    }
    return out;
  };
  const text = JSON.stringify(canonicalize(value));
  let hash = 14695981039346656037n;
  const prime = 1099511628211n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

async function safeFromUuid(uuid) {
  const value = String(uuid ?? "").trim();
  if (!value) return null;
  try {
    const doc = await fromUuid(value);
    return doc instanceof Item ? doc : null;
  } catch (_) {
    return null;
  }
}

export class ProductSourceService {
  static STATUS = STATUS;

  static registerSettings() {
    game.settings.register(MODULE_ID, SETTINGS.PRODUCT_SOURCE_STATE, {
      name: "Crafting Core Product Source State",
      scope: "world",
      config: false,
      type: Object,
      default: { version: 0, lastSync: 0 }
    });
  }

  static state() {
    const stored = game.settings.get(MODULE_ID, SETTINGS.PRODUCT_SOURCE_STATE);
    const source = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
    return {
      version: Math.max(0, Number(source.version) || 0),
      lastSync: Math.max(0, Number(source.lastSync) || 0)
    };
  }

  static statusLabel(value) {
    return ({
      [STATUS.SYNCED]: "Synced",
      [STATUS.UPDATED]: "Updated",
      [STATUS.SOURCE_MISSING]: "Source Missing",
      [STATUS.NEEDS_REVIEW]: "Needs Review"
    })[String(value)] ?? "Synced";
  }

  static identityFingerprint(itemOrData) {
    if (!itemOrData) return "";
    const raw = itemOrData.toObject?.(true) ?? clone(itemOrData);
    const system = raw?.system ?? {};
    const creator = raw?.flags?.["dnd5e-item-creator"] ?? {};
    return `ccid-${hashValue({
      type: String(raw?.type ?? itemOrData.type ?? ""),
      identifier: String(system?.identifier ?? ""),
      baseItem: String(system?.type?.baseItem ?? system?.baseItem ?? ""),
      itemType: String(system?.type?.value ?? ""),
      itemSubtype: String(system?.type?.subtype ?? ""),
      publicationId: String(creator?.publicationId ?? creator?.publishedId ?? "")
    })}`;
  }

  static contentFingerprint(itemOrData) {
    if (!itemOrData) return "";
    const raw = normalizeItemSourceForDnd5e6(clone(itemOrData.toObject?.(true) ?? itemOrData));
    const system = clone(raw?.system ?? {});
    delete system.quantity;
    delete system.equipped;
    delete system.attuned;
    delete system.container;
    if (system.uses && typeof system.uses === "object") system.uses.spent = 0;
    if (system.activities && typeof system.activities === "object") {
      for (const activity of Object.values(system.activities)) {
        if (activity?.uses && typeof activity.uses === "object") activity.uses.spent = 0;
      }
    }

    const flags = clone(raw?.flags ?? {});
    const own = flags?.[MODULE_ID];
    if (own && typeof own === "object") {
      for (const key of [
        FLAGS.PRODUCT_MIRROR, FLAGS.PRODUCT_SOURCE_UUID, FLAGS.PRODUCT_SOURCE_NAME,
        FLAGS.PRODUCT_SOURCE_FINGERPRINT, FLAGS.PRODUCT_IDENTITY_FINGERPRINT,
        FLAGS.PRODUCT_SYNC_STATUS, FLAGS.PRODUCT_SYNCED_AT
      ]) delete own[key];
      if (!Object.keys(own).length) delete flags[MODULE_ID];
    }

    return `ccsrc-${hashValue({
      name: String(raw?.name ?? itemOrData.name ?? ""),
      img: String(raw?.img ?? itemOrData.img ?? ""),
      type: String(raw?.type ?? itemOrData.type ?? ""),
      system,
      effects: clone(raw?.effects ?? []),
      flags
    })}`;
  }

  static productsPack() {
    return CompendiumService.findWorldPack(PRODUCTS_PACK_NAME);
  }

  static async ensureProductsPack() {
    const pack = await CompendiumService.ensureWorldItemPack({ name: PRODUCTS_PACK_NAME, label: PRODUCTS_PACK_LABEL });
    await CompendiumService.ensurePackFolders(pack, [{ key: LINKED_FOLDER_KEY, name: LINKED_FOLDER_NAME }]);
    return pack;
  }

  static #sourceUuidFromFallback(item) {
    if (!item) return "";
    const generic = String(item.getFlag?.(MODULE_ID, FLAGS.PRODUCT_SOURCE_UUID) ?? "");
    if (generic) return generic;

    const curatedKind = String(item.getFlag?.(MODULE_ID, FLAGS.CURATED_KIND) ?? "");
    const canonical = String(item.getFlag?.(MODULE_ID, FLAGS.PRODUCT_CANONICAL_SOURCE) ?? "");
    const fixedResistance = String(item.getFlag?.(MODULE_ID, "fixedResistance") ?? "");
    if (canonical && curatedKind === "alchemy-product" && !fixedResistance) return canonical;
    return String(item.uuid ?? "");
  }

  static #snapshotData(itemOrData) {
    if (!itemOrData) return null;
    const data = normalizeItemSourceForDnd5e6(clone(itemOrData.toObject?.(true) ?? itemOrData));
    const own = data.flags?.[MODULE_ID];
    if (own && typeof own === "object") {
      const wasMirror = Boolean(own[FLAGS.PRODUCT_MIRROR]);
      const isCurated = Boolean(own[FLAGS.CURATED]);
      for (const key of [
        FLAGS.PRODUCT_MIRROR, FLAGS.PRODUCT_SOURCE_UUID, FLAGS.PRODUCT_SOURCE_NAME,
        FLAGS.PRODUCT_SOURCE_FINGERPRINT, FLAGS.PRODUCT_IDENTITY_FINGERPRINT,
        FLAGS.PRODUCT_SYNC_STATUS, FLAGS.PRODUCT_SYNCED_AT
      ]) delete own[key];
      if (wasMirror && !isCurated) {
        delete own[FLAGS.PRODUCT];
        delete own[FLAGS.PRODUCT_MANAGED];
        delete own[FLAGS.PRODUCT_ID];
      }
      if (!Object.keys(own).length) delete data.flags[MODULE_ID];
    }
    if (data.flags && !Object.keys(data.flags).length) delete data.flags;
    return data;
  }

  static #finalizeResult(original, next, status) {
    const before = clone(original ?? {});
    const after = clone(next ?? {});
    delete before.lastSyncedAt;
    delete after.lastSyncedAt;
    const changed = !sameValue(before, after);
    next.lastSyncedAt = changed ? Date.now() : Math.max(0, Number(original?.lastSyncedAt) || 0);
    return { result: RecipeService.normalize({ result: next }).result, changed, status };
  }

  static #referenceFrom(source, fallback, quantity=1, status=STATUS.SYNCED) {
    const sourceDoc = source ?? fallback;
    const fallbackDoc = fallback ?? source;
    if (!sourceDoc && !fallbackDoc) return null;
    const sourceUuid = String(sourceDoc?.uuid ?? this.#sourceUuidFromFallback(fallbackDoc) ?? "");
    const fallbackUuid = String(fallbackDoc?.uuid ?? "");
    const snapshotDoc = fallbackDoc ?? sourceDoc;
    return {
      uuid: sourceUuid || fallbackUuid,
      sourceUuid: sourceUuid || fallbackUuid,
      fallbackUuid: fallbackUuid || sourceUuid,
      name: String(snapshotDoc?.name ?? sourceDoc?.name ?? "Item"),
      img: String(snapshotDoc?.img ?? sourceDoc?.img ?? "icons/svg/item-bag.svg"),
      type: String(snapshotDoc?.type ?? sourceDoc?.type ?? ""),
      identifier: String(snapshotDoc?.system?.identifier ?? sourceDoc?.system?.identifier ?? ""),
      quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
      sourceFingerprint: this.contentFingerprint(sourceDoc ?? snapshotDoc),
      sourceIdentityFingerprint: this.identityFingerprint(sourceDoc ?? snapshotDoc),
      syncStatus: status,
      lastSyncedAt: Date.now(),
      snapshot: this.#snapshotData(snapshotDoc)
    };
  }

  static async referenceForItem(item, quantity=1) {
    if (!(item instanceof Item)) throw new Error("Crafting Core could not resolve the Product Item.");

    if (item.pack === PRODUCTS_PACK_ID) {
      const sourceUuid = this.#sourceUuidFromFallback(item);
      const source = sourceUuid && sourceUuid !== item.uuid ? await safeFromUuid(sourceUuid) : item;
      const status = source ? STATUS.SYNCED : STATUS.SOURCE_MISSING;
      const result = this.#referenceFrom(source ?? item, item, quantity, status);
      if (!source && sourceUuid) result.sourceUuid = sourceUuid;
      return result;
    }

    const sourceUuid = String(item.uuid ?? "");
    const fallback = await this.#ensureMirror(item, { sourceUuid });
    return this.#referenceFrom(item, fallback, quantity, STATUS.SYNCED);
  }

  static async ensureRecipeResult(recipe) {
    const normalized = RecipeService.normalize(clone(recipe ?? {}));
    if (!normalized.result) return normalized;
    const synced = await this.synchronizeResult(normalized.result, { createFallback: true });
    normalized.result = synced.result;
    return RecipeService.normalize(normalized);
  }

  static async resolveResult(result, { preferSnapshot=false }={}) {
    const normalized = this.#normalizeResultLink(result);
    if (!normalized) return { item: null, data: null, uuid: "", usedFallback: false, status: STATUS.SOURCE_MISSING };

    if (preferSnapshot && normalized.snapshot) {
      return {
        item: null,
        data: this.#snapshotData(normalized.snapshot),
        uuid: String(normalized.fallbackUuid || normalized.sourceUuid || normalized.uuid || ""),
        usedFallback: true,
        status: String(normalized.syncStatus || STATUS.SYNCED)
      };
    }

    const source = await safeFromUuid(normalized.sourceUuid);
    const fallback = await safeFromUuid(normalized.fallbackUuid);
    const storedIdentity = String(normalized.sourceIdentityFingerprint || fallback?.getFlag?.(MODULE_ID, FLAGS.PRODUCT_IDENTITY_FINGERPRINT) || "");
    const currentIdentity = source ? this.identityFingerprint(source) : "";
    const identityChanged = Boolean(source && storedIdentity && currentIdentity && storedIdentity !== currentIdentity);
    const needsReview = String(normalized.syncStatus) === STATUS.NEEDS_REVIEW || identityChanged;

    if (source && !needsReview) {
      return { item: source, data: this.#snapshotData(source), uuid: source.uuid, usedFallback: false, status: String(normalized.syncStatus || STATUS.SYNCED) };
    }
    if (fallback) {
      return { item: fallback, data: this.#snapshotData(fallback), uuid: fallback.uuid, usedFallback: true, status: needsReview ? STATUS.NEEDS_REVIEW : STATUS.SOURCE_MISSING };
    }
    if (normalized.snapshot) {
      return {
        item: null,
        data: this.#snapshotData(normalized.snapshot),
        uuid: String(normalized.fallbackUuid || normalized.sourceUuid || normalized.uuid || ""),
        usedFallback: true,
        status: needsReview ? STATUS.NEEDS_REVIEW : STATUS.SOURCE_MISSING
      };
    }
    throw new Error(`Result Item not found: ${normalized.sourceUuid || normalized.fallbackUuid || normalized.uuid || "unknown"}`);
  }

  static async freezeResult(result) {
    const resolved = await this.resolveResult(result);
    if (!resolved.data) throw new Error("The Recipe result could not be resolved.");
    return {
      data: normalizeItemSourceForDnd5e6(clone(resolved.data)),
      sourceUuid: String(result?.sourceUuid || resolved.uuid || result?.uuid || ""),
      status: resolved.status,
      usedFallback: resolved.usedFallback
    };
  }

  static async synchronizeResult(result, { createFallback=true }={}) {
    const original = this.#normalizeResultLink(result);
    if (!original) return { result: null, changed: false, status: STATUS.SOURCE_MISSING };
    const next = clone(original);

    let fallback = await safeFromUuid(next.fallbackUuid);
    let source = null;

    // v0.5.7b migration rule: legacy result.uuid is the exact Item definition selected by
    // the GM. Legacy sourceUuid is provenance/canonical identity and MUST NOT silently become
    // the new mother Product for custom derivatives. Promote the exact UUID to sourceUuid.
    // Curated Products are the special case: their existing Products-pack document is already
    // the persistent fallback and may explicitly identify a canonical SRD mother source.
    if (!next.fallbackUuid) {
      const legacyExactUuid = String(next.uuid || next.sourceUuid || "");
      const legacyDoc = await safeFromUuid(legacyExactUuid);
      if (legacyDoc?.pack === PRODUCTS_PACK_ID) {
        fallback = legacyDoc;
        next.fallbackUuid = legacyDoc.uuid;
        const migratedSourceUuid = this.#sourceUuidFromFallback(legacyDoc);
        next.sourceUuid = migratedSourceUuid || legacyDoc.uuid;
        source = next.sourceUuid === legacyDoc.uuid ? legacyDoc : await safeFromUuid(next.sourceUuid);
      } else {
        next.sourceUuid = legacyExactUuid;
        source = legacyDoc;
      }
    } else {
      source = await safeFromUuid(next.sourceUuid);
    }

    if (!source && next.sourceUuid) source = await safeFromUuid(next.sourceUuid);

    if (!fallback && createFallback) {
      if (source) fallback = await this.#ensureMirror(source, { sourceUuid: next.sourceUuid || source.uuid });
      else if (next.snapshot) fallback = await this.#ensureMirrorFromSnapshot(next.snapshot, { sourceUuid: next.sourceUuid || next.uuid || "" });
      if (fallback) next.fallbackUuid = fallback.uuid;
    }

    if (!next.sourceUuid) {
      if (source) next.sourceUuid = source.uuid;
      else if (fallback) next.sourceUuid = this.#sourceUuidFromFallback(fallback) || fallback.uuid;
      else next.sourceUuid = String(next.uuid || "");
    }
    if (!next.fallbackUuid && fallback) next.fallbackUuid = fallback.uuid;
    if (!next.uuid) next.uuid = next.sourceUuid || next.fallbackUuid;

    const storedIdentity = String(next.sourceIdentityFingerprint || fallback?.getFlag?.(MODULE_ID, FLAGS.PRODUCT_IDENTITY_FINGERPRINT) || "");
    const storedContent = String(next.sourceFingerprint || fallback?.getFlag?.(MODULE_ID, FLAGS.PRODUCT_SOURCE_FINGERPRINT) || "");

    if (!source) {
      next.uuid = String(next.sourceUuid || next.fallbackUuid || next.uuid || "");
      next.syncStatus = STATUS.SOURCE_MISSING;
      if (fallback) {
        next.name = String(fallback.name ?? next.name ?? "Item");
        next.img = String(fallback.img ?? next.img ?? "icons/svg/item-bag.svg");
        next.type = String(fallback.type ?? next.type ?? "");
        next.identifier = String(fallback.system?.identifier ?? next.identifier ?? "");
        next.snapshot = this.#snapshotData(fallback);
        await this.#stampFallback(fallback, {
          sourceUuid: next.sourceUuid,
          sourceName: next.name,
          sourceFingerprint: storedContent,
          identityFingerprint: storedIdentity,
          status: STATUS.SOURCE_MISSING
        });
      }
      return this.#finalizeResult(original, next, STATUS.SOURCE_MISSING);
    }

    const currentIdentity = this.identityFingerprint(source);
    const currentContent = this.contentFingerprint(source);
    if (storedIdentity && currentIdentity && storedIdentity !== currentIdentity) {
      next.uuid = String(next.sourceUuid || source.uuid || next.fallbackUuid || next.uuid || "");
      next.syncStatus = STATUS.NEEDS_REVIEW;
      if (fallback) {
        next.snapshot = this.#snapshotData(fallback);
        await this.#stampFallback(fallback, {
          sourceUuid: next.sourceUuid,
          sourceName: source.name,
          sourceFingerprint: storedContent,
          identityFingerprint: storedIdentity,
          status: STATUS.NEEDS_REVIEW
        });
      }
      return this.#finalizeResult(original, next, STATUS.NEEDS_REVIEW);
    }

    let status = STATUS.SYNCED;
    if (!fallback && createFallback) {
      fallback = await this.#ensureMirror(source, { sourceUuid: next.sourceUuid || source.uuid });
      if (fallback) next.fallbackUuid = fallback.uuid;
    }
    if (fallback && fallback.uuid !== source.uuid) {
      const fallbackFingerprint = String(fallback.getFlag?.(MODULE_ID, FLAGS.PRODUCT_SOURCE_FINGERPRINT) ?? storedContent);
      if (!fallbackFingerprint || fallbackFingerprint !== currentContent) {
        fallback = await this.#updateMirror(fallback, source, {
          sourceUuid: next.sourceUuid || source.uuid,
          status: STATUS.UPDATED,
          identityFingerprint: currentIdentity,
          sourceFingerprint: currentContent
        });
        status = STATUS.UPDATED;
      } else {
        await this.#stampFallback(fallback, {
          sourceUuid: next.sourceUuid || source.uuid,
          sourceName: source.name,
          sourceFingerprint: currentContent,
          identityFingerprint: currentIdentity,
          status: STATUS.SYNCED
        });
      }
    } else if (fallback) {
      await this.#stampFallback(fallback, {
        sourceUuid: next.sourceUuid || source.uuid,
        sourceName: source.name,
        sourceFingerprint: currentContent,
        identityFingerprint: currentIdentity,
        status: storedContent && storedContent !== currentContent ? STATUS.UPDATED : STATUS.SYNCED
      });
      if (storedContent && storedContent !== currentContent) status = STATUS.UPDATED;
    }

    next.sourceUuid = String(next.sourceUuid || source.uuid);
    next.fallbackUuid = String(fallback?.uuid || next.fallbackUuid || source.uuid);
    next.uuid = String(next.sourceUuid || next.fallbackUuid);
    next.sourceFingerprint = currentContent;
    next.sourceIdentityFingerprint = currentIdentity;
    next.syncStatus = status;
    const presentation = fallback ?? source;
    next.name = String(presentation.name ?? source.name ?? next.name ?? "Item");
    next.img = String(presentation.img ?? source.img ?? next.img ?? "icons/svg/item-bag.svg");
    next.type = String(presentation.type ?? source.type ?? next.type ?? "");
    next.identifier = String(presentation.system?.identifier ?? source.system?.identifier ?? next.identifier ?? "");
    next.snapshot = this.#snapshotData(presentation);
    return this.#finalizeResult(original, next, status);
  }

  static async syncAll({ onProgress=null, reconcile=true }={}) {
    if (!game.user?.isGM) return { skipped: true, reason: "not-gm" };

    const previousState = this.state();
    const drafts = RecipeService.list();
    const published = await KnowledgeItemService.publishedSources();
    const total = drafts.length + published.length;
    const stats = { synced: 0, updated: 0, sourceMissing: 0, needsReview: 0, draftsUpdated: 0, publishedUpdated: 0 };
    let current = 0;

    const countStatus = status => {
      if (status === STATUS.UPDATED) stats.updated += 1;
      else if (status === STATUS.SOURCE_MISSING) stats.sourceMissing += 1;
      else if (status === STATUS.NEEDS_REVIEW) stats.needsReview += 1;
      else stats.synced += 1;
    };

    for (const recipe of drafts) {
      current += 1;
      onProgress?.({ phase: "Synchronizing Product Sources", label: recipe.name, current, total, overallCurrent: current, overallTotal: total, stats });
      if (!recipe.result) continue;
      const synced = await this.synchronizeResult(recipe.result, { createFallback: true });
      countStatus(synced.status);
      if (synced.changed) {
        const updated = clone(recipe);
        updated.result = synced.result;
        await RecipeService.save(updated);
        stats.draftsUpdated += 1;
      }
    }

    for (const record of published) {
      current += 1;
      onProgress?.({ phase: "Synchronizing Published Products", label: record.recipe?.name ?? record.item?.name ?? "Recipe", current, total, overallCurrent: current, overallTotal: total, stats });
      const recipe = RecipeService.snapshot(record.recipe);
      if (!recipe.result) continue;
      const synced = await this.synchronizeResult(recipe.result, { createFallback: true });
      countStatus(synced.status);
      if (synced.changed) {
        recipe.result = synced.result;
        const refreshed = await KnowledgeItemService.refreshPublishedRecipeDefinition(recipe, { refreshActors: false, rebuildCache: false });
        if (refreshed?.updated) stats.publishedUpdated += 1;
      }
    }

    if (published.length) await KnowledgeItemService.rebuildAuthorityCache();
    let reconciliation = null;
    if (reconcile) reconciliation = await KnowledgeItemService.reconcilePublishedKnowledge();

    await game.settings.set(MODULE_ID, SETTINGS.PRODUCT_SOURCE_STATE, { version: PRODUCT_SOURCE_VERSION, lastSync: Date.now() });
    onProgress?.({ phase: "Product Sources Complete", label: "Product source links and fallbacks are synchronized.", current: total, total, overallCurrent: total, overallTotal: total, stats });
    return { ...stats, total, reconciliation, migrated: previousState.version < PRODUCT_SOURCE_VERSION };
  }

  static async catalogContext() {
    const pack = this.productsPack();
    if (!pack) return { count: 0, rows: [], statusCounts: {} };
    const docs = await pack.getDocuments();
    const mirrors = docs.filter(item => Boolean(item.getFlag(MODULE_ID, FLAGS.PRODUCT_MIRROR)) && !item.getFlag(MODULE_ID, FLAGS.CURATED));
    const rows = mirrors.map(item => {
      const status = String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_SYNC_STATUS) ?? STATUS.SYNCED);
      return {
        name: item.name,
        img: item.img,
        sourceName: String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_NAME) ?? "External Product"),
        sourceUuid: String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_UUID) ?? ""),
        fallbackUuid: item.uuid,
        status,
        statusLabel: this.statusLabel(status)
      };
    }).sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
    const statusCounts = rows.reduce((out, row) => { out[row.status] = (out[row.status] ?? 0) + 1; return out; }, {});
    return { count: rows.length, rows, statusCounts };
  }

  static async bindExistingFallback(fallback, { source=null, status=STATUS.SYNCED }={}) {
    if (!(fallback instanceof Item)) return fallback;
    const actualSource = source instanceof Item ? source : fallback;
    await this.#stampFallback(fallback, {
      sourceUuid: actualSource.uuid,
      sourceName: actualSource.name,
      sourceFingerprint: this.contentFingerprint(actualSource),
      identityFingerprint: this.identityFingerprint(actualSource),
      status
    });
    return fallback;
  }

  static #normalizeResultLink(result) {
    if (!result || typeof result !== "object") return null;
    const next = clone(result);
    next.uuid = String(next.uuid || next.sourceUuid || next.fallbackUuid || "");
    next.sourceUuid = String(next.sourceUuid || next.uuid || "");
    next.fallbackUuid = String(next.fallbackUuid || "");
    next.sourceFingerprint = String(next.sourceFingerprint || "");
    next.sourceIdentityFingerprint = String(next.sourceIdentityFingerprint || "");
    next.syncStatus = [STATUS.SYNCED, STATUS.UPDATED, STATUS.SOURCE_MISSING, STATUS.NEEDS_REVIEW].includes(String(next.syncStatus))
      ? String(next.syncStatus)
      : "";
    next.lastSyncedAt = Math.max(0, Number(next.lastSyncedAt) || 0);
    return next;
  }

  static async #ensureMirror(source, { sourceUuid="" }={}) {
    if (!(source instanceof Item)) return null;
    if (source.pack === PRODUCTS_PACK_ID) return source;
    const pack = await this.ensureProductsPack();
    const docs = await pack.getDocuments();
    const wanted = String(sourceUuid || source.uuid);
    const existing = docs.find(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_UUID) ?? "") === wanted) ?? null;
    const currentContent = this.contentFingerprint(source);
    const currentIdentity = this.identityFingerprint(source);
    if (existing) {
      const storedIdentity = String(existing.getFlag(MODULE_ID, FLAGS.PRODUCT_IDENTITY_FINGERPRINT) ?? "");
      if (storedIdentity && storedIdentity !== currentIdentity) {
        await this.#stampFallback(existing, {
          sourceUuid: wanted,
          sourceName: source.name,
          sourceFingerprint: String(existing.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_FINGERPRINT) ?? ""),
          identityFingerprint: storedIdentity,
          status: STATUS.NEEDS_REVIEW
        });
        return existing;
      }
      const storedContent = String(existing.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_FINGERPRINT) ?? "");
      if (storedContent !== currentContent) return this.#updateMirror(existing, source, {
        sourceUuid: wanted,
        sourceFingerprint: currentContent,
        identityFingerprint: currentIdentity,
        status: STATUS.UPDATED
      });
      await this.#stampFallback(existing, {
        sourceUuid: wanted,
        sourceName: source.name,
        sourceFingerprint: currentContent,
        identityFingerprint: currentIdentity,
        status: STATUS.SYNCED
      });
      return existing;
    }

    const folders = await CompendiumService.ensurePackFolders(pack, [{ key: LINKED_FOLDER_KEY, name: LINKED_FOLDER_NAME }]);
    const folder = folders.get(LINKED_FOLDER_KEY) ?? null;
    const data = this.#mirrorSourceData(source, { folderId: folder?.id ?? null });
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      [FLAGS.PRODUCT]: true,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_MIRROR]: true,
      [FLAGS.PRODUCT_ID]: `linked-product-${hashValue(wanted).slice(0, 16)}`,
      [FLAGS.PRODUCT_SOURCE_UUID]: wanted,
      [FLAGS.PRODUCT_SOURCE_NAME]: source.name,
      [FLAGS.PRODUCT_SOURCE_FINGERPRINT]: currentContent,
      [FLAGS.PRODUCT_IDENTITY_FINGERPRINT]: currentIdentity,
      [FLAGS.PRODUCT_SYNC_STATUS]: STATUS.SYNCED,
      [FLAGS.PRODUCT_SYNCED_AT]: Date.now()
    };
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const [created] = await ItemClass.createDocuments([data], { pack: pack.collection, fromCompendium: Boolean(source.pack) });
      if (!created) throw new Error(`Crafting Core could not create fallback Product ${source.name}.`);
      return await pack.getDocument(created.id) ?? created;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #ensureMirrorFromSnapshot(snapshot, { sourceUuid="" }={}) {
    const pack = await this.ensureProductsPack();
    const docs = await pack.getDocuments();
    const wanted = String(sourceUuid || "");
    if (wanted) {
      const existing = docs.find(item => String(item.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_UUID) ?? "") === wanted) ?? null;
      if (existing) return existing;
    }
    const folders = await CompendiumService.ensurePackFolders(pack, [{ key: LINKED_FOLDER_KEY, name: LINKED_FOLDER_NAME }]);
    const folder = folders.get(LINKED_FOLDER_KEY) ?? null;
    const data = normalizeItemSourceForDnd5e6(clone(snapshot));
    delete data._id;
    delete data.ownership;
    delete data.sort;
    data.folder = folder?.id ?? null;
    const currentContent = this.contentFingerprint(data);
    const currentIdentity = this.identityFingerprint(data);
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      [FLAGS.PRODUCT]: true,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_MIRROR]: true,
      [FLAGS.PRODUCT_ID]: `linked-product-${hashValue(wanted || currentContent).slice(0, 16)}`,
      [FLAGS.PRODUCT_SOURCE_UUID]: wanted,
      [FLAGS.PRODUCT_SOURCE_NAME]: String(data.name ?? "Legacy Product"),
      [FLAGS.PRODUCT_SOURCE_FINGERPRINT]: currentContent,
      [FLAGS.PRODUCT_IDENTITY_FINGERPRINT]: currentIdentity,
      [FLAGS.PRODUCT_SYNC_STATUS]: STATUS.SOURCE_MISSING,
      [FLAGS.PRODUCT_SYNCED_AT]: Date.now()
    };
    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const [created] = await ItemClass.createDocuments([data], { pack: pack.collection });
      if (!created) throw new Error(`Crafting Core could not preserve fallback Product ${data.name ?? "Item"}.`);
      return await pack.getDocument(created.id) ?? created;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static #mirrorSourceData(source, { folderId=null }={}) {
    let data;
    if (source.pack && game.items?.fromCompendium instanceof Function) {
      data = game.items.fromCompendium(source, { keepId: false, clearSort: true, clearOwnership: true });
    } else data = source.toObject(true);
    data = normalizeItemSourceForDnd5e6(clone(data));
    delete data._id;
    delete data.ownership;
    delete data.sort;
    data.folder = folderId;
    return data;
  }

  static async #updateMirror(fallback, source, { sourceUuid, status, identityFingerprint, sourceFingerprint }) {
    if (!(fallback instanceof Item) || !(source instanceof Item)) return fallback;
    if (fallback.uuid === source.uuid) {
      await this.#stampFallback(fallback, {
        sourceUuid: sourceUuid || source.uuid,
        sourceName: source.name,
        sourceFingerprint,
        identityFingerprint,
        status
      });
      return fallback;
    }

    // Curated libraries own suppression semantics for deletion. Never refresh one of their
    // Products with delete/create, because their delete hooks intentionally interpret that
    // as a GM suppressing the Product. Update embedded data in place instead.
    if (fallback.getFlag?.(MODULE_ID, FLAGS.CURATED)) {
      return this.#updateCuratedMirror(fallback, source, { sourceUuid, status, identityFingerprint, sourceFingerprint });
    }

    const pack = game.packs.get(fallback.pack);
    if (!pack) return fallback;
    const data = this.#mirrorSourceData(source, { folderId: fallback.folder?.id ?? fallback.folder ?? null });
    data._id = fallback.id;
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      ...(clone(fallback.flags?.[MODULE_ID] ?? {})),
      [FLAGS.PRODUCT]: true,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_MIRROR]: true,
      [FLAGS.PRODUCT_SOURCE_UUID]: String(sourceUuid || source.uuid),
      [FLAGS.PRODUCT_SOURCE_NAME]: source.name,
      [FLAGS.PRODUCT_SOURCE_FINGERPRINT]: sourceFingerprint,
      [FLAGS.PRODUCT_IDENTITY_FINGERPRINT]: identityFingerprint,
      [FLAGS.PRODUCT_SYNC_STATUS]: status,
      [FLAGS.PRODUCT_SYNCED_AT]: Date.now()
    };

    const ItemClass = CONFIG.Item.documentClass ?? Item.implementation ?? Item;
    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      // Recreate the mirror in place. This preserves the fallback UUID while allowing D&D5e
      // to rebuild Activities/embedded Effects from the current mother Item definition.
      await fallback.delete({ render: false });
      const [created] = await ItemClass.createDocuments([data], {
        pack: pack.collection,
        fromCompendium: Boolean(source.pack),
        keepId: true
      });
      if (!created) throw new Error(`Crafting Core could not refresh fallback Product ${source.name}.`);
      return await pack.getDocument(created.id) ?? created;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #updateCuratedMirror(fallback, source, { sourceUuid, status, identityFingerprint, sourceFingerprint }) {
    const pack = game.packs.get(fallback.pack);
    if (!pack) return fallback;

    const data = this.#mirrorSourceData(source, { folderId: fallback.folder?.id ?? fallback.folder ?? null });
    const desiredEffects = (data.effects ?? []).map(effect => normalizeActiveEffectSource(clone(effect)));
    const desiredActivities = clone(data.system?.activities ?? {});
    delete data.effects;
    if (data.system) delete data.system.activities;
    delete data._id;
    delete data.ownership;
    delete data.sort;

    // Preserve the curated identity/state flags while refreshing the canonical Item body.
    data.flags ??= {};
    data.flags[MODULE_ID] = {
      ...(data.flags[MODULE_ID] ?? {}),
      ...(clone(fallback.flags?.[MODULE_ID] ?? {})),
      [FLAGS.PRODUCT]: true,
      [FLAGS.PRODUCT_MANAGED]: true,
      [FLAGS.PRODUCT_MIRROR]: true,
      [FLAGS.PRODUCT_SOURCE_UUID]: String(sourceUuid || source.uuid),
      [FLAGS.PRODUCT_SOURCE_NAME]: source.name,
      [FLAGS.PRODUCT_SOURCE_FINGERPRINT]: sourceFingerprint,
      [FLAGS.PRODUCT_IDENTITY_FINGERPRINT]: identityFingerprint,
      [FLAGS.PRODUCT_SYNC_STATUS]: status,
      [FLAGS.PRODUCT_SYNCED_AT]: Date.now()
    };

    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const currentEffectIds = valuesOf(fallback.effects).map(effect => effect?.id ?? effect?._id).filter(Boolean);
      if (currentEffectIds.length) await fallback.deleteEmbeddedDocuments("ActiveEffect", currentEffectIds, { render: false });

      await fallback.update(data, { render: false });

      const currentActivityIds = valuesOf(fallback.system?.activities).map(activity => activity?.id ?? activity?._id).filter(Boolean);
      if (currentActivityIds.length) {
        await fallback.update({ "system.activities": forcedDeletionMap(currentActivityIds) }, { render: false });
      }
      if (Object.keys(desiredActivities).length) {
        await fallback.update({ "system.activities": desiredActivities }, { render: false });
      }
      if (desiredEffects.length) {
        await fallback.createEmbeddedDocuments("ActiveEffect", desiredEffects, { keepId: true, render: false });
      }
      return await pack.getDocument(fallback.id) ?? fallback;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }

  static async #stampFallback(fallback, { sourceUuid, sourceName, sourceFingerprint, identityFingerprint, status }) {
    if (!(fallback instanceof Item)) return fallback;
    const expected = {
      product: true,
      managed: true,
      mirror: true,
      sourceUuid: String(sourceUuid || fallback.uuid),
      sourceName: String(sourceName || fallback.name || "Product"),
      sourceFingerprint: String(sourceFingerprint || ""),
      identityFingerprint: String(identityFingerprint || ""),
      status: String(status || STATUS.SYNCED)
    };
    const same = Boolean(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT)) === expected.product
      && Boolean(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_MANAGED)) === expected.managed
      && Boolean(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_MIRROR)) === expected.mirror
      && String(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_UUID) ?? "") === expected.sourceUuid
      && String(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_NAME) ?? "") === expected.sourceName
      && String(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_SOURCE_FINGERPRINT) ?? "") === expected.sourceFingerprint
      && String(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_IDENTITY_FINGERPRINT) ?? "") === expected.identityFingerprint
      && String(fallback.getFlag(MODULE_ID, FLAGS.PRODUCT_SYNC_STATUS) ?? "") === expected.status;
    if (same) return fallback;

    const update = {
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT}`]: true,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_MANAGED}`]: true,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_MIRROR}`]: true,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_SOURCE_UUID}`]: expected.sourceUuid,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_SOURCE_NAME}`]: expected.sourceName,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_SOURCE_FINGERPRINT}`]: expected.sourceFingerprint,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_IDENTITY_FINGERPRINT}`]: expected.identityFingerprint,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_SYNC_STATUS}`]: expected.status,
      [`flags.${MODULE_ID}.${FLAGS.PRODUCT_SYNCED_AT}`]: Date.now()
    };
    await fallback.update(update, { render: false });
    return fallback;
  }
}
