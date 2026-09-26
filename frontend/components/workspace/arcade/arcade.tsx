'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useWorkspaceStore, type BoardJob, type PipelineRunStatus } from '@/lib/store'
import { ArcadeWindow, WINDOW_EXIT_MS, type ArcadeNotice } from './arcade-window'

/**
 * Dunk Arcade — a mini game offered while an AI job is running.
 *
 * A "job" is one continuous stretch of work: a chat pipeline turn, the board
 * run it hands off to, or a board started by hand from the BOM tab. Each job
 * gets exactly one session:
 *
 *   ship ──double-click──> launching ──> open <──> minimized
 *     │                                   │
 *     │                                   ├── job ends: notice over the game
 *     │                                   └── close ──> closing ──> landing ──┐
 *     │                                                                       │
 *     └── job ends ─────────────────────────────────────────────> departing <─┘
 *
 * Leaving is always animated, in reverse of the arrival: the window shrinks back
 * into its corner, the battle ship turns back into the idle ship, and the bubble
 * shrinks away. After `departing` the session is gone if the job has ended, or
 * parked as `closed` if it is still running — a closed game stays closed until
 * the next job, so the exit is a goodbye, not an offer to reopen.
 *
 * The arcade only READS job state from the store. It never touches the socket
 * listeners or the requests that drive the run, so nothing it does can delay
 * or swallow an ai:complete.
 */

/** Play lengths of ship-launch.gif and ship-land.gif, as printed by
 *  scripts/prepare-arcade-assets.py. */
const LAUNCH_MS = 1750
const LAND_MS = 1270
/** How long the bubble takes to shrink away, the reverse of its zoom-in. */
const SHIP_EXIT_MS = 300

const IDLE_SHIP_SRC = '/arcade/idle-ship.gif'
const LAUNCH_SRC = '/arcade/ship-launch.gif'
const LAND_SRC = '/arcade/ship-land.gif'

/** How long the "double-click to play" hint shows at the start of a job. */
const HINT_MS = 5000

// The launcher bubble. The launch animation plays inside the same bubble: both
// GIFs share one crop box, so the ship transforms in place without a jump.
const BUBBLE =
  'flex h-16 w-16 select-none items-center justify-center rounded-full border border-border bg-card/90 shadow-[0_14px_50px_rgba(0,0,0,0.3)] backdrop-blur-md'

type Phase = 'ship' | 'launching' | 'open' | 'closing' | 'landing' | 'departing' | 'closed'

type Outcome = 'board-ready' | 'board-failed' | 'question' | 'design-ready' | 'failed'

interface Session {
  id: number
  phase: Phase
  minimized: boolean
  /** The job this session belongs to has stopped. */
  ended: boolean
  /** How it ended, when there is something to announce. */
  outcome: Outcome | null
}

