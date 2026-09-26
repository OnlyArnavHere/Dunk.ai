/**
 * Stage D — generation.
 *
 * The provider writes the tscircuit sources; this stage owns the contract around
 * that call: what must exist when it returns, and what counts as a usable
 * result. A provider that "succeeded" but wrote no board is a failure here, not
 * a mystery two stages later when the evaluator reports an empty circuit.
 */

import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { stage, note } from "../lib/events.mjs"

const exists = (p) => access(p).then(() => true).catch(() => false)

const REQUIRED = ["index.tsx", "src/board.tsx"]

export async function generateProject(design, brief, provider, workdir, opts = {}) {
  stage("D", "running", `provider ${provider.name}${provider.model ? ` (${provider.model})` : ""}`)

  // The brief is written to disk before the call, not after: if generation fails
  // or produces something wrong, the exact specification it was given is still
  // on disk to compare against, rather than having only existed in a process.
  const briefPath = path.join(workdir, "design-brief.md")
  await writeFile(briefPath, brief, "utf-8")

  const generation = await provider.generateProject({ design, brief, workdir, ...opts })

  const missing = []
  for (const rel of REQUIRED) {
    if (!(await exists(path.join(workdir, rel)))) missing.push(rel)
  }
  if (missing.length) {
    throw new Error(
      `provider ${provider.name} did not write: ${missing.join(", ")} ` +
        `(brief is at ${briefPath} for comparison)`
    )
  }

  const board = await readFile(path.join(workdir, "src", "board.tsx"), "utf-8")

  // Cheap structural checks. These catch a plausible-looking file that is not
  // actually a board before the evaluator has to say so in a longer way.
  const findings = []
  if (!/<board[\s>]/.test(board)) findings.push("src/board.tsx has no <board> element")
  const netCount = (board.match(/<net\s/g) ?? []).length
  if (netCount === 0) findings.push("no <net> declarations")

  if (findings.length) {
    throw new Error(`generated board is not usable: ${findings.join("; ")}`)
  }

  for (const line of String(generation?.summary ?? "").split("\n").slice(0, 6)) {
    if (line.trim()) note(`  ${line.trim()}`)
  }

  stage("D", "done", `${board.length} chars · ${netCount} net declaration(s)`)
  return { briefPath, board, generation }
}
