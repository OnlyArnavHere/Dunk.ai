/**
 * Resolutions remembered across runs, per (part number, package, lcsc).
 *
 * Stage B queries a live catalogue service. The same query has resolved on one
 * run and returned an unrelated part on the next, so a part that once passed
 * every gate is stored with its imported source and reused. Only catalogue
 * resolutions (tiers 1-4, with an imported symbol) are cached; a synthesised
 * footprint is not — it is cheap to redo and should improve as the table does.
 *
 * Location: $DUNKAI_DESIGNER_CACHE, else ~/.cache/dunkai-designer/resolutions.
 * `--no-cache` bypasses it.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseImportedChip } from "./footprint.mjs"

const ROOT = process.env.DUNKAI_DESIGNER_CACHE || path.join(os.homedir(), ".cache", "dunkai-designer", "resolutions")
const VERSION = 1

const keyOf = (c) =>
  [c.part_number, c.package, c.lcsc ?? ""].join("__").replace(/[^A-Za-z0-9_.-]+/g, "_").slice(0, 180)

export async function readCached(component, workdir) {
  let entry
  try {
    entry = JSON.parse(await readFile(path.join(ROOT, `${keyOf(component)}.json`), "utf-8"))
  } catch {
    return null
  }
  if (entry.version !== VERSION || !entry.importName || !entry.importSource) return null
  const dir = path.join(workdir, "imports")
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, `${entry.importName}.tsx`), entry.importSource, "utf-8")
  return {
    ...entry.result,
    chip: parseImportedChip(entry.importSource),
    tried: [{ tier: entry.result.tier, query: "cache", reason: null }],
    fromCache: true,
  }
}

export async function writeCached(component, result, workdir) {
  const importName = result.chip?.exportName
  if (!importName) return
  const importSource = await readFile(path.join(workdir, "imports", `${importName}.tsx`), "utf-8")
  const { component: _c, chip: _chip, tried: _t, ...rest } = result
  await mkdir(ROOT, { recursive: true })
  await writeFile(
    path.join(ROOT, `${keyOf(component)}.json`),
    JSON.stringify({ version: VERSION, importName, importSource, result: rest }, null, 2),
    "utf-8"
  )
}
