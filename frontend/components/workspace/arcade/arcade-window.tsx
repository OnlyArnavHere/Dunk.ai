'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Loader2, Minus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ARCADE_HEIGHT, ARCADE_WIDTH, type Shooter, type ShooterStats } from '@/lib/arcade/shooter'

export const PLAYER_SHIP_SRC = '/arcade/player-ship.png'

/** How long the window takes to shrink away when it closes. */
export const WINDOW_EXIT_MS = 200

/** What the finished job produced, as the window should announce it. */
export interface ArcadeNotice {
  title: string
  body: string
  action: string
  tone: 'success' | 'attention' | 'error'
}

interface ArcadeWindowProps {
  minimized: boolean
  /** Playing the close animation: the game is stopped and the window shrinks away. */
  closing: boolean
  /** Set once a job has finished; the game pauses and this is shown over it. */
  notice: ArcadeNotice | null
  /** An AI job is running; the footer shows its live status with a spinner. */
  working: boolean
  /** Live status of the job, or that Dunk AI is idle. */
  status: string
  onMinimize: () => void
  onRestore: () => void
  onClose: () => void
  /** Go to the result; the game is kept (minimized). */
  onNoticeAction: () => void
  /** Dismiss the notice and carry on with the same game. */
  onKeepPlaying: () => void
}

// ---- geometry -------------------------------------------------------------------
//
// The window's size is the on-screen width of the game screen. Height follows
// from it: the playfield is a fixed 3:4 arena, so the window resizes along that
// ratio and the canvas always fills its area exactly — no clipping, no bars.

const TITLE_BAR = 36
const FOOTER = 28
const BORDER = 2
const EDGE = 8
/** Below 0.875x the ship and shots get too small to read. */
const MIN_WIDTH = Math.round(ARCADE_WIDTH * 0.875)
const MAX_WIDTH = ARCADE_WIDTH * 3
const RATIO = ARCADE_HEIGHT / ARCADE_WIDTH

const screenHeight = (width: number) => Math.round(width * RATIO)
const outerWidth = (width: number) => width + BORDER
const outerHeight = (width: number) => TITLE_BAR + screenHeight(width) + FOOTER + BORDER

interface Frame {
  x: number
  y: number
  /** Game-screen width in CSS px. */
  width: number
}

/** The widest screen that still fits the viewport with the window's corner at (x, y). */
const widestAt = (x: number, y: number) =>
  Math.max(
    MIN_WIDTH,
    Math.min(
      MAX_WIDTH,
      window.innerWidth - x - BORDER - EDGE,
      (window.innerHeight - y - TITLE_BAR - FOOTER - BORDER - EDGE) / RATIO
    )
  )

const clampFrame = ({ x, y, width }: Frame): Frame => {
  const w = Math.round(Math.max(MIN_WIDTH, Math.min(width, MAX_WIDTH, window.innerWidth - 2 * EDGE - BORDER)))
  return {
    width: w,
    x: Math.max(EDGE, Math.min(window.innerWidth - outerWidth(w) - EDGE, x)),
    // Only the title bar has to stay reachable, so the window may hang off the
    // bottom edge but never lose its handle.
    y: Math.max(EDGE, Math.min(window.innerHeight - TITLE_BAR - EDGE, y)),
  }
}

/** Opens bottom-right, over the chat composer, where the launcher ship sat. */
const initialFrame = (): Frame =>
  clampFrame({
    width: ARCADE_WIDTH,
    x: window.innerWidth - outerWidth(ARCADE_WIDTH) - 24,
    y: window.innerHeight - outerHeight(ARCADE_WIDTH) - 132,
  })

const pixelated = { imageRendering: 'pixelated' as const }

// Pressing the title bar or the resize grip must not move focus off the canvas:
// focus loss pauses the game, and a drag is not the player walking away.
const keepFocus = (event: ReactMouseEvent) => event.preventDefault()

const TONE_RING: Record<ArcadeNotice['tone'], string> = {
  success: 'bg-emerald-500',
  attention: 'bg-sky-400',
  error: 'bg-destructive',
}

