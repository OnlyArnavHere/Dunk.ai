#!/usr/bin/env node
/**
 * Board-generation eval: one fixture, one provider, one strategy -> numbers.
 *
 *   node scripts/eval.mjs --fixture build/fresh-v2 --strategy deterministic
 *   node scripts/eval.mjs --fixture build/fresh-v2 --provider groq --strategy structured
 *   node scripts/eval.mjs --fixture build/fresh-v2 --provider groq --strategy freeform
 *
 * A fixture is any earlier build directory: it holds design.normalised.json,
 * resolution.json and imports/, so Stage B (network, minutes) is skipped and
 * every run sees the exact same parts. Only Stage D varies — which is the
 * thing being compared.
 *
 *   deterministic  pins mapped in code only; questions left unanswered (no model)
 *   structured     code + the provider answering multiple-choice pin questions
 *   freeform       the provider writes board.tsx itself (the old path)
 *
 * `--reference <board.tsx>` (default: the fixture's own src/board.tsx) scores
 * pin-level agreement against a board known to be good. A fixture generated
 * by claude-code makes a strong reference, not a perfect one: agreement is
 * "matches what the best model chose", not "is electrically correct".
 *
 * Metrics, all from the built Circuit JSON or the emitted source:
 *   builds          the evaluator produced a circuit
 *   errors          DRC error elements (placement vs unconnected split out)
 *   traces          routed pcb_trace elements
 *   connected       IR net members that got a pin on the board
 *   netsRealised    IR nets (2+ resolved members) with 2+ members actually joined
 *   agreement       (ref, net) pairs whose pins match the reference board
 */

import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parseImportedChip } from "../src/lib/footprint.mjs"
import { synthesiseBrief } from "../src/stages/c-brief.mjs"
import { generateProject, generateStructured } from "../src/stages/d-generate.mjs"
import { buildOutputs } from "../src/stages/e-outputs.mjs"
import { applyStructuredFixes } from "../src/lib/structured-fixes.mjs"
import { getProvider } from "../src/providers/index.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function parseArgs(argv) {
  const args = { fixture: null, provider: null, model: undefined, strategy: "structured", reference: null, out: null }
  for (let i = 2; i < argv.length; i++) {
    const next = () => argv[++i]
    switch (argv[i]) {
      case "--fixture": args.fixture = next(); break
      case "--provider": args.provider = next(); break
      case "--model": args.model = next(); break
      case "--strategy": args.strategy = next(); break
      case "--reference": args.reference = next(); break
      case "--out": args.out = next(); break
      default: throw new Error(`unknown argument ${argv[i]}`)
    }
  }
  if (!args.fixture) throw new Error("--fixture <build dir> is required")
  if (args.strategy !== "deterministic" && !args.provider) throw new Error(`--strategy ${args.strategy} needs --provider`)
  return args
}

/** Rebuild Stage B's result from a fixture directory, without the network. */
async function loadResolution(dir, design) {
  const saved = JSON.parse(await readFile(path.join(dir, "resolution.json"), "utf-8")).resolved
  const resolutions = []
  for (const r of saved) {
    const component = design.components.find((c) => c.ref_id === r.ref_id)
    const chip = r.import_name
      ? parseImportedChip(await readFile(path.join(dir, "imports", `${r.import_name}.tsx`), "utf-8"))
      : null
    resolutions.push({ ...r, component, chip, footprinter: r.footprint, substituted: r.substituted ?? null })
  }
  const resolved = resolutions.filter((r) => r.ok)
  return {
    resolutions,
    resolved,
    unresolved: resolutions.filter((r) => !r.ok),
    placeholders: resolved.filter((r) => r.chip && r.chip.placeholderRatio > 0.5),
    substituted: resolved.filter((r) => r.substituted),
  }
}

/**
 * ref -> pinKey -> net, read back from a board.tsx (emitted or freehand).
 * Named connection keys (SDA: ...) are translated to pin keys through the
 * part's pin labels, so freehand and emitted boards compare like for like.
 */
