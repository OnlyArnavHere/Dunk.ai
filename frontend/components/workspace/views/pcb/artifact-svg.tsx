'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ImageOff, ZoomIn, ZoomOut, Maximize } from 'lucide-react'

/**
 * Pan/zoom viewer for a generated schematic or PCB SVG.
 *
 * The SVG is fetched and inlined rather than dropped into an <img>, for two
 * reasons: the file is large (the Phase 1 board was 867 KB of PCB SVG) and an
 * <img> gives no way to report a failed load distinctly from an empty render;
 * and inlining lets the transform live on a wrapper so zooming stays crisp
 * instead of resampling a raster.
 */
export function ArtifactSvg({ src, label }: { src: string; label: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [markup, setMarkup] = useState('')
  const [error, setError] = useState('')

  const viewportRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setMarkup('')

    fetch(src)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.text()
      })
      .then((text) => {
        if (cancelled) return
        if (!text.includes('<svg')) throw new Error('response was not an SVG')
        setMarkup(text)
        setStatus('ready')
        setScale(1)
        setOffset({ x: 0, y: 0 })
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [src])

  const reset = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setScale((s) => Math.min(12, Math.max(0.2, s * (e.deltaY < 0 ? 1.12 : 1 / 1.12))))
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  if (status === 'loading') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="font-mono text-[10px] uppercase tracking-[0.18em]">Loading {label}…</p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
        <ImageOff className="h-8 w-8" />
        <p className="text-sm">Could not load the {label}.</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em]">{error}</p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={viewportRef}
        className="h-full w-full cursor-grab overflow-hidden active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="flex h-full w-full items-center justify-center [&>svg]:h-auto [&>svg]:max-h-full [&>svg]:w-auto [&>svg]:max-w-full"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      </div>

      <div className="absolute bottom-4 right-4 flex overflow-hidden rounded-lg border border-border bg-background/90 backdrop-blur">
        <button
          onClick={() => setScale((s) => Math.min(12, s * 1.25))}
          className="flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setScale((s) => Math.max(0.2, s / 1.25))}
          className="flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={reset}
          className="flex h-8 w-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          title="Fit"
        >
          <Maximize className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