export function ArcadeWindow({
  minimized,
  closing,
  notice,
  working,
  status,
  onMinimize,
  onRestore,
  onClose,
  onNoticeAction,
  onKeepPlaying,
}: ArcadeWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const shooterRef = useRef<Shooter | null>(null)
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizeRef = useRef<{ x: number; y: number; width: number } | null>(null)

  const [frame, setFrame] = useState<Frame | null>(null)
  const [stats, setStats] = useState<ShooterStats>({ score: 0, lives: 3, over: false })
  const [ready, setReady] = useState(false)
  const [focused, setFocused] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // ---- game lifecycle: created on mount, destroyed on unmount ----------------
  //
  // Minimizing does NOT unmount this component — the canvas and the shooter's
  // state stay alive and only the loop stops (see the running effect below).
  // Closing does, and the cleanup here is the single teardown path: the loop,
  // the canvas listeners and every reference to this canvas go with it.
  useEffect(() => {
    let cancelled = false
    let shooter: Shooter | null = null

    const image = new Image()
    image.src = PLAYER_SHIP_SRC

    Promise.all([image.decode(), import('@/lib/arcade/shooter')])
      .then(([, { createShooter }]) => {
        if (cancelled || !canvasRef.current) return
        shooter = createShooter({ canvas: canvasRef.current, playerImage: image, onStats: setStats })
        shooterRef.current = shooter
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })

    return () => {
      cancelled = true
      shooter?.destroy()
      shooterRef.current = null
    }
  }, [])

  // ---- run only while someone can actually play ------------------------------
  // Minimized, unfocused, finished or closing all stop the loop; the last frame
  // stays on the canvas and the state stays in the shooter, so play resumes exactly.
  const running = ready && !minimized && focused && !notice && !closing
  useEffect(() => {
    shooterRef.current?.setRunning(running)
  }, [running])

  // Give the game the keyboard when it first loads and whenever it is restored.
  useEffect(() => {
    if (!minimized && ready && !notice && !closing) canvasRef.current?.focus({ preventScroll: true })
  }, [minimized, ready, notice, closing])

  // Re-render the game at the window's size. The canvas is redrawn at the new
  // resolution, not stretched, so it stays sharp at every size.
  const screenWidth = frame?.width ?? ARCADE_WIDTH
  useEffect(() => {
    if (ready) shooterRef.current?.resize(screenWidth)
  }, [ready, screenWidth])

  // ---- position and size --------------------------------------------------------
  useEffect(() => {
    setFrame(initialFrame())
    const onViewportResize = () => setFrame((f) => (f ? clampFrame(f) : f))
    window.addEventListener('resize', onViewportResize)
    return () => window.removeEventListener('resize', onViewportResize)
  }, [])

  const capture = (event: ReactPointerEvent<HTMLElement>) => event.currentTarget.setPointerCapture(event.pointerId)
  const release = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const onTitlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !frame) return
      // The minimize/close buttons live in the title bar; pressing them is not a drag.
      if ((event.target as HTMLElement).closest('button')) return
      capture(event)
      dragRef.current = { dx: event.clientX - frame.x, dy: event.clientY - frame.y }
    },
    [frame]
  )

  const onTitlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const x = event.clientX - drag.dx
    const y = event.clientY - drag.dy
    setFrame((f) => (f ? clampFrame({ ...f, x, y }) : f))
  }, [])

  const endDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    release(event)
  }, [])

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || !frame) return
      capture(event)
      resizeRef.current = { x: event.clientX, y: event.clientY, width: frame.width }
    },
    [frame]
  )

  const onResizePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeRef.current
    if (!start) return
    // The size is locked to the arena's ratio, so follow whichever axis the
    // pointer has moved further along; either one alone can grow or shrink it.
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    const wanted = Math.abs(dx) >= Math.abs(dy / RATIO) ? start.width + dx : start.width + dy / RATIO
    setFrame((f) =>
      f ? { ...f, width: Math.round(Math.max(MIN_WIDTH, Math.min(wanted, widestAt(f.x, f.y)))) } : f
    )
  }, [])

  const endResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return
    resizeRef.current = null
    release(event)
  }, [])

  const score = String(stats.score).padStart(5, '0')
  const screen = { width: screenWidth, height: screenHeight(screenWidth) }

  return (
    <>
      {minimized && !closing && (
        <button
          type="button"
          onClick={onRestore}
          title="Resume game"
          aria-label={`Resume Dunk Arcade, score ${stats.score}`}
          className="group fixed bottom-[132px] right-6 z-40 flex h-12 items-center gap-2 rounded-full border border-border bg-card/90 pl-2 pr-3.5 shadow-[0_14px_50px_rgba(0,0,0,0.3)] backdrop-blur-md transition-colors hover:border-foreground/30 animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black">
            <img src={PLAYER_SHIP_SRC} alt="" width={24} height={26} style={pixelated} />
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className="text-[11px] font-medium text-foreground">Paused</span>
            <span className="mt-1 font-mono text-[10px] tabular-nums text-muted-foreground">{score}</span>
          </span>
        </button>
      )}

      <div
        role="dialog"
        aria-label="Dunk Arcade"
        // Kept mounted while minimized, only hidden: unmounting would drop the
        // canvas and with it the game the player asked to keep.
        hidden={minimized || !frame}
        style={
          frame
            ? {
                left: frame.x,
                top: frame.y,
                width: outerWidth(frame.width),
                // Tied to the constant so the exit ends exactly when the orchestrator unmounts it.
                ...(closing && { animationDuration: `${WINDOW_EXIT_MS}ms` }),
              }
            : undefined
        }
        className={`fixed z-40 origin-bottom-right overflow-hidden rounded-xl border border-border bg-card/95 text-card-foreground shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-md ${
          closing ? 'pointer-events-none animate-out fade-out zoom-out-75' : 'animate-in fade-in-0 zoom-in-95'
        }`}
      >
        {/* Title bar — the drag handle */}
        <div
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onMouseDown={keepFocus}
          style={{ height: TITLE_BAR }}
          className="flex cursor-grab touch-none select-none items-center gap-2 border-b border-border pl-2.5 pr-1 active:cursor-grabbing"
        >
          <img src={PLAYER_SHIP_SRC} alt="" width={12} height={13} style={pixelated} />
          <span className="min-w-0 truncate text-xs font-medium">Dunk Arcade</span>

          <span className="ml-auto flex shrink-0 items-center gap-2.5">
            <span className="flex items-center gap-0.5" aria-label={`${stats.lives} lives`}>
              {Array.from({ length: 3 }, (_, i) => (
                <img
                  key={i}
                  src={PLAYER_SHIP_SRC}
                  alt=""
                  width={8}
                  height={9}
                  style={pixelated}
                  className={i < stats.lives ? '' : 'opacity-20 grayscale'}
                />
              ))}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground" aria-label={`Score ${stats.score}`}>
              {score}
            </span>
          </span>

          <span className="ml-1 flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onMinimize}
              title="Minimize"
              aria-label="Minimize game"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              title="Close — ends this game"
              aria-label="Close game"
              className="h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </span>
        </div>

        {/* Arcade screen — deliberately NOT themed; it is a cabinet, not a panel. */}
        <div className="relative bg-black" style={screen}>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label="Game screen. Arrow keys or A and D to move, Space to fire."
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ ...screen, ...pixelated }}
            className="block outline-none"
          />

          {!ready && !loadError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/50" />
            </div>
          )}

          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center px-8 text-center font-mono text-[11px] text-white/60">
              The game could not load. Your run is unaffected.
            </div>
          )}

          {/* Paused: the canvas lost focus (clicked into the chat, switched window). */}
          {ready && !focused && !notice && !closing && (
            <button
              type="button"
              onClick={() => canvasRef.current?.focus({ preventScroll: true })}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 font-mono text-white"
            >
              <span className="text-sm font-bold tracking-[0.2em]">PAUSED</span>
              <span className="text-[10px] text-white/60">CLICK TO PLAY</span>
              <span className="mt-3 text-[10px] text-white/40">← → MOVE · SPACE FIRE</span>
            </button>
          )}

          {/* The job finished. Never left for the player to discover later. */}
          {notice && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 animate-in fade-in-0 duration-200">
              <div
                role="alertdialog"
                aria-live="assertive"
                aria-label={notice.title}
                className="w-full rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg animate-in zoom-in-95 duration-200"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${TONE_RING[notice.tone]}`} />
                  <p className="text-sm font-semibold">{notice.title}</p>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{notice.body}</p>
                {stats.score > 0 && (
                  <p className="mt-2 font-mono text-[10px] tabular-nums text-muted-foreground">Score {score}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={onNoticeAction} autoFocus>
                    {notice.action}
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={onKeepPlaying}>
                    Keep playing
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Live job status, so a run is never out of sight while playing. */}
        <div
          style={{ height: FOOTER }}
          className="flex items-center gap-2 border-t border-border pl-2.5 pr-5 text-[10px] text-muted-foreground"
        >
          {notice ? (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_RING[notice.tone]}`} />
          ) : !working ? (
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
          ) : (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
          )}
          <span className="truncate">{notice ? notice.title : status}</span>
        </div>

        {/* Resize grip, bottom-right. Resizes along the arena's 3:4 ratio. */}
        <div
          aria-hidden
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onMouseDown={keepFocus}
          className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <path d="M8 1L1 8M8 4.5L4.5 8M8 7.5L7.5 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </>
  )
}
