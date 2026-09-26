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
 *
 * Authentication is the CLI's own login and nothing else. This provider never
 * reads ANTHROPIC_API_KEY, and strips it (and ANTHROPIC_AUTH_TOKEN) from the
 * child's environment: the CLI prefers an API key over the subscription login
 * when one is present, so a stray key inherited from a .env would silently move
 * every run onto API billing — or fail on an unfunded key. The `anthropic`
 * provider is the one that uses an API key, deliberately.
 *
 * Why a run can no longer look stuck
 * ----------------------------------
 * The CLI used to be asked for one JSON blob at the end (--output-format json),
 * so a Stage D call emitted nothing for up to its 20-minute timeout, and a CLI
 * that was missing, logged out or wedged looked exactly like one that was
 * working. Now:
 *
 *   - preflight() checks, before any work, that the binary exists and that
 *     `claude auth status` reports a login, and fails in seconds if not;
 *   - the CLI streams its events (stream-json), which drive a heartbeat on the
 *     stage — "claude-code working · 2m 30s · Write src/board.tsx" — and
 *   - an idle watchdog kills the process with a clear error if it produces no
 *     event at all for CLAUDE_CODE_IDLE_TIMEOUT_MS (default 5 minutes).
 */

import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { note, stage } from "../lib/events.mjs"
import {
  FOOTPRINTER_GUIDE,
  BOARD_FILE_RULES,
  PLACEMENT_RULES,
  REPAIR_RULES,
  REPAIR_PREAMBLE,
} from "./prompts.mjs"

const DEFAULT_MODEL = "claude-opus-5"
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000
/** No stream event for this long means the CLI is stuck, not thinking. */
const IDLE_TIMEOUT_MS = Number(process.env.CLAUDE_CODE_IDLE_TIMEOUT_MS) || 5 * 60 * 1000
const HEARTBEAT_MS = 30 * 1000
const AUTH_CHECK_TIMEOUT_MS = 30 * 1000

/** Credentials that would override the CLI's own login if inherited. */
const API_CREDENTIAL_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"]

function cliEnv() {
  const env = { ...process.env }
  for (const name of API_CREDENTIAL_VARS) delete env[name]
  return env
}

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
      if (existsSync(candidate)) return { path: candidate, searched: dirs }
    }
  }
  return { path: null, searched: dirs }
}

let cachedBinary = null
const locateClaude = () => (cachedBinary ??= resolveClaudeBinary())

const INSTALL_HINT =
  "Install Claude Code (https://docs.anthropic.com/en/docs/claude-code) and sign in by running `claude` once, " +
  "or set CLAUDE_CLI to the full path of the claude executable."

function claudeBinary() {
  const found = locateClaude()
  if (!found.path) {
    throw new Error(
      `claude-code provider: the Claude Code CLI was not found (looked on PATH and in ` +
        `${path.join(os.homedir(), ".local", "bin")}). ${INSTALL_HINT}`
    )
  }
  return found.path
}

let preflightDone = null

/**
 * Fail in seconds, before any design work, if the CLI cannot run a job:
 * missing binary, or installed but not logged in. `claude auth status` exits
 * non-zero and reports `loggedIn: false` when there is no login.
 */
function preflight() {
  return (preflightDone ??= Promise.resolve().then(() => {
    const binary = claudeBinary()
    const check = spawnSync(binary, ["auth", "status"], {
      env: cliEnv(),
      encoding: "utf-8",
      timeout: AUTH_CHECK_TIMEOUT_MS,
      windowsHide: true,
    })
    if (check.error) {
      if (check.error.code === "ETIMEDOUT") {
        throw new Error(
          `claude-code provider: \`claude auth status\` did not answer within ${AUTH_CHECK_TIMEOUT_MS / 1000}s — ` +
            `the CLI at ${binary} appears to be hanging. Run it in a terminal to see why.`
        )
      }
      throw new Error(`claude-code provider: could not run ${binary}: ${check.error.message}. ${INSTALL_HINT}`)
    }

    let status = null
    try {
      status = JSON.parse(check.stdout)
    } catch {
      // An older CLI without `auth status` JSON: nothing to judge by. The run
      // proceeds, and an auth failure still surfaces as the CLI's own error.
      note(`  claude-code: could not read \`claude auth status\` (${(check.stdout || check.stderr).trim().slice(0, 120)}); skipping the login check`)
      return
    }
    if (!status?.loggedIn) {
      throw new Error(
        `claude-code provider: the Claude Code CLI at ${binary} is installed but not logged in. ` +
          "Run `claude` in a terminal and sign in with /login, then retry. " +
          "(This provider uses the CLI's own login and never an ANTHROPIC_API_KEY.)"
      )
    }
    note(`  claude-code: ${binary} logged in via ${status.authMethod ?? "unknown method"}`)
  }))
}

