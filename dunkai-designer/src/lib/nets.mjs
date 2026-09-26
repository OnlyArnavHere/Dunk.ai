/**
 * Deterministic guard against a silent tscircuit failure mode: a
 * `connections={{...}}` value like `"net.POWER_RAIL"` that references a net
 * name with no matching `<net name="POWER_RAIL" />` declaration.
 *
 * `@tscircuit/core`'s `createNetsFromProps` does NOT error on that mismatch —
 * it silently creates a brand new orphan net instead — so a typo'd or
 * hallucinated net name produces a board that "builds" with the affected
 * pins simply unconnected and nothing in the error output pointing at why.
 * This is the one class of net bug that has no DRC message to catch it, so
 * it is caught here with a plain regex scan before the board is even built.
 */
export function findUndeclaredNetRefs(boardTsx) {
  const declared = new Set(
    [...boardTsx.matchAll(/<net\s+name=["']([^"']+)["']/g)].map((m) => m[1])
  )
  const referenced = new Set(
    [...boardTsx.matchAll(/["']net\.([A-Za-z0-9_]+)["']/g)].map((m) => m[1])
  )
  const missing = [...referenced].filter((name) => !declared.has(name))
  return { missing, declared: [...declared] }
}
