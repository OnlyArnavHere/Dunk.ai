'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useWorkspaceStore, type BoardJob, type PipelineRunStatus } from '@/lib/store'
import { ArcadeWindow, WINDOW_EXIT_MS, type ArcadeNotice } from './arcade-window'

/**
 * Dunk Arcade — a mini game that is always on hand in the workspace.
 *
 *   ship ──double-click──> launching ──> open <──> minimized
 *    ▲                                    │
 *    │                                    ├── a job ends: notice over the game
 *    │                                    │     ├── follow it: switch tab, game minimized (kept)
 *    │                                    │     └── keep playing
 *    └──────── landing <── closing <──────┴── close (that game ends)
 *
 * The ship never goes away. Closing plays the arrival in reverse — the window
 * shrinks back into its corner and the battle ship turns back into the idle
 * ship — and lands on the ship again, ready for a fresh game. A job finishing
 * never ends the game either: the player is told (a notice they cannot miss, and
 * a minimized game is brought back up to show it) and then chooses.
 *
 * The arcade only READS job state from the store. It never touches the socket
 * listeners or the requests that drive a run, so nothing it does can delay or
 * swallow an ai:complete.
 */

/** Play lengths of ship-launch.gif and ship-land.gif, as printed by
 *  scripts/prepare-arcade-assets.py. */
const LAUNCH_MS = 1750
const LAND_MS = 1270

const IDLE_SHIP_SRC = '/arcade/idle-ship.gif'
const LAUNCH_SRC = '/arcade/ship-launch.gif'
const LAND_SRC = '/arcade/ship-land.gif'

/** How long the "double-click to play" hint shows when a job starts. */
const HINT_MS = 5000

// The launcher bubble. The launch and landing animations play inside the same
// bubble: all three GIFs share one crop box, so the ship transforms in place.
const BUBBLE =
  'flex h-16 w-16 select-none items-center justify-center rounded-full border border-border bg-card/90 shadow-[0_14px_50px_rgba(0,0,0,0.3)] backdrop-blur-md'

type Phase = 'ship' | 'launching' | 'open' | 'closing' | 'landing'

type Outcome = 'board-ready' | 'board-failed' | 'question' | 'design-ready' | 'failed'

interface ArcadeState {
  phase: Phase
  minimized: boolean
  /** A finished job to announce over the game, until the player responds. */
  outcome: Outcome | null
  /** Counts launches: keys each game (a fresh one per launch) and its GIF URLs. */
  game: number
}

const NODE_LABELS: Record<string, string> = {
  __start__: 'Starting workflow',
  supervisor: 'Starting workflow',
  safety: 'Checking the request',
  requirements: 'Analysing requirements',
  architecture: 'Generating architecture',
  component: 'Selecting components & building BOM',
  eda_enrichment: 'Enriching EDA data',
  pcb: 'Preparing the PCB handoff',
  validation: 'Running validation checks',
  documentation: 'Compiling documentation',
}

const OUTCOME_TAB: Record<Outcome, string> = {
  'board-ready': 'pcb',
  'board-failed': 'pcb',
  question: 'chat',
  'design-ready': 'requirements',
  failed: 'chat',
}

/**
 * How a job ended, read off the store at the moment it stopped being busy.
 * `null` means the run was abandoned rather than finished (the chat switched
 * project or started a new chat), which has nothing to announce.
 */
