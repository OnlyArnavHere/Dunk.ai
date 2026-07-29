'use client'

import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight, Cpu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useWorkspaceStore } from '@/lib/store'

// ---- Recursive JSON tree viewer ----
function JsonNode({ label, value, depth = 0 }: { label?: string; value: unknown; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)

  const isObj = value !== null && typeof value === 'object' && !Array.isArray(value)
  const isArr = Array.isArray(value)
  const isComplex = isObj || isArr

  const indent = depth * 16

  if (!isComplex) {
    return (
      <div className="flex items-baseline gap-2 py-0.5" style={{ paddingLeft: indent }}>
        {label !== undefined && (
          <span className="text-xs font-medium text-accent shrink-0">{label}:</span>
        )}
        <span className={`text-xs break-all ${
          typeof value === 'string' ? 'text-emerald-400' :
          typeof value === 'number' ? 'text-amber-400' :
          typeof value === 'boolean' ? 'text-purple-400' :
          'text-muted-foreground'
        }`}>
          {value === null ? 'null' : String(value)}
        </span>
      </div>
    )
  }

  const entries = isArr
    ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
    : Object.entries(value as Record<string, unknown>)

  const summary = isArr ? `[${entries.length}]` : `{${entries.length}}`

  return (
    <div style={{ paddingLeft: label !== undefined ? indent : 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 py-0.5 hover:opacity-80 transition-opacity"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        {label !== undefined && (
          <span className="text-xs font-medium text-accent">{label}</span>
        )}
        <span className="text-xs text-muted-foreground ml-1">{summary}</span>
      </button>
      {open && (
        <div className="border-l border-border/50 ml-1.5 pl-2">
          {entries.map(([k, v]) => (
            <JsonNode key={k} label={isArr ? undefined : k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
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
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <Cpu className="h-10 w-10 opacity-40" />
        <p className="text-sm">
          {aiOutput
            ? 'No EDA data was generated for this run.'
            : 'Run the AI pipeline from the Chat tab to generate the EDA output.'}
        </p>
      </div>
    )
  }

  const activeData = activeTab === 'eda_data' ? edaData : pcbIr

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(activeData, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h2 className="text-lg font-semibold">EDA Output</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Intermediate Representation from the AI pipeline</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Sub-tabs */}
          {tabs.length > 1 && (
            <div className="flex overflow-hidden rounded-lg border border-border bg-secondary/50">
              {tabs.map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTab(t)}
                  className={`px-3 py-1.5 text-xs transition-colors ${
                    activeTab === t ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" className="border-border text-muted-foreground h-8" onClick={copyJson}>
            {copied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
            {copied ? 'Copied' : 'Copy JSON'}
          </Button>
        </div>
      </div>

      {/* Body — split: tree on left, raw JSON on right */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-2 divide-x divide-border">
        {/* Tree view */}
        <div className="overflow-auto p-5 font-mono">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">{TAB_LABELS[activeTab]} — Tree</p>
          <JsonNode value={activeData} />
        </div>

        {/* Raw JSON */}
        <div className="overflow-auto p-5 bg-secondary/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Raw JSON</p>
          <pre className="text-[11px] leading-5 text-foreground whitespace-pre-wrap break-all">
            {JSON.stringify(activeData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}
