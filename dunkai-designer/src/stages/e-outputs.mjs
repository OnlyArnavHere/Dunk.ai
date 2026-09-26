/**
 * Stage E — manufacturing outputs.
 *
 * Generalised from the Gas Leakage Detector's scripts/render.cjs, which is the
 * version of this that is known to produce a DRC-clean board. Two things are
 * carried over deliberately:
 *
 *   * the tscircuit evaluator is driven directly over an in-memory fs map rather
 *     than through `tsci build`. On Windows the CLI dynamic-imports the entry
 *     point by absolute path and dies with ERR_UNSUPPORTED_ESM_URL_SCHEME
 *     ("Received protocol 'c:'"). `tsci export` fails the same way. Running the
 *     evaluator ourselves sidesteps the CLI entirely.
 *   * error elements are counted and surfaced. A build that emits an *_error
 *     element has produced a board that should not be fabricated, and saying so
 *     is the whole point of running the checks.
 */

import { createRequire } from "node:module"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { stage, note } from "../lib/events.mjs"
import { zipSync } from "../lib/zip.mjs"

const DESIGNER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const _require = createRequire(path.join(DESIGNER_ROOT, "package.json"))

/**
 * Load a CJS entry point by FILE PATH inside the designer's own node_modules,
 * never by bare specifier.
 *
 * `require("tscircuit/dist/index.js")` is resolved through the package's
 * "exports" map, which does not publish that subpath:
 *
 *     ERR_PACKAGE_PATH_NOT_EXPORTED: Package subpath './dist/index.js' is not
 *     defined by "exports" in .../node_modules/tscircuit/package.json
 *
 * An absolute path bypasses the map, which is what the Gas Leakage Detector's
 * render.cjs does. The toolchain comes from the designer's node_modules rather
 * than the generated project's, because the project directory holds sources only.
 */
const req = (subpath) => _require(path.join(DESIGNER_ROOT, "node_modules", subpath))

const csvCell = (value) => {
  const text = value == null ? "" : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Recursively collect .ts/.tsx under `dir` into the evaluator's fs map. */
async function collect(root, dir, fsMap = {}) {
  let entries
  try {
    entries = await readdir(path.join(root, dir), { withFileTypes: true })
  } catch {
    return fsMap
  }
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) await collect(root, rel, fsMap)
    else if (/\.tsx?$/.test(entry.name)) {
      fsMap[rel] = await readFile(path.join(root, rel), "utf-8")
    }
  }
  return fsMap
}

async function writeBom(circuitJson, outDir) {
  const { formatSiUnit } = req("format-si-unit/dist/index.js")

  const valueOf = (component) => {
    for (const [field, unit] of [
      ["resistance", "Ω"],
      ["capacitance", "F"],
      ["inductance", "H"],
      ["frequency", "Hz"],
    ]) {
      const display = component[`display_${field}`]
      if (display) return display
      const raw = component[field]
      if (typeof raw === "number") return `${formatSiUnit(raw)}${unit}`
      if (typeof raw === "string") return raw
    }
    return component.display_value ?? ""
  }

  const rows = circuitJson
    .filter((e) => e.type === "source_component")
    .map((c) => [
      c.name,
      valueOf(c),
      c.ftype ?? "",
      c.manufacturer_part_number ?? "",
      c.supplier_part_numbers?.jlcpcb?.[0] ?? "",
    ])
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))

  rows.unshift(["designator", "value", "footprint", "mpn", "jlcpcb"])
  await writeFile(
    path.join(outDir, "bom.csv"),
    rows.map((r) => r.map(csvCell).join(",")).join("\n"),
    "utf-8"
  )
  return rows.length - 1
}

