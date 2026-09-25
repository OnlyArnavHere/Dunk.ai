'use client'

import { useMemo, useState } from 'react'
import {
  BadgeCheck,
  BookOpen,
  Box,
  CircuitBoard,
  Download,
  ExternalLink,
  FileText,
  Layers,
  ListTree,
  ShieldAlert,
  Target,
  Waypoints,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useWorkspaceStore, type BoardArtifact } from '@/lib/store'
import { ArtifactSvg } from './pcb/artifact-svg'
import { BoardGltf } from './pcb/board-gltf'

/**
 * The build report — everything about the product, on one page.
 *
 * This view used to render nothing at all, ever. It looked for `overview`,
 * `summary`, `sections[]` and four other keys; documentation_node emits
 * `bom_report`, `design_summary` and `engineering_docs`. With no key in common
 * the section list was always empty, so every run fell through to "No
 * documentation was generated for this run." The three markdown strings are
 * read under their real names below and are now the LAST section rather than
 * the whole tab, because by the time they are written the pipeline already
 * holds the real artifacts — a BOM with part numbers and prices, a routed
 * board, SVGs, a 3D model — and a report that paraphrases those in prose while
 * the images sit unused in another tab is not the document anyone wanted.
 *
 * Everything here is composed from state the store already carries. Nothing new
 * is fetched and nothing is recomputed: the BOM figures are the component
 * agent's own, and the board figures are the designer's.
 */

// ---- Types mirroring the Python pipeline output ----

/** Real BOM_COLUMNS from ai_engine/agents/component_agent/bom.py. */
interface BomRow {
  reference?: string
  subsystem?: string
  category?: string
  manufacturer?: string
  mfr_part?: string
  lcsc?: string
  package?: string
  build_quantity?: number
  unit_price_usd?: number | string
  extended_price_usd?: number | string
  stock?: number
  status?: string
  status_reason?: string
  description?: string
  datasheet_url?: string
  source_url?: string
}

interface BomData {
  rows?: BomRow[]
  summary?: {
    total_line_items?: number
    total_cost_usd?: number
    unfilled_references?: string[]
  }
}

interface DocumentationData {
  bom_report?: string
  design_summary?: string
  engineering_docs?: string
}

interface HandoffData {
  well_formed?: boolean
  passed?: boolean
  schema_version?: string
  issues?: Array<{ severity?: string; code?: string; message?: string }>
  checks_run?: string[]
}

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: Target },
  { id: 'architecture', label: 'Architecture', icon: ListTree },
  { id: 'bom', label: 'Bill of materials', icon: Layers },
  { id: 'schematic', label: 'Schematic & PCB', icon: CircuitBoard },
  { id: 'validation', label: 'Validation', icon: BadgeCheck },
  { id: 'model', label: '3D & downloads', icon: Box },
  { id: 'notes', label: 'Generated notes', icon: FileText },
] as const

const money = (value: unknown): string => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '—'
}

const DOWNLOADS: Array<{ key: keyof BoardArtifact['urls']; label: string }> = [
  { key: 'gerbersZip', label: 'Gerbers (.zip)' },
  { key: 'bomCsv', label: 'BOM (.csv)' },
  { key: 'pickAndPlaceCsv', label: 'Pick & place (.csv)' },
  { key: 'circuitJson', label: 'circuit.json' },
  { key: 'boardGlb', label: 'Board (.glb)' },
  { key: 'designBrief', label: 'Design brief (.md)' },
  { key: 'resolution', label: 'Resolution (.json)' },
]

function Section({
  id,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-3xl border border-border bg-card/80 shadow-sm">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background/80 text-muted-foreground">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/70 p-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm leading-6 text-foreground">{value || '—'}</p>
    </div>
  )
}

