/**
 * claude-code provider — the default generator.
 *
 * Drives the `claude` CLI in print mode. Two jobs, with deliberately different
 * permissions:
 *
 *   synthesiseFootprint  a pure question. No tools, no file access. It returns
 *                        one footprinter string, and nothing it does can touch
 *                        the project.
 *   generateProject      writes the tscircuit sources, so it needs edit rights
 *                        inside the project directory and only there.
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { note } from "../lib/events.mjs"
import {
  FOOTPRINTER_GUIDE,
  BOARD_FILE_RULES,
  PLACEMENT_RULES,
  REPAIR_RULES,
  REPAIR_PREAMBLE,
} from "./prompts.mjs"

const DEFAULT_MODEL = "claude-opus-5"
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000

/**
 * Locate the claude executable.
 *
 * Spawning the bare name "claude" with shell:true does NOT work on Windows: the
 * installer puts claude.exe in %USERPROFILE%\.local\bin, which is on the Git
 * Bash PATH but not on the PATH cmd.exe inherits, so the shell reports
 * "'claude' is not recognized as an internal or external command". Resolving an
 * absolute path lets us spawn the binary directly, which also avoids shell
 * argument escaping entirely (the prompt contains quotes and newlines).
 */
function resolveClaudeBinary() {
  const override = process.env.CLAUDE_CLI
  if (override && existsSync(override)) return override

  const names = process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"]
  const dirs = [
    ...(process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "claude"),
  ]

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (existsSync(candidate)) return candidate
    }
  }
  // Fall back to the bare name so the error names the real problem.
  return "claude"
}

let cachedBinary = null
const claudeBinary = () => (cachedBinary ??= resolveClaudeBinary())

function runClaude(args, { cwd, timeoutMs, input }) {
  return new Promise((resolve, reject) => {
    // No shell: the binary path is resolved, and the prompt argument contains
    // quotes and newlines that a shell would mangle.
    const child = spawn(claudeBinary(), args, { cwd, windowsHide: true })
    let stdout = ""
    let stderr = ""
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGTERM")
      reject(new Error(`claude timed out after ${Math.round(timeoutMs / 1000)}s`))
    }, timeoutMs)

    child.stdout.on("data", (d) => (stdout += d.toString()))
    child.stderr.on("data", (d) => (stderr += d.toString()))
    child.on("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(`could not start claude: ${err.message}`))
    })
    child.on("close", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 600)}`))
        return
      }
      resolve({ stdout, stderr })
    })

    if (input != null) {
      child.stdin.write(input)
      child.stdin.end()
    }
  })
}

/** Pull the assistant text out of --output-format json, tolerating a raw reply. */
function extractResult(stdout) {
  const text = stdout.trim()
  if (!text) return ""
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === "string") return parsed
    if (typeof parsed.result === "string") return parsed.result
    if (Array.isArray(parsed.content)) {
      return parsed.content.map((c) => c.text ?? "").join("")
    }
    return text
  } catch {
    return text
  }
}

/** Strip ``` fences a model may wrap an answer in. */
function unfence(text) {
  const fenced = String(text).match(/```(?:[a-z]*)\n([\s\S]*?)```/i)
  return (fenced ? fenced[1] : String(text)).trim()
}

