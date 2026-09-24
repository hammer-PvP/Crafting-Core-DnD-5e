/**
 * Foundry VTT v14 data-update helpers.
 *
 * Foundry v14 deprecates the legacy { "-=key": null } forced-deletion syntax.
 * Crafting Core targets v14.367+, so all new update payloads use the native
 * ForcedDeletion operator instead.
 */
export function forcedDeletion() {
  const Operator = globalThis.foundry?.data?.operators?.ForcedDeletion;
  if (!(Operator instanceof Function)) {
    throw new Error("Foundry VTT ForcedDeletion operator is unavailable.");
  }
  return new Operator();
}

/**
 * Build a mapping that removes the supplied keys when deep-merged by Foundry.
 * Each key receives its own operator instance because update payloads are
 * mutable DataModel input and should not share operator objects.
 */
export function forcedDeletionMap(keys=[]) {
  const output = {};
  for (const key of keys ?? []) {
    const id = String(key ?? "");
    if (!id) continue;
    output[id] = forcedDeletion();
  }
  return output;
}
