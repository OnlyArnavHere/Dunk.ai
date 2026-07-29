'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Download, FileText, BookOpen, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore } from '@/lib/store'

// ---- Types mirroring the Python documentation output ----
interface DocSection {
  title?: string;
  content?: string;
  body?: string;
  type?: string;
}

interface DocumentationData {
  sections?: DocSection[];
  overview?: string;
  description?: string;
  content?: string;
  summary?: string;
  design_notes?: string;
  assembly_notes?: string;
  testing_notes?: string;
}

export function DocsView({ projectId: _projectId }: { projectId?: string } = {}) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput)
  const documentation = aiOutput?.documentation as DocumentationData | null | undefined

  const [selected, setSelected] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('')

  // Build a list of readable sections from whatever the agent returned
  const buildSections = () => {
    if (!documentation) return []

    const sections: Array<{ title: string; content: string }> = []

    // Named text fields become their own section
    const namedFields: Array<[keyof DocumentationData, string]> = [
      ['overview', 'Overview'],
      ['description', 'Description'],
      ['summary', 'Summary'],
      ['design_notes', 'Design Notes'],
      ['assembly_notes', 'Assembly Notes'],
      ['testing_notes', 'Testing Notes'],
      ['content', 'Documentation'],
    ]
    for (const [key, label] of namedFields) {
      const val = documentation[key]
      if (typeof val === 'string' && val.trim()) {
        sections.push({ title: label, content: val.trim() })
      }
    }

    // Structured sections array
    if (Array.isArray(documentation.sections)) {
      for (const s of documentation.sections) {
        const title = s.title ?? s.type ?? 'Section'
        const content = s.content ?? s.body ?? ''
        if (content.trim()) sections.push({ title, content: content.trim() })
      }
    }

    return sections
  }

  const allSections = buildSections()
  const filtered = filter
    ? allSections.filter((s) => s.title.toLowerCase().includes(filter.toLowerCase()) || s.content.toLowerCase().includes(filter.toLowerCase()))
    : allSections

  const selectDoc = (index: number) => {
    setSelected(index)
    setPage(1)
  }

  const currentSection = filtered[selected] ?? null

  // Approximate pages by paragraph count (one page ≈ 4 paragraphs)
  const paragraphs = currentSection?.content.split('\n').filter(Boolean) ?? []
  const PARAS_PER_PAGE = 5
  const totalPages = Math.max(1, Math.ceil(paragraphs.length / PARAS_PER_PAGE))
  const pageParas = paragraphs.slice((page - 1) * PARAS_PER_PAGE, page * PARAS_PER_PAGE)

  const downloadDocs = () => {
    const text = allSections.map((s) => `# ${s.title}\n\n${s.content}`).join('\n\n---\n\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'engineering-docs.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---- Empty / loading state ----
  if (!documentation || allSections.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <BookOpen className="h-10 w-10 opacity-40" />
        <p className="text-sm">
          {aiOutput
            ? 'No documentation was generated for this run.'
            : 'Run the AI pipeline from the Chat tab to generate engineering documentation.'}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-background p-5 lg:p-7">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">AI Generated</p>
            <h2 className="mt-2 font-display text-4xl tracking-tight">Documentation</h2>
          </div>
          <Button variant="outline" className="rounded-xl" onClick={downloadDocs}>
            <Download className="mr-2 h-4 w-4" />
            Download package
          </Button>
        </div>

        <div className="grid min-h-[600px] gap-4 xl:grid-cols-[250px_minmax(0,1fr)]">
          {/* Sidebar */}
          <aside className="rounded-2xl border border-border bg-card p-3">
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter sections"
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setSelected(0) }}
                className="h-9 rounded-lg border-border bg-secondary/50 pl-9 text-xs"
              />
            </div>
            <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Sections ({filtered.length})
            </p>
            <div className="space-y-1">
              {filtered.map((item, index) => (
                <button
                  key={index}
                  onClick={() => selectDoc(index)}
                  className={`w-full rounded-xl p-3 text-left transition-colors ${selected === index ? 'bg-secondary' : 'hover:bg-secondary/60'}`}
                >
                  <div className="flex gap-3">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="truncate text-xs font-medium">{item.title}</p>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          {/* Viewer */}
          <section className="flex min-h-[600px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            {currentSection ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <div>
                    <p className="text-sm font-medium">{currentSection.title}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Previous page"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-16 text-center font-mono text-[10px] text-muted-foreground">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Next page"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-1 items-start justify-center overflow-auto bg-secondary/35 p-6 lg:p-10">
                  <article className="min-h-[670px] w-full max-w-[720px] rounded-sm border border-border bg-background px-8 py-10 text-foreground shadow-[0_16px_50px_rgba(0,0,0,0.18)] sm:px-14">
                    <div className="flex items-start justify-between border-b border-border pb-7">
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">DUNKAI / ENGINEERING PACKAGE</p>
                        <h3 className="mt-4 font-display text-3xl">{currentSection.title}</h3>
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">{String(page).padStart(2, '0')}</span>
                    </div>
                    <div className="mt-8 space-y-4">
                      {pageParas.map((para, i) => (
                        <p key={i} className="text-xs leading-6 text-muted-foreground">{para}</p>
                      ))}
                    </div>
                    <div className="mt-14 flex items-center justify-between border-t border-border pt-4 font-mono text-[9px] text-muted-foreground">
                      <span>DUNKAI AI GENERATED</span>
                      <span>DUNKAI</span>
                    </div>
                  </article>
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                No sections match your filter.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