export function DocsView({ projectId: _projectId }: { projectId?: string } = {}) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput)
  const [pane, setPane] = useState<'schematic' | 'pcb'>('schematic')

  const requirements = (aiOutput?.requirements ?? {}) as Record<string, any>
  const architecture = (aiOutput?.architecture ?? {}) as Record<string, any>
  const bom = (aiOutput?.bom ?? {}) as BomData
  const pcbIr = (aiOutput?.pcb_ir ?? {}) as Record<string, any>
  const documentation = (aiOutput?.documentation ?? {}) as DocumentationData
  const board = aiOutput?.board ?? null

  const handoff = (aiOutput?.handoff_validation ?? aiOutput?.validation ?? null) as HandoffData | null
  const isV2 = Boolean(aiOutput?.handoff_validation)

  const rows = bom.rows ?? []
  const summary = bom.summary ?? {}
  const archModel = architecture.architecture_model ?? {}
  const archGraph = architecture.architecture_graph ?? {}

  const totalCost = useMemo(() => {
    // The component agent already totals this; recomputing would risk
    // disagreeing with the BOM tab over rounding.
    if (typeof summary.total_cost_usd === 'number') return summary.total_cost_usd
    return rows.reduce((sum, r) => {
      const n = parseFloat(String(r.extended_price_usd ?? r.unit_price_usd ?? 0))
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  }, [rows, summary.total_cost_usd])

  const projectName =
    (pcbIr.design_name as string) ||
    (requirements.project_name as string) ||
    (requirements.objective as string) ||
    'Untitled design'

  const downloadReport = () => {
    const lines = [
      `# Build report: ${projectName}`,
      '',
      '## Overview',
      `Objective: ${requirements.objective ?? '—'}`,
      `Category: ${requirements.category ?? '—'}`,
      '',
      '## Architecture',
      `Processing unit: ${archModel.processing_unit ?? '—'}`,
      `Interfaces: ${(archModel.interfaces ?? []).join(', ') || '—'}`,
      `Subsystems: ${(archGraph.nodes ?? []).length}`,
      '',
      '## Bill of materials',
      `${rows.length} line items · ${money(totalCost)}`,
      ...rows.map(
        (r) =>
          `  ${r.reference ?? '?'}  ${r.manufacturer ?? ''} ${r.mfr_part ?? '?'}  ` +
          `${r.package ?? ''}  LCSC:${r.lcsc ?? '—'}  ${money(r.unit_price_usd)}  ${r.status ?? ''}`
      ),
      '',
      '## Validation',
      `Handoff: ${handoff ? (isV2 ? (handoff.well_formed ? 'well-formed' : 'malformed') : handoff.passed ? 'passed' : 'failed') : 'not run'}`,
      `Board DRC: ${board ? `${board.stats?.errors ?? 0} error(s), ${board.stats?.traces ?? 0} routed traces` : 'no board generated'}`,
      '',
      '## Generated notes',
      documentation.design_summary ?? '',
      '',
      documentation.engineering_docs ?? '',
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'build-report.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!aiOutput) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <BookOpen className="h-10 w-10 opacity-40" />
        <p className="text-sm">Run the AI pipeline from the Chat tab to generate the build report.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-background p-5 lg:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Engineering package
            </p>
            <h2 className="mt-2 font-display text-4xl tracking-tight">{projectName}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length} part{rows.length !== 1 ? 's' : ''} · {money(totalCost)}
              {board?.stats?.traces ? ` · ${board.stats.traces} routed traces` : ''}
            </p>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={downloadReport}>
            <Download className="mr-2 h-4 w-4" />
            Download report
          </Button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[190px_minmax(0,1fr)]">
          <aside className="hidden xl:block">
            <nav className="sticky top-4 space-y-1 rounded-2xl border border-border bg-card p-3">
              {SECTIONS.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-w-0 space-y-5">
            <Section id="overview" title="Overview" subtitle="What this board is for" icon={Target}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Objective" value={requirements.objective} />
                <Field label="Category" value={requirements.category} />
                <Field label="Power" value={requirements.power_source ?? requirements.power} />
                <Field
                  label="Interfaces"
                  value={(archModel.interfaces ?? []).join(', ')}
                />
              </div>
              {Array.isArray(requirements.constraints) && requirements.constraints.length > 0 && (
                <div className="mt-3 rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Constraints
                  </p>
                  <ul className="mt-2 space-y-1">
                    {requirements.constraints.map((c: string, i: number) => (
                      <li key={i} className="text-sm leading-6 text-muted-foreground">• {c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            <Section
              id="architecture"
              title="Architecture"
              subtitle={`${(archGraph.nodes ?? []).length} subsystems · ${(archGraph.edges ?? []).length} links`}
              icon={ListTree}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Processing unit" value={archModel.processing_unit} />
                <Field label="Subsystems" value={(archGraph.nodes ?? []).length} />
              </div>

              {Array.isArray(archGraph.nodes) && archGraph.nodes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {archGraph.nodes.map((n: any, i: number) => (
                    <Badge key={i} variant="outline" className="rounded-full text-[11px]">
                      {typeof n === 'string' ? n : n.label ?? n.id ?? `node ${i + 1}`}
                    </Badge>
                  ))}
                </div>
              )}

              {(architecture.assumptions ?? []).length > 0 && (
                <div className="mt-3 rounded-xl border border-border bg-background/70 p-3">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Assumptions
                  </p>
                  <ul className="mt-2 space-y-1">
                    {architecture.assumptions.map((a: string, i: number) => (
                      <li key={i} className="text-sm leading-6 text-muted-foreground">• {a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {(architecture.warnings ?? []).length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 dark:bg-amber-400/10">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                    Warnings
                  </p>
                  <ul className="mt-2 space-y-1">
                    {architecture.warnings.map((w: string, i: number) => (
                      <li key={i} className="text-sm leading-6 text-foreground">• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            <Section
              id="bom"
              title="Bill of materials"
              subtitle={`${summary.total_line_items ?? rows.length} line items · ${money(totalCost)}`}
              icon={Layers}
            >
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No BOM rows were produced.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-secondary/50 text-muted-foreground">
                      <tr>
                        {['Ref', 'Part', 'Package', 'LCSC', 'Unit', 'Ext.', 'Status', ''].map((h) => (
                          <th key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={`${r.reference}-${i}`} className="border-t border-border">
                          <td className="px-3 py-2 font-mono text-[11px] text-foreground">{r.reference ?? '?'}</td>
                          <td className="px-3 py-2">
                            <span className="text-foreground">{r.mfr_part ?? '—'}</span>
                            {r.manufacturer && (
                              <span className="block text-[10px] text-muted-foreground">{r.manufacturer}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{r.package ?? '—'}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{r.lcsc ?? '—'}</td>
                          <td className="px-3 py-2 text-muted-foreground">{money(r.unit_price_usd)}</td>
                          <td className="px-3 py-2 text-muted-foreground">{money(r.extended_price_usd)}</td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={`rounded-full text-[10px] ${
                                r.status && r.status !== 'OK'
                                  ? 'border-amber-500/25 text-amber-700 dark:text-amber-300'
                                  : ''
                              }`}
                              title={r.status_reason}
                            >
                              {r.status ?? '—'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">
                            {r.datasheet_url && (
                              <a
                                href={r.datasheet_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Datasheet <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(summary.unfilled_references ?? []).length > 0 && (
                <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-foreground dark:bg-rose-400/10">
                  No part selected for: {summary.unfilled_references!.join(', ')}
                </p>
              )}
            </Section>

            <Section
              id="schematic"
              title="Schematic & PCB"
              subtitle={board ? 'Rendered from the generated board' : 'Needs a generated board'}
              icon={CircuitBoard}
            >
              {board?.urls?.schematicSvg || board?.urls?.pcbSvg ? (
                <>
                  <div className="mb-3 flex gap-1.5">
                    {(['schematic', 'pcb'] as const).map((p) => (
                      <Button
                        key={p}
                        size="sm"
                        variant={pane === p ? 'secondary' : 'ghost'}
                        className="rounded-lg text-xs capitalize"
                        onClick={() => setPane(p)}
                      >
                        {p}
                      </Button>
                    ))}
                  </div>
                  <div className="h-[460px] overflow-hidden rounded-xl border border-border bg-background">
                    {pane === 'schematic' && board.urls.schematicSvg && (
                      <ArtifactSvg src={board.urls.schematicSvg} label="schematic" />
                    )}
                    {pane === 'pcb' && board.urls.pcbSvg && (
                      <ArtifactSvg src={board.urls.pcbSvg} label="PCB layout" />
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Run Generate PCB to produce the schematic and layout.
                </p>
              )}
            </Section>

            <Section
              id="validation"
              title="Validation"
              subtitle="Two separate checks — the handoff, and the built board"
              icon={BadgeCheck}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Handoff</p>
                    {handoff ? (
                      (isV2 ? handoff.well_formed : handoff.passed) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="h-3.5 w-3.5" /> {isV2 ? 'Well-formed' : 'Passed'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                          <ShieldAlert className="h-3.5 w-3.5" /> Needs review
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Not run</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {(handoff?.checks_run ?? []).length} check
                    {(handoff?.checks_run ?? []).length !== 1 ? 's' : ''} ·{' '}
                    {(handoff?.issues ?? []).length} issue
                    {(handoff?.issues ?? []).length !== 1 ? 's' : ''}
                  </p>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    Well-formedness of the handoff only. Not a buildability claim.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/70 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Board DRC</p>
                    {board ? (
                      (board.stats?.errors ?? 0) === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <BadgeCheck className="h-3.5 w-3.5" /> Clean
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                          <ShieldAlert className="h-3.5 w-3.5" /> {board.stats.errors} error
                          {board.stats.errors !== 1 ? 's' : ''}
                        </span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">No board</span>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                    <Waypoints className="h-3.5 w-3.5" />
                    {board?.stats?.traces ?? 0} routed traces · {board?.stats?.warnings ?? 0} warnings
                  </p>
                  {(board?.stats?.errorTypes?.length ?? 0) > 0 && (
                    <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                      {board!.stats.errorTypes!.join(', ')}
                    </p>
                  )}
                </div>
              </div>
            </Section>

            <Section
              id="model"
              title="3D & downloads"
              subtitle="Manufacturing outputs"
              icon={Box}
            >
              {board?.urls?.boardGlb ? (
                <div className="h-[420px] overflow-hidden rounded-xl border border-border bg-background">
                  <BoardGltf src={board.urls.boardGlb} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No 3D model was produced for this board.</p>
              )}

              {board && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {DOWNLOADS.filter((d) => board.urls?.[d.key]).map((d) => (
                    <Button key={d.key} asChild size="sm" variant="outline" className="rounded-lg text-xs">
                      <a href={board.urls[d.key]} download>
                        <Download className="mr-1.5 h-3.5 w-3.5" />
                        {d.label}
                      </a>
                    </Button>
                  ))}
                </div>
              )}
            </Section>

            <Section
              id="notes"
              title="Generated notes"
              subtitle="Written by the documentation agent"
              icon={FileText}
            >
              {documentation.design_summary || documentation.engineering_docs || documentation.bom_report ? (
                <div className="space-y-4">
                  {([
                    ['Design summary', documentation.design_summary],
                    ['Engineering documentation', documentation.engineering_docs],
                    ['BOM report', documentation.bom_report],
                  ] as const)
                    .filter(([, body]) => body?.trim())
                    .map(([title, body]) => (
                      <div key={title} className="rounded-xl border border-border bg-background/70 p-4">
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                          {title}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-6 text-muted-foreground">
                          {body!.trim()}
                        </pre>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The documentation agent produced no notes for this run.
                </p>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}
