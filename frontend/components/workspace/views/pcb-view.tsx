'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Check, Copy, Download, FileCode2, Layers2, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from 'sonner'
import { KiCanvasViewer } from './pcb/kicanvas-viewer'
import { Board3D } from './pcb/board-3d'
import { SAMPLE_BOARD, SAMPLE_BOARD_NAME } from './pcb/sample-board'
import { useWorkspaceStore } from '@/lib/store'

export function PcbView({ projectId: _projectId }: { projectId?: string } = {}) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput)
  const aiBoard = (aiOutput?.pcb_ir as any)?.board_file

  // Use the AI generated board if available, otherwise fallback to sample
  const [source, setSource] = useState(aiBoard || SAMPLE_BOARD)

  // Update source if aiOutput changes after mount
  useEffect(() => {
    if (aiBoard) setSource(aiBoard)
  }, [aiBoard])

  // KiCanvas is 2D-only (alpha) — the 3D view is our own three.js preview
  const [view, setView] = useState<'2d' | '3d'>('2d')

  // Source editor drawer
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)

  // Native fullscreen on the viewer container
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await containerRef.current?.requestFullscreen()
      }
    } catch {
      toast.error('Fullscreen is not available in this browser')
    }
  }, [])

  const openEditor = () => {
    setDraft(source)
    setEditorOpen(true)
  }

  const applyDraft = () => {
    const trimmed = draft.trim()
    if (!trimmed.startsWith('(kicad_pcb')) {
      toast.error('Not a KiCad board — the file must start with (kicad_pcb …)')
      return
    }
    setSource(draft)
    toast.success('Board re-rendered from source')
  }

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const downloadBoard = () => {
    const blob = new Blob([source], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = SAMPLE_BOARD_NAME
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    // Forced dark surface: KiCanvas always renders a dark canvas, so the PCB
    // view re-applies the dark tokens (.force-dark) even when the app is in
    // light mode — buttons and text stay dark-styled to match the viewer
    <div ref={containerRef} className="force-dark dark relative h-full w-full overflow-hidden bg-[#131318] text-foreground">
      {view === '2d' ? (
        /* Full-page KiCanvas viewer (WebGL) with its complete control sidebar */
        <KiCanvasViewer source={source} name={SAMPLE_BOARD_NAME} type="board" controls="full" />
      ) : (
        <Board3D source={source} />
      )}

      {/* Top-left meta + actions — KiCanvas owns the top-right corner and the
          right-edge activity bar, so all of our controls live on the left */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <p className="pointer-events-none select-none font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Design artifact / PCB · {SAMPLE_BOARD_NAME}{view === '3d' ? ' · 3D preview' : ''}
        </p>
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-background/90 backdrop-blur">
            <button
              onClick={() => setView('2d')}
              className={`flex h-8 items-center gap-1.5 px-3 text-xs transition-colors ${view === '2d' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Layers2 className="h-3.5 w-3.5" />
              2D
            </button>
            <button
              onClick={() => setView('3d')}
              className={`flex h-8 items-center gap-1.5 px-3 text-xs transition-colors ${view === '3d' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Box className="h-3.5 w-3.5" />
              3D
            </button>
          </div>
          <Button variant="outline" size="sm" className="h-8 rounded-lg bg-background/90 text-xs backdrop-blur" onClick={downloadBoard}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg bg-background/90 text-xs backdrop-blur" onClick={openEditor}>
            <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
            Edit source
          </Button>
          <Button variant="outline" size="sm" className="h-8 rounded-lg bg-background/90 text-xs backdrop-blur" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="mr-1.5 h-3.5 w-3.5" /> : <Maximize2 className="mr-1.5 h-3.5 w-3.5" />}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </Button>
        </div>
      </div>

      {/* KiCad source editor drawer */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 border-border bg-background/95 backdrop-blur-xl sm:max-w-xl">
          <SheetHeader className="border-b border-border pb-4">
            <SheetTitle className="flex items-center gap-2 font-display text-xl">
              <FileCode2 className="h-4 w-4" />
              Board source
            </SheetTitle>
            <SheetDescription className="font-mono text-[10px] uppercase tracking-[0.18em]">
              Edit the .kicad_pcb live — Apply re-renders the viewer
            </SheetDescription>
          </SheetHeader>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="mt-4 flex-1 resize-none rounded-lg border border-border bg-secondary/30 p-3 font-mono text-[11px] leading-relaxed text-foreground outline-none focus:border-foreground/30"
          />
          <div className="mt-4 flex items-center gap-2">
            <Button size="sm" className="rounded-lg text-xs" onClick={applyDraft}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Apply
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={copyDraft}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto rounded-lg text-xs text-muted-foreground"
              onClick={() => setDraft(source)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