function outcomeOf(pipelineRun: PipelineRunStatus, boardJob: BoardJob, boardInvolved: boolean): Outcome | null {
  if (boardInvolved) {
    if (boardJob.status === 'done') return 'board-ready'
    if (boardJob.status === 'error') return 'board-failed'
  }
  switch (pipelineRun) {
    case 'question':
      return 'question'
    case 'error':
      return 'failed'
    case 'done':
      return 'design-ready'
    default:
      return null
  }
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Arcade() {
  const pipelineRun = useWorkspaceStore((s) => s.pipelineRun)
  const boardJob = useWorkspaceStore((s) => s.boardJob)
  const activeNode = useWorkspaceStore((s) => s.pipelineProgress.activeNode)
  const boardStats = useWorkspaceStore((s) => s.aiOutput?.board?.stats)
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab)

  const busy = pipelineRun === 'running' || boardJob.status === 'running'

  const [arcade, setArcade] = useState<ArcadeState>({ phase: 'ship', minimized: false, outcome: null, game: 0 })
  const [showHint, setShowHint] = useState(false)

  // Whether the current job has touched board generation, and the board job
  // object as it stood when the job began. The second catches a board that
  // failed before it ever reached `running` (its POST was refused) — a state
  // change the `running` watcher alone would never see.
  const boardInvolved = useRef(false)
  const boardJobAtStart = useRef<BoardJob | null>(null)
  const wasBusy = useRef(false)

  useEffect(() => {
    if (boardJob.status === 'running') boardInvolved.current = true
  }, [boardJob.status])

  // ---- job start / end ----------------------------------------------------------
  useEffect(() => {
    if (busy === wasBusy.current) return
    wasBusy.current = busy

    if (busy) {
      const state = useWorkspaceStore.getState()
      boardInvolved.current = state.boardJob.status === 'running'
      boardJobAtStart.current = state.boardJob
      // A notice about the previous job is stale once the next one is running.
      setArcade((a) => (a.outcome ? { ...a, outcome: null } : a))
      setShowHint(true)
      const t = window.setTimeout(() => setShowHint(false), HINT_MS)
      return () => {
        window.clearTimeout(t)
        setShowHint(false)
      }
    }

    const state = useWorkspaceStore.getState()
    const boardChanged = boardJobAtStart.current !== null && state.boardJob !== boardJobAtStart.current
    const outcome = outcomeOf(state.pipelineRun, state.boardJob, boardInvolved.current || boardChanged)
    if (!outcome) return

    // Announced only to someone in the game (or on the way into it); at the
    // ship, the chat's own message is where the result is read. A minimized
    // game is brought back up, because a notice nobody can see is a swallowed one.
    setArcade((a) => (a.phase === 'open' || a.phase === 'launching' ? { ...a, outcome, minimized: false } : a))
  }, [busy])

  /**
   * Move from one phase to the next, but only if still in the phase the caller
   * started from — a timer or animation that outlives its phase must not drag a
   * newer state backwards.
   */
  const advance = useCallback((from: Phase, to: Phase) => {
    setArcade((a) => (a.phase === from ? { ...a, phase: to } : a))
  }, [])

  const launch = useCallback(() => {
    setShowHint(false)
    setArcade((a) =>
      a.phase === 'ship'
        ? { phase: prefersReducedMotion() ? 'open' : 'launching', minimized: false, outcome: null, game: a.game + 1 }
        : a
    )
  }, [])

  // Closing ends this game and flies back to the ship, which stays.
  const close = useCallback(() => {
    setArcade((a) => (a.phase === 'open' ? { ...a, phase: 'closing', outcome: null } : a))
  }, [])

  // Go and look at the result, keeping the game: it is minimized, not closed.
  const followNotice = useCallback(() => {
    if (arcade.outcome) setActiveTab(OUTCOME_TAB[arcade.outcome])
    setArcade((a) => ({ ...a, outcome: null, minimized: true }))
  }, [arcade.outcome, setActiveTab])

  const keepPlaying = useCallback(() => setArcade((a) => ({ ...a, outcome: null })), [])

  // The window's exit is timed; the landing is driven by its GIF below.
  const phase = arcade.phase
  useEffect(() => {
    if (phase !== 'closing') return
    const t = window.setTimeout(
      () => advance('closing', prefersReducedMotion() ? 'ship' : 'landing'),
      WINDOW_EXIT_MS
    )
    return () => window.clearTimeout(t)
  }, [phase, advance])

  if (phase === 'ship') {
    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      // A keyboard cannot double-click; Enter/Space is its equivalent.
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        launch()
      }
    }
    const hint = busy ? 'Double-click to play while Dunk AI works' : 'Double-click to play'

    return (
      // The container spans the hint label too, which is invisible most of the
      // time, so only the ship itself may take clicks.
      <div className="pointer-events-none fixed bottom-[132px] right-6 z-40 flex items-center gap-3">
        <span
          aria-hidden
          className={`pointer-events-none whitespace-nowrap rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11px] text-muted-foreground shadow-md backdrop-blur-md transition-opacity duration-300 ${
            showHint ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {hint}
        </span>
        <button
          type="button"
          onDoubleClick={launch}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          title={hint}
          aria-label={`Dunk Arcade. ${hint.replace('Double-click', 'Double-click, or press Enter,')}.`}
          className={`${BUBBLE} pointer-events-auto transition-[transform,border-color] duration-200 hover:scale-105 hover:border-foreground/30 active:scale-95 animate-in fade-in-0 zoom-in-90`}
        >
          <img
            src={IDLE_SHIP_SRC}
            alt=""
            width={56}
            height={56}
            draggable={false}
            className="animate-[arcade-float_3s_ease-in-out_infinite]"
          />
        </button>
      </div>
    )
  }

  // Each play of a play-once GIF gets its own URL: browsers share one animation
  // timeline per image URL, so a second play would start on its final frame.
  if (phase === 'launching') {
    return (
      <ShipAnimation
        src={`${LAUNCH_SRC}?run=${arcade.game}`}
        durationMs={LAUNCH_MS}
        onDone={() => advance('launching', 'open')}
      />
    )
  }

  if (phase === 'landing') {
    return (
      <ShipAnimation
        src={`${LAND_SRC}?run=${arcade.game}`}
        durationMs={LAND_MS}
        onDone={() => advance('landing', 'ship')}
      />
    )
  }

  const notice = arcade.outcome ? noticeFor(arcade.outcome, boardJob.error, boardStats?.errors) : null
  const status = !busy
    ? 'Dunk AI is idle'
    : boardJob.status === 'running'
      ? boardJob.label || 'Generating board'
      : NODE_LABELS[activeNode] || 'Working'

  return (
    <ArcadeWindow
      key={arcade.game}
      minimized={arcade.minimized}
      closing={phase === 'closing'}
      notice={notice}
      working={busy}
      status={status}
      onMinimize={() => setArcade((a) => ({ ...a, minimized: true }))}
      onRestore={() => setArcade((a) => ({ ...a, minimized: false }))}
      onClose={close}
      onNoticeAction={followNotice}
      onKeepPlaying={keepPlaying}
    />
  )
}

/** Plays a play-once GIF inside the launcher bubble, then reports it is done. */
function ShipAnimation({ src, durationMs, onDone }: { src: string; durationMs: number; onDone: () => void }) {
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const [loaded, setLoaded] = useState(false)

  // Timed from load, not mount, so a slow fetch cannot cut the animation short.
  useEffect(() => {
    if (!loaded) return
    const t = window.setTimeout(() => doneRef.current(), durationMs)
    return () => window.clearTimeout(t)
  }, [loaded, durationMs])

  return (
    <div aria-hidden className={`pointer-events-none fixed bottom-[132px] right-6 z-40 ${BUBBLE}`}>
      <img
        src={src}
        alt=""
        width={56}
        height={56}
        onLoad={() => setLoaded(true)}
        // If the animation cannot load, skip it rather than strand the sequence.
        onError={() => doneRef.current()}
      />
    </div>
  )
}

function noticeFor(outcome: Outcome, boardError: string | null, drcErrors: number | undefined): ArcadeNotice {
  switch (outcome) {
    case 'board-ready':
      return {
        title: 'Your board is ready',
        body: drcErrors
          ? `Generated with ${drcErrors} design-rule error${drcErrors === 1 ? '' : 's'} — review it before fabricating.`
          : 'Schematic, layout, 3D model and manufacturing files are in the PCB tab.',
        action: 'View board',
        tone: drcErrors ? 'attention' : 'success',
      }
    case 'board-failed':
      return {
        title: 'Board generation failed',
        body: boardError ? truncate(boardError, 140) : 'The PCB tab has the details.',
        action: 'Open PCB tab',
        tone: 'error',
      }
    case 'question':
      return {
        title: 'Dunk AI has a question',
        body: 'Your requirements interview needs an answer before the design can continue.',
        action: 'Answer in chat',
        tone: 'attention',
      }
    case 'design-ready':
      return {
        title: 'Your design is ready',
        body: 'Requirements, architecture and components are ready to review.',
        action: 'Review design',
        tone: 'success',
      }
    case 'failed':
      return {
        title: 'The run hit a problem',
        body: 'The details are in the chat.',
        action: 'Open chat',
        tone: 'error',
      }
  }
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