const formatElapsed = (ms) => {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`
}

/** A short "what is it doing" line from one stream-json event, if it says anything. */
function describeEvent(event) {
  if (event.type !== "assistant") return null
  for (const block of event.message?.content ?? []) {
    if (block.type === "tool_use") {
      const input = block.input ?? {}
      const target = input.file_path ?? input.path ?? input.command ?? input.pattern ?? ""
      return `${block.name}${target ? " " + path.basename(String(target)).slice(0, 60) : ""}`
    }
  }
  return "thinking"
}

/**
 * Run `claude -p` and resolve with the final result text.
 *
 * `--output-format stream-json` makes the CLI emit one event per step as it
 * happens, which is what lets a working run be told apart from a stuck one:
 * every event resets the idle watchdog and updates the heartbeat shown on
 * `stageId` (when given) for the UI.
 */
function runClaude(args, { cwd, timeoutMs, stageId, label }) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let binary
    try {
      binary = claudeBinary()
    } catch (err) {
      reject(err)
      return
    }

    // No shell: the binary path is resolved, and the prompt argument contains
    // quotes and newlines that a shell would mangle. stdin is closed because
    // nothing is ever piped in; the prompt travels as an argument.
    const child = spawn(binary, [...args, "--output-format", "stream-json", "--verbose"], {
      cwd,
      env: cliEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let buffer = ""
    let stderr = ""
    let finalEvent = null
    let lastActivity = "starting"
    let settled = false
    let idleTimer = null

    const finish = (err, value) => {
      if (settled) return
      settled = true
      clearTimeout(overallTimer)
      clearTimeout(idleTimer)
      clearInterval(heartbeat)
      if (err) {
        child.kill("SIGTERM")
        reject(err)
      } else {
        resolve(value)
      }
    }

    const armIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(
        () =>
          finish(
            new Error(
              `claude produced no output for ${formatElapsed(IDLE_TIMEOUT_MS)} ` +
                `(last activity: ${lastActivity}, ${formatElapsed(Date.now() - started)} into ${label}) — ` +
                "it appears stuck and was stopped. Set CLAUDE_CODE_IDLE_TIMEOUT_MS to allow longer silences."
            )
          ),
        IDLE_TIMEOUT_MS
      )
    }

    const overallTimer = setTimeout(
      () => finish(new Error(`claude did not finish ${label} within ${formatElapsed(timeoutMs)} (last activity: ${lastActivity})`)),
      timeoutMs
    )
    const heartbeat = setInterval(() => {
      if (stageId) stage(stageId, "running", `claude-code ${label} · ${formatElapsed(Date.now() - started)} · ${lastActivity}`)
    }, HEARTBEAT_MS)
    armIdle()

    child.stdout.on("data", (chunk) => {
      buffer += chunk.toString()
      let newline
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        armIdle()
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue // not an event; the CLI's stdout is otherwise NDJSON
        }
        if (event.type === "result") finalEvent = event
        const doing = describeEvent(event)
        if (doing) lastActivity = doing
      }
    })
    child.stderr.on("data", (d) => {
      stderr += d.toString()
      armIdle()
    })
    child.on("error", (err) => finish(new Error(`could not start claude at ${binary}: ${err.message}. ${INSTALL_HINT}`)))
    child.on("close", (code) => {
      if (finalEvent?.is_error || (code !== 0 && finalEvent)) {
        const reason = finalEvent.result || finalEvent.subtype || `exit ${code}`
        finish(new Error(`claude failed during ${label}: ${String(reason).slice(0, 600)}`))
        return
      }
      if (code !== 0) {
        finish(new Error(`claude exited ${code} during ${label}: ${(stderr || "no output").trim().slice(0, 600)}`))
        return
      }
      if (!finalEvent) {
        finish(new Error(`claude exited without a result during ${label}: ${(stderr || "no output").trim().slice(0, 600)}`))
        return
      }
      finish(null, { result: String(finalEvent.result ?? ""), elapsedMs: Date.now() - started })
    })
  })
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

    /** Missing or logged-out CLI fails here, in seconds, before any work. */
    preflight,

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

      const { result } = await runClaude(
        [
          "-p",
          prompt,
          "--model",
          model,
          // A question, not a task: deny anything that could touch the project.
          "--permission-mode",
          "dontAsk",
          "--allowedTools",
          "",
        ],
        {
          cwd: process.cwd(),
          timeoutMs: Math.min(timeoutMs, 5 * 60 * 1000),
          stageId: "B",
          label: `footprint for ${component.ref_id ?? component.part_number}`,
        }
      )

      const text = unfence(result)
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

      const { result } = await runClaude(
        [
          "-p",
          prompt,
          "--model",
          model,
          "--permission-mode",
          "acceptEdits",
          "--add-dir",
          workdir,
        ],
        { cwd: workdir, timeoutMs, stageId: "D", label: "writing the board" }
      )

      return { summary: result.slice(0, 4000) }
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

      const { result } = await runClaude(
        [
          "-p",
          prompt,
          "--model",
          model,
          "--permission-mode",
          "acceptEdits",
          "--add-dir",
          workdir,
        ],
        { cwd: workdir, timeoutMs, stageId: "E", label: "repairing placement" }
      )

      return { summary: result.slice(0, 2000) }
    },
  }
}