const NODE_LABELS: Record<string, string> = {
  __start__: 'Starting workflow',
  supervisor: 'Starting workflow',
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
 * How the job ended, read off the store at the moment it stopped being busy.
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

  const [session, setSession] = useState<Session | null>(null)
  const [showHint, setShowHint] = useState(false)
  const nextId = useRef(0)
  // Whether this job has touched board generation, and the board job object as
  // it stood when the job began. The second catches a board that failed before
  // it ever reached `running` (its POST was refused) — a state change the
  // `running` watcher alone would never see.
  const boardInvolved = useRef(false)
  const boardJobAtStart = useRef<BoardJob | null>(null)

  useEffect(() => {
    if (boardJob.status === 'running') boardInvolved.current = true
  }, [boardJob.status])

  // ---- job start / end ----------------------------------------------------------
  useEffect(() => {
    if (busy) {
      setSession((current) => {
        if (current && !current.ended) return current // same job, still running
        boardInvolved.current = useWorkspaceStore.getState().boardJob.status === 'running'
        boardJobAtStart.current = useWorkspaceStore.getState().boardJob
        nextId.current += 1
        return { id: nextId.current, phase: 'ship', minimized: false, ended: false, outcome: null }
      })
      return
    }

    const state = useWorkspaceStore.getState()
    const boardChanged = boardJobAtStart.current !== null && state.boardJob !== boardJobAtStart.current
    const outcome = outcomeOf(state.pipelineRun, state.boardJob, boardInvolved.current || boardChanged)

    setSession((current) => {
      if (!current || current.ended) return current
      switch (current.phase) {
        case 'ship':
          // Never played: the ship takes its leave, reversing its entrance.
          return { ...current, ended: true, phase: 'departing' }
        case 'closed':
          // The player already closed this game; there is nothing left on screen.
          return null
        case 'launching':
        case 'open':
          // In the game, or on the way into it: stop and say so. A minimized
          // game is brought back up, because a notice nobody can see is a
          // swallowed one.
          if (outcome) return { ...current, ended: true, outcome, minimized: false }
          // Abandoned (project switch, new chat): nothing to announce, so it
          // leaves the way a close does.
          return { ...current, ended: true, phase: current.phase === 'open' ? 'closing' : 'departing' }
        default:
          // Already on its way out; let the exit finish, then remove it.
          return { ...current, ended: true }
      }
    })
  }, [busy])

  // A short hint at the start of each job, so the ship reads as something to use.
  const sessionId = session?.id
  const phase = session?.phase
  useEffect(() => {
    if (phase !== 'ship') return
    setShowHint(true)
    const t = window.setTimeout(() => setShowHint(false), HINT_MS)
    return () => window.clearTimeout(t)
  }, [sessionId, phase])

  const update = useCallback((patch: Partial<Session>) => {
    setSession((current) => (current ? { ...current, ...patch } : current))
  }, [])

  /**
   * Move from one phase to the next, but only if the session is still in the
   * phase the caller started from — a timer or animation that outlives its
   * phase must not drag a newer state backwards. `gone` ends the exit: the
   * session is removed if its job is over, or parked as `closed` if it is not.
   */
  const advance = useCallback((from: Phase, to: Phase | 'gone') => {
    setSession((current) => {
      if (!current || current.phase !== from) return current
      if (to === 'gone') return current.ended ? null : { ...current, phase: 'closed' }
      return { ...current, phase: to }
    })
  }, [])

  const launch = useCallback(() => {
    advance('ship', prefersReducedMotion() ? 'open' : 'launching')
  }, [advance])

  // Closing is final for this job: the exit sequence ends in `closed` (job
  // still running) or removal (job over), and no ship is offered again until
  // the next job starts.
  const close = useCallback(() => advance('open', 'closing'), [advance])

  const followNotice = useCallback(() => {
    if (session?.outcome) setActiveTab(OUTCOME_TAB[session.outcome])
    close()
  }, [session?.outcome, setActiveTab, close])

  // The two exit steps that are timed rather than driven by a GIF.
  useEffect(() => {
    let t: number | undefined
    if (phase === 'closing') {
      // The window has shrunk away; unmounting it here is what ends the game.
      t = window.setTimeout(() => advance('closing', prefersReducedMotion() ? 'departing' : 'landing'), WINDOW_EXIT_MS)
    } else if (phase === 'departing') {
      t = window.setTimeout(() => advance('departing', 'gone'), SHIP_EXIT_MS)
    }
    return () => window.clearTimeout(t)
  }, [sessionId, phase, advance])

  if (!session || session.phase === 'closed') return null

  if (session.phase === 'ship') {
    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      // A keyboard cannot double-click; Enter/Space is its equivalent.
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        launch()
      }
    }

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
          Double-click to play while Dunk AI works
        </span>
        <button
          type="button"
          onDoubleClick={launch}
          onKeyDown={onKeyDown}
          onMouseEnter={() => setShowHint(true)}
          onMouseLeave={() => setShowHint(false)}
          title="Double-click to play while Dunk AI works"
          aria-label="Dunk Arcade. Double-click, or press Enter, to play while Dunk AI works."
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
  if (session.phase === 'launching') {
    return (
      <ShipAnimation
        src={`${LAUNCH_SRC}?run=${session.id}`}
        durationMs={LAUNCH_MS}
        onDone={() => advance('launching', 'open')}
      />
    )
  }

  if (session.phase === 'landing') {
    return (
      <ShipAnimation
        src={`${LAND_SRC}?run=${session.id}`}
        durationMs={LAND_MS}
        onDone={() => advance('landing', 'departing')}
      />
    )
  }

  if (session.phase === 'departing') {
    return (
      <div
        aria-hidden
        style={{ animationDuration: `${SHIP_EXIT_MS}ms` }}
        className={`pointer-events-none fixed bottom-[132px] right-6 z-40 ${BUBBLE} animate-out fade-out zoom-out-75`}
      >
        <img src={IDLE_SHIP_SRC} alt="" width={56} height={56} />
      </div>
    )
  }

  const notice = session.outcome ? noticeFor(session.outcome, boardJob.error, boardStats?.errors) : null
  const status =
    boardJob.status === 'running' ? boardJob.label || 'Generating board' : NODE_LABELS[activeNode] || 'Working'

  return (
    <ArcadeWindow
      key={session.id}
      minimized={session.minimized}
      closing={session.phase === 'closing'}
      notice={notice}
      status={status}
      onMinimize={() => update({ minimized: true })}
      onRestore={() => update({ minimized: false })}
      onClose={close}
      onNoticeAction={followNotice}
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