export async function buildOutputs(workdir, opts = {}) {
  stage("E", "running")

  const fsMap = {
    "index.tsx": await readFile(path.join(workdir, "index.tsx"), "utf-8"),
    ...(await collect(workdir, "src")),
    ...(await collect(workdir, "imports")),
  }

  const { runTscircuitCode } = req("tscircuit/dist/index.js")
  const circuitJson = await runTscircuitCode(fsMap, { mainComponentPath: "index.tsx" })

  const outDir = path.join(workdir, "dist")
  await mkdir(outDir, { recursive: true })
  await writeFile(path.join(outDir, "circuit.json"), JSON.stringify(circuitJson, null, 2), "utf-8")

  const errors = circuitJson.filter((e) => e.type.includes("error"))
  const warnings = circuitJson.filter((e) => e.type.includes("warning"))

  const svg = req("circuit-to-svg/dist/index.js")
  await writeFile(
    path.join(outDir, "schematic.svg"),
    svg.convertCircuitJsonToSchematicSvg(circuitJson),
    "utf-8"
  )
  await writeFile(path.join(outDir, "pcb.svg"), svg.convertCircuitJsonToPcbSvg(circuitJson), "utf-8")

  const bomRows = await writeBom(circuitJson, outDir)

  const pnp = req("circuit-json-to-pnp-csv/dist/index.js")
  await writeFile(
    path.join(outDir, "pick-and-place.csv"),
    pnp.convertCircuitJsonToPickAndPlaceCsv(circuitJson),
    "utf-8"
  )

  const gerber = req("circuit-json-to-gerber/dist/index.js")
  const gerberDir = path.join(outDir, "gerbers")
  await mkdir(gerberDir, { recursive: true })
  const gerberFiles = gerber.convertCircuitJsonToGerberFiles
    ? gerber.convertCircuitJsonToGerberFiles(circuitJson)
    : gerber.stringifyGerberCommandLayers(gerber.convertCircuitJsonToGerberCommands(circuitJson))
  for (const [name, contents] of Object.entries(gerberFiles)) {
    const file = /\.(gbr|drl)$/.test(name) ? name : `${name}.gbr`
    await writeFile(path.join(gerberDir, file), contents, "utf-8")
  }
  await writeFile(
    path.join(gerberDir, "plated.drl"),
    gerber.stringifyExcellonDrill(
      gerber.convertCircuitJsonToExcellonDrillCommands({ circuitJson, is_plated: true })
    ),
    "utf-8"
  )

  // Package the set as one .zip. A fabricator takes Gerbers as a single
  // archive, and a link to the *directory* is not something a browser can
  // follow -- express.static answers 301 and then 404 for a folder. See
  // lib/zip.mjs for why this is not a dependency.
  const gerberNames = (await readdir(gerberDir)).filter((n) => /\.(gbr|drl)$/.test(n)).sort()
  const gerberZip = zipSync(
    await Promise.all(
      gerberNames.map(async (name) => ({ name, data: await readFile(path.join(gerberDir, name)) }))
    )
  )
  await writeFile(path.join(outDir, "gerbers.zip"), gerberZip)
  note(`  gerbers: ${gerberNames.length} files -> gerbers.zip (${(gerberZip.length / 1024).toFixed(0)} KB)`)

  const warnCounts = {}
  for (const w of warnings) warnCounts[w.type] = (warnCounts[w.type] ?? 0) + 1
  note("  warnings:")
  for (const [type, n] of Object.entries(warnCounts).sort()) {
    note(`    ${String(n).padStart(4)}  ${type}`)
  }
  for (const e of errors) note(`  ERROR ${e.type} ${e.message ?? ""}`)

  const stats = {
    elements: circuitJson.length,
    errors: errors.length,
    warnings: warnings.length,
    bomRows,
    components: circuitJson.filter((e) => e.type === "source_component").length,
    traces: circuitJson.filter((e) => e.type === "pcb_trace").length,
    errorTypes: [...new Set(errors.map((e) => e.type))],
  }

  stage(
    "E",
    "done",
    `${stats.components} components · ${stats.traces} traces · ${bomRows} BOM lines · ` +
      `${stats.errors} error(s) · ${stats.warnings} warning(s)`
  )

  // Reported, not thrown. An errored board is still worth writing out — the SVGs
  // are how a person sees WHAT went wrong. The caller decides whether to ship it.
  if (opts.failOnError && errors.length) {
    const err = new Error(`${errors.length} DRC error element(s): ${stats.errorTypes.join(", ")}`)
    err.stats = stats
    throw err
  }

  return { circuitJson, outDir, stats }
}