function readConnections(boardTsx, resolution) {
  const out = {}
  const elementRe = /<([A-Za-z_][\w]*)\s+([^>]*?name=["']([^"']+)["'][\s\S]*?)\/>/g
  for (const m of boardTsx.matchAll(elementRe)) {
    const [, tag, body, ref] = m
    if (tag === "net" || tag === "board") continue
    const block = body.match(/connections=\{\{([\s\S]*?)\}\}/)
    if (!block) continue
    const chip = resolution.resolutions.find((r) => r.component?.ref_id === ref)?.chip
    for (const [, key, net] of block[1].matchAll(/["']?([\w+-]+)["']?\s*:\s*["']net\.([\w]+)["']/g)) {
      let pin = key
      if (!/^pin\d+$/.test(key) && chip) {
        pin = Object.entries(chip.pinLabels).find(([, labels]) => labels.includes(key))?.[0] ?? key
      }
      ;(out[ref] ??= {})[pin] = net
    }
  }
  return out
}

function score(design, resolution, connections, reference) {
  const resolvedRefs = new Set(resolution.resolved.map((r) => r.component.ref_id))
  const onNet = (ref, net) => Object.entries(connections[ref] ?? {}).filter(([, n]) => n === net).map(([p]) => p)

  let members = 0
  let connected = 0
  let netsTotal = 0
  let netsRealised = 0
  for (const net of design.nets) {
    const live = net.members.filter((m) => resolvedRefs.has(m.ref_id))
    let joined = 0
    for (const m of live) {
      members++
      if (onNet(m.ref_id, net.name).length) {
        connected++
        joined++
      }
    }
    if (live.length >= 2) {
      netsTotal++
      if (joined >= 2) netsRealised++
    }
  }

  let agreement = null
  if (reference) {
    let pairs = 0
    let same = 0
    for (const [ref, pins] of Object.entries(reference)) {
      const nets = new Set(Object.values(pins))
      for (const net of nets) {
        pairs++
        const want = Object.entries(pins).filter(([, n]) => n === net).map(([p]) => p).sort().join(",")
        const got = onNet(ref, net).sort().join(",")
        if (want === got) same++
      }
    }
    agreement = { pairs, same, pct: pairs ? Math.round((same / pairs) * 100) : null }
  }

  return { members, connected, netsTotal, netsRealised, agreement }
}

async function main() {
  const args = parseArgs(process.argv)
  const fixture = path.resolve(args.fixture)
  const design = JSON.parse(await readFile(path.join(fixture, "design.normalised.json"), "utf-8"))
  const resolution = await loadResolution(fixture, design)

  const label = `${path.basename(fixture)}-${args.strategy}${args.provider ? `-${args.provider}` : ""}`
  const workdir = path.resolve(args.out ?? path.join(ROOT, "build", "eval", label))
  await mkdir(workdir, { recursive: true })
  await cp(path.join(fixture, "imports"), path.join(workdir, "imports"), { recursive: true })

  const brief = synthesiseBrief(design, resolution)
  const started = Date.now()
  let structured = null

  if (args.strategy === "freeform") {
    const provider = getProvider(args.provider, { model: args.model })
    await provider.preflight?.()
    await generateProject(design, brief, provider, workdir)
  } else {
    const provider =
      args.strategy === "deterministic" ? { name: "none" } : getProvider(args.provider, { model: args.model })
    await provider.preflight?.()
    structured = await generateStructured(design, brief, resolution, provider, workdir)
  }
  const generationMs = Date.now() - started

  let outputs = null
  let buildError = null
  try {
    outputs = await buildOutputs(workdir, {})
    // The structured path's model-free fixes, exactly as the CLI applies them.
    if (structured) outputs = await applyStructuredFixes(structured, outputs, () => buildOutputs(workdir, {}))
  } catch (err) {
    buildError = err.message
  }

  const boardTsx = await readFile(path.join(workdir, "src", "board.tsx"), "utf-8").catch(() => "")
  const connections = readConnections(boardTsx, resolution)
  const referencePath = args.reference ?? path.join(fixture, "src", "board.tsx")
  const referenceTsx = await readFile(referencePath, "utf-8").catch(() => null)
  const reference = referenceTsx ? readConnections(referenceTsx, resolution) : null
  const s = score(design, resolution, connections, reference)

  const errors = outputs?.circuitJson.filter((e) => e.type.includes("error")) ?? []
  const report = {
    fixture: path.basename(fixture),
    strategy: args.strategy,
    provider: args.provider ?? "none",
    model: args.model ?? null,
    builds: Boolean(outputs),
    buildError,
    errors: errors.length,
    unconnectedErrors: errors.filter((e) => e.type.startsWith("pcb_port_not_connected")).length,
    placementErrors: errors.filter((e) => e.type.includes("placement")).length,
    traces: outputs?.stats.traces ?? 0,
    connected: `${s.connected}/${s.members}`,
    netsRealised: `${s.netsRealised}/${s.netsTotal}`,
    agreement: s.agreement ? `${s.agreement.same}/${s.agreement.pairs} (${s.agreement.pct}%)` : null,
    board: structured ? `${structured.size.widthMm}x${structured.size.heightMm}mm` : null,
    placedInCode: Boolean(structured?.size.placement),
    supportParts: structured?.support?.length ?? 0,
    generationMs,
    workdir: path.relative(ROOT, workdir),
  }
  await writeFile(path.join(workdir, "eval.json"), JSON.stringify(report, null, 2), "utf-8")
  process.stdout.write(JSON.stringify(report) + "\n")
}

main().catch((err) => {
  process.stderr.write(`eval failed: ${err.stack ?? err}\n`)
  process.exit(1)
})