export function createClaudeCodeProvider(options = {}) {
  const model = options.model ?? DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    name: "claude-code",
    model,

    /**
     * Tier 5. The catalogue has nothing that fits, so the land pattern is
     * derived from the declared package text alone.
     */
    async synthesiseFootprint(component, context = {}) {
      const families = context.families ?? []
      const prompt = [
        "You are resolving a PCB land pattern for a part that is not in the JLCPCB catalogue.",
        "",
        FOOTPRINTER_GUIDE,
        "",
        // The family token must be one footprinter actually implements. Without
        // this list a plausible-looking invention like "sot3" gets produced, and
        // "sot" is a SIX-pad builder — the 3-pad TO-92 part is "sot23_3".
        families.length
          ? `The family token MUST be one of these ${families.length} implemented builders:\n${families.join(", ")}`
          : "",
        "",
        `Part number: ${component.part_number}`,
        `Declared package: ${component.package}`,
        `Part class: ${component.part_class}`,
        "",
        context.previousError
          ? `Your previous answer was REJECTED: ${context.previousError}\nReturn a different string that compiles.`
          : "",
        "",
        "Produce a single footprinter string for this package.",
        "It must compile with @tscircuit/footprinter and produce exactly the pad",
        "count the package implies.",
        "Reply with ONLY a JSON object, no prose, no code fence:",
        '{"footprint": "<footprinter string>", "rationale": "<one short sentence>"}',
        "If the package text is too vague to place pads at all, reply:",
        '{"footprint": null, "rationale": "<why>"}',
      ]
        .filter((line) => line !== "")
        .join("\n")

      const { stdout } = await runClaude(
        [
          "-p",
          prompt,
          "--output-format",
          "json",
          "--model",
          model,
          // A question, not a task: deny anything that could touch the project.
          "--permission-mode",
          "dontAsk",
          "--allowedTools",
          "",
        ],
        { cwd: process.cwd(), timeoutMs: Math.min(timeoutMs, 5 * 60 * 1000) }
      )

      const text = unfence(extractResult(stdout))
      try {
        const parsed = JSON.parse(text)
        return { footprint: parsed.footprint ?? null, rationale: parsed.rationale ?? "" }
      } catch {
        // A bare footprinter string is still usable; anything else is not.
        const bare = text.split(/\s/)[0]
        if (/^[a-z]+\d+_/.test(bare)) return { footprint: bare, rationale: "unparsed reply" }
        return { footprint: null, rationale: `unparseable reply: ${text.slice(0, 200)}` }
      }
    },

    /**
     * Stage D. Writes the tscircuit sources into `workdir`.
     */
    async generateProject({ brief, workdir }) {
      const prompt = [
        "Write a complete tscircuit board from the design brief below.",
        "",
        "The brief is the specification. Follow it exactly: every component,",
        "every net, and every constraint it lists must appear in the board.",
        "",
        "=== DESIGN BRIEF ===",
        brief,
        "=== END BRIEF ===",
        "",
        "Write these files in the current directory:",
        "  src/board.tsx      the board: nets, components, connections",
        "  src/floorplan.ts   every pcbX/pcbY as one reviewable table",
        "  index.tsx          `import Board from './src/board'; export default Board`",
        "",
        ...BOARD_FILE_RULES,
        "",
        ...PLACEMENT_RULES,
        "",
        "Write the files. Do not ask questions and do not stop to explain.",
      ].join("\n")

      note(`  provider: claude-code (${model}) generating into ${workdir}`)

      const { stdout } = await runClaude(
        [
          "-p",
          prompt,
          "--output-format",
          "json",
          "--model",
          model,
          "--permission-mode",
          "acceptEdits",
          "--add-dir",
          workdir,
        ],
        { cwd: workdir, timeoutMs }
      )

      return { summary: extractResult(stdout).slice(0, 4000) }
    },

    /**
     * Repair pass. The evaluator's DRC messages are specific and actionable
     * ("Component U1 extends outside board boundaries by 12.93mm"), so they are
     * handed back verbatim rather than summarised.
     */
    async repair({ workdir, errors, board }) {
      const prompt = [
        "The board you generated does not pass placement checks.",
        "",
        ...REPAIR_PREAMBLE,
        "",
        "=== DRC ERRORS ===",
        errors,
        "=== END ERRORS ===",
        "",
        "=== CURRENT src/floorplan.ts ===",
        board,
        "=== END ===",
        "",
        "Fix the placement. Rules:",
        ...REPAIR_RULES,
        "",
        "Edit src/floorplan.ts (and src/board.tsx if the outline must grow).",
        "Change nothing else — the netlist is correct. Do not explain, just fix it.",
      ].join("\n")

      note(`  provider: claude-code (${model}) repairing placement`)

      const { stdout } = await runClaude(
        [
          "-p",
          prompt,
          "--output-format",
          "json",
          "--model",
          model,
          "--permission-mode",
          "acceptEdits",
          "--add-dir",
          workdir,
        ],
        { cwd: workdir, timeoutMs }
      )

      return { summary: extractResult(stdout).slice(0, 2000) }
    },
  }
}
