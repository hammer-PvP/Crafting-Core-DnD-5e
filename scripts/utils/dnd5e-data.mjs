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
