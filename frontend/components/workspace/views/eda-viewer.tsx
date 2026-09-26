'use client'

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Cpu, Braces, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/lib/store'

// ---- value formatting shared by the tree and the raw-JSON highlighter ----
const VALUE_COLOR: Record<string, string> = {
  string: 'text-emerald-400',
  number: 'text-amber-400',
  boolean: 'text-purple-400',
  null: 'text-muted-foreground/70',
}

/** Rough count for the "N keys" / "N items" badge — display only. */
function countEntries(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value !== null && typeof value === 'object') return Object.keys(value as object).length
  return 0
}

// ---- Recursive JSON tree viewer ----
function JsonNode({ label, value, depth = 0, isLast = true }: { label?: string; value: unknown; depth?: number; isLast?: boolean }) {
  const [open, setOpen] = useState(depth < 2)

  const isObj = value !== null && typeof value === 'object' && !Array.isArray(value)
  const isArr = Array.isArray(value)
  const isComplex = isObj || isArr

  if (!isComplex) {
    const kind = value === null ? 'null' : typeof value
    return (
      <div className="group flex items-baseline gap-2 rounded-md px-1.5 py-1 leading-5 hover:bg-foreground/[0.04]">
        {label !== undefined && (
          <span className="shrink-0 font-mono text-[11px] font-medium text-sky-300/90">{label}</span>
        )}
        <span className={`font-mono text-[11px] break-all ${VALUE_COLOR[kind] ?? 'text-foreground'}`}>
          {value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value)}
        </span>
      </div>
    )
  }

  const entries = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  const kindLabel = isArr ? 'array' : 'object'
  const count = entries.length

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-foreground/[0.04]"
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground/70 transition-transform group-hover:text-muted-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </span>
        {label !== undefined && (
          <span className="font-mono text-[11px] font-medium text-sky-300/90">{label}</span>
        )}
        <span className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
          {kindLabel} · {count}
        </span>
      </button>
      {open && count > 0 && (
        <div className="ml-[7px] border-l border-border/60 pl-3">
          {entries.map(([k, v], i) => (
            <JsonNode key={k} label={isArr ? undefined : k} value={v} depth={depth + 1} isLast={i === entries.length - 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Lightweight syntax highlighter for the raw-JSON pane (display only) ----
function HighlightedJson({ text }: { text: string }) {
  // Tokenises a JSON.stringify(..., null, 2) string purely for colouring —
  // it renders the exact same text, just wrapped in coloured spans.
  const tokenRe = /("(?:\\.|[^"\\])*"(?:\s*:)?)|(\btrue\b|\bfalse\b)|(\bnull\b)|(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = tokenRe.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const [full, str, bool, nul] = m
    if (str !== undefined) {
      const isKey = /:\s*$/.test(str)
      parts.push(
        <span key={i++} className={isKey ? 'text-sky-300/90' : 'text-emerald-400'}>
          {str}
        </span>
      )
    } else if (bool !== undefined) {
      parts.push(
        <span key={i++} className="text-purple-400">
          {bool}
        </span>
      )
    } else if (nul !== undefined) {
      parts.push(
        <span key={i++} className="text-muted-foreground/70">
          {nul}
        </span>
      )
    } else {
      parts.push(
        <span key={i++} className="text-amber-400">
          {full}
        </span>
      )
    }
    last = tokenRe.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ---- EDA top-level tabs ----
type EdaTab = 'pcb_ir' | 'eda_data'

const TAB_LABELS: Record<EdaTab, string> = {
  eda_data: 'EDA Data',
  pcb_ir: 'PCB IR',
}

export function EdaViewer({ projectId: _projectId }: { projectId?: string } = {}) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput)
  const [activeTab, setActiveTab] = useState<EdaTab>('eda_data')
  const [copied, setCopied] = useState(false)

  const edaData = aiOutput?.eda_data
  const pcbIr = aiOutput?.pcb_ir

  const tabs: EdaTab[] = ['eda_data', 'pcb_ir'].filter((t) =>
    t === 'eda_data' ? !!edaData : !!pcbIr
  ) as EdaTab[]

  if (!edaData && !pcbIr) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background text-muted-foreground">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-card/80">
          <Cpu className="h-7 w-7 opacity-40" />
        </span>
        <p className="max-w-xs text-center text-sm">
          {aiOutput
            ? 'No EDA data was generated for this run.'
            : 'Run the AI pipeline from the Chat tab to generate the EDA output.'}
        </p>
      </div>
    )
  }

  const activeData = activeTab === 'eda_data' ? edaData : pcbIr
  const raw = JSON.stringify(activeData, null, 2)
  const entryCount = countEntries(activeData)
  const sizeLabel = raw.length < 1024 ? `${raw.length} B` : `${(raw.length / 1024).toFixed(1)} KB`

  const copyJson = async () => {
    await navigator.clipboard.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full overflow-hidden bg-background p-5 lg:p-7">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-5">
        {/* Header — matches the icon-badge + title pattern used across the workspace */}
        <div className="flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/80 text-muted-foreground">
              <Cpu className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">EDA Output</h2>
              <p className="text-xs text-muted-foreground">Intermediate representation from the AI pipeline</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {tabs.length > 1 && (
              <div className="flex overflow-hidden rounded-lg border border-border bg-card/80">
                {tabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTab === t
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="h-8 rounded-lg border-border text-muted-foreground" onClick={copyJson}>
              {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy JSON'}
            </Button>
          </div>
        </div>

        {/* Body — tree + raw JSON, each its own card */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="flex min-h-0 flex-col rounded-3xl border border-border bg-card/80 shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Braces className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">{TAB_LABELS[activeTab]}</span>
                <span className="text-[10px] text-muted-foreground">· tree</span>
              </div>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {entryCount} {entryCount === 1 ? 'key' : 'keys'}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <JsonNode value={activeData} />
            </div>
          </section>

          <section className="flex min-h-0 flex-col rounded-3xl border border-border bg-card/80 shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <FileJson className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Raw JSON</span>
              </div>
              <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                {sizeLabel}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <pre className="font-mono text-[11px] leading-5 whitespace-pre-wrap break-all text-foreground/90">
                <HighlightedJson text={raw} />
              </pre>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
