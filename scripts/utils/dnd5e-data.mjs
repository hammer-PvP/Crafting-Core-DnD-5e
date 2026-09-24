/**
 * Small D&D5e 6.x data-contract helpers.
 * Crafting Core keeps its own single-rarity philosophy; D&D5e 6.x persists physical
 * Item rarity as a SetField at system.rarities.
 */
export function rarityValues(system={}) {
  const value = system?.rarities;
  if (value instanceof Set) return [...value].map(String).filter(Boolean);
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (value?.values instanceof Function) {
    try { return [...value.values()].map(String).filter(Boolean); } catch (_) { /* fall through */ }
  }
  if (value && typeof value === "object") return Object.values(value).map(String).filter(Boolean);

  // Compatibility for Crafting Core snapshots saved while the World was on D&D5e 5.3.3.
  const legacy = String(system?.rarity ?? "").trim();
  return legacy ? [legacy] : [];
}

export function primaryRarity(system={}) {
  return rarityValues(system)[0] ?? "";
}

export function rarityArray(rarity="") {
  const value = String(rarity ?? "").trim();
  return value ? [value] : [];
}

/**
 * Normalize an Item source/snapshot to the D&D5e 6.x persisted rarity contract.
 * Mutates and returns the supplied source object.
 */
export function normalizeItemRaritySource(source) {
  if (!source?.system || typeof source.system !== "object") return source;
  const hasCurrent = Object.prototype.hasOwnProperty.call(source.system, "rarities");
  const hasLegacy = Object.prototype.hasOwnProperty.call(source.system, "rarity");
  if (!hasCurrent && !hasLegacy) return source;
  const values = rarityValues(source.system);
  source.system.rarities = values;
  delete source.system.rarity;
  return source;
}

/**
 * D&D5e 6.0 moved Actor movement speed fields beneath movement.speeds.
 * The system still provides temporary shims for the old fields, but persisted
 * ActiveEffect writes should target the canonical 6.x paths.
 */
export function normalizeActiveEffectChange(change) {
  if (!change || typeof change !== "object") return change;
  const key = String(change.key ?? "");
  if (key === "system.attributes.movement.speed") {
    change.key = "system.attributes.movement.speeds.walk";
    return change;
  }
  const match = key.match(/^system\.attributes\.movement\.(walk|fly|swim|climb|burrow|jump)$/);
  if (match) change.key = `system.attributes.movement.speeds.${match[1]}`;
  return change;
}

/**
 * Read ActiveEffect changes using the D&D5e 6.x TypeDataModel first, with a
 * legacy fallback for 5.3.3-era snapshots that still persisted changes at the
 * document root.
 */
export function activeEffectChanges(effectOrSource={}) {
  const source = effectOrSource?._source ?? effectOrSource?.toObject?.(true) ?? effectOrSource ?? {};
  const current = source?.system?.changes ?? effectOrSource?.system?.changes;
  if (Array.isArray(current)) return current;
  const legacy = source?.changes ?? effectOrSource?.changes;
  return Array.isArray(legacy) ? legacy : [];
}

/**
 * Normalize a serialized ActiveEffect to the D&D5e 6.x persisted TypeDataModel.
 * Only compatibility-safe structural/path migrations are performed; gameplay
 * values, modes, priorities, durations, statuses, and flags are untouched.
 */
export function normalizeActiveEffectSource(source) {
  if (!source || typeof source !== "object") return source;
  const current = Array.isArray(source.system?.changes) ? source.system.changes : null;
  const legacy = Array.isArray(source.changes) ? source.changes : null;
  if (current || legacy) {
    source.system ??= {};
    source.system.changes = (current ?? legacy ?? []).map(change => normalizeActiveEffectChange(change));
    delete source.changes;
  }
  return source;
}

/** Normalize embedded ActiveEffects inside an Item source/snapshot. */
export function normalizeItemActiveEffectsSource(source) {
  if (!source || typeof source !== "object") return source;
  if (Array.isArray(source.effects)) {
    source.effects = source.effects.map(effect => normalizeActiveEffectSource(effect));
  }
  return source;
}

/**
 * Apply all compatibility-safe persisted-source normalizations currently
 * required by Crafting Core when reusing 5.3.3-era Item snapshots on D&D5e 6.x.
 */
export function normalizeItemSourceForDnd5e6(source) {
  normalizeItemRaritySource(source);
  normalizeItemActiveEffectsSource(source);
  return source;
}
