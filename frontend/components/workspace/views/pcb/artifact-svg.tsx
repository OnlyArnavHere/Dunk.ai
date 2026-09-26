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
 *
 * It is inlined into a shadow root rather than straight into the page. A
 * tscircuit artifact carries its own <style> block, and a <style> injected into
 * the document is global -- it is not scoped to the SVG it arrived in. The
 * schematic declares `.boundary { fill: rgb(245, 241, 237) }`, the PCB draws its
 * background as `<rect class="boundary" fill="#000">`, and a CSS declaration
 * outranks a presentation attribute, so whenever both artifacts were mounted at
 * once (PcbView and DocsView are never unmounted -- see main-editor.tsx) the
 * schematic repainted the PCB's background cream. A shadow root keeps each
 * artifact's stylesheet to itself.
 */

// Sizing that used to come from the `[&>svg]:...` Tailwind variants on the
// wrapper. Outer selectors cannot match inside a shadow root, so the rules move
// in with the markup.
const SHADOW_STYLE = `
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  svg {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
  }
`

export function ArtifactSvg({ src, label }: { src: string; label: string }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [markup, setMarkup] = useState('')
  const [error, setError] = useState('')

  const viewportRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
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

  // Attach on first paint of the ready state and refill whenever the markup
  // changes. attachShadow throws if called twice on the same element, so an
  // existing root is reused.
  useEffect(() => {
    const host = hostRef.current
    if (!host || !markup) return
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<style>${SHADOW_STYLE}</style>${markup}`
    return () => {
      shadow.innerHTML = ''
    }
  }, [markup])

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
          ref={hostRef}
          className="h-full w-full"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
          }}
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
