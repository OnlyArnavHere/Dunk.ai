'use client'

import React from 'react'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { ChatInterface } from './chat-interface'
import { RequirementsView } from './views/requirements-view'
import { ArchitectureView } from './views/architecture-view'
import { BOMView } from './views/bom-view'
import { ValidationView } from './views/validation-view'
import { DocsView } from './views/docs-view'
import { PcbView } from './views/pcb-view'
import { NewProjectChat } from './new-project-chat'
import { EdaViewer } from './views/eda-viewer'
import { CodeView } from './views/code-view'
import { useWorkspaceStore, type AiOutput } from '@/lib/store'

// `node` is the LangGraph node name the backend emits over the `ai:progress`
// socket event (see ai_engine/agents/supervisor/graph.py). `outputKey` is the
// AiOutput field that same stage's result lands in — the two are NOT the same
// string for every tab (eda/pcb/docs/code all differ), so they're kept
// separate rather than reusing one id for both lookups.
const tabs: Array<{ id: string; label: string; node: string; outputKey?: keyof AiOutput | Array<keyof AiOutput> }> = [
  { id: 'chat', label: 'Chat', node: '' },
  { id: 'requirements', label: 'Requirements', node: 'requirements', outputKey: 'requirements' },
  { id: 'architecture', label: 'Architecture', node: 'architecture', outputKey: 'architecture' },
  { id: 'bom', label: 'BOM', node: 'component', outputKey: 'bom' },
  { id: 'eda', label: 'EDA', node: 'eda_enrichment', outputKey: 'eda_data' },
  { id: 'pcb', label: 'PCB', node: 'pcb', outputKey: 'pcb_ir' },
  { id: 'validation', label: 'Validation', node: 'validation', outputKey: ['handoff_validation', 'validation'] },
  { id: 'docs', label: 'Docs', node: 'documentation', outputKey: 'documentation' },
  { id: 'code', label: 'Code', node: 'code_generation', outputKey: 'code_generation' },
]

export function MainEditor() {
  const { activeProjectId, activeTab, setActiveTab, pipelineProgress, aiOutput, boardJob } = useWorkspaceStore()

  if (!activeProjectId) {
    return <NewProjectChat />
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-background/50 via-background/40 to-background/50">
      {/* View Nav Tabs with Live Progress Indicators */}
      <div className="z-20 border-b border-foreground/10 bg-background/85 px-8 pt-6 shrink-0 backdrop-blur-xl">
        <div className="flex items-center gap-2 pb-6 overflow-x-auto">
          {tabs.map((tab) => {
            // The PCB tab shows the actual generated board (traces, 3D view,
            // gerbers) — a separate, much longer-running job (dunkai-designer,
            // tracked as `boardJob`) that starts only AFTER the main pipeline's
            // fast 'pcb' node finishes producing pcb_ir. Reflecting pcb_ir here
            // like every other tab reflects its own node output made the tab
            // turn green the moment the IR existed, well before there was any
            // actual board to look at — including while board generation was
            // still visibly running.
            const isRunning =
              tab.id === 'pcb'
                ? boardJob.status === 'running' || pipelineProgress.activeNode === tab.node
                : Boolean(tab.node && pipelineProgress.activeNode === tab.node)
            const outputKeys = tab.outputKey ? (Array.isArray(tab.outputKey) ? tab.outputKey : [tab.outputKey]) : []
            const isComplete =
              tab.id === 'pcb'
                ? Boolean(aiOutput?.board)
                : Boolean(
                    tab.node &&
                      (pipelineProgress.completedNodes.includes(tab.node) ||
                        (aiOutput && outputKeys.some((key) => aiOutput[key])))
                  )

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium transition-all duration-300 whitespace-nowrap relative group active:scale-95 flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground active:text-foreground'
                }`}
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 text-sky-400 animate-spin shrink-0" />
                ) : isComplete ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                ) : null}

                <span>{tab.label}</span>

                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content — ALL views stay mounted; active one visible */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
          <ChatInterface projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'pcb' ? 'block' : 'hidden'}`}>
          <PcbView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'requirements' ? 'block' : 'hidden'}`}>
          <RequirementsView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'architecture' ? 'block' : 'hidden'}`}>
          <ArchitectureView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'bom' ? 'block' : 'hidden'}`}>
          <BOMView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'validation' ? 'block' : 'hidden'}`}>
          <ValidationView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'eda' ? 'block' : 'hidden'}`}>
          <EdaViewer projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'docs' ? 'block' : 'hidden'}`}>
          <DocsView projectId={activeProjectId} />
        </div>
        <div className={`absolute inset-0 overflow-hidden ${activeTab === 'code' ? 'block' : 'hidden'}`}>
          <CodeView projectId={activeProjectId} />
        </div>
      </div>
    </div>
  )
}
