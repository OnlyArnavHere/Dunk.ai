import { create } from 'zustand'

// ---- Generated board artifacts (dunkai-designer output) ----
export interface BoardArtifact {
  design_name: string | null
  out_dir: string
  urls: {
    circuitJson?: string
    schematicSvg?: string
    pcbSvg?: string
    bomCsv?: string
    pickAndPlaceCsv?: string
    gerbersDir?: string
    gerbersZip?: string
    boardGlb?: string
    boardGltfJson?: string
    designBrief?: string
    resolution?: string
  }
  sizes: Record<string, number>
  stats: {
    elements?: number
    errors?: number
    warnings?: number
    components?: number
    traces?: number
    bomRows?: number
    errorTypes?: string[]
    resolvedComponents?: number
    unresolvedComponents?: number
    placeholderPinComponents?: number
    substitutedComponents?: number
    gltf?: { glbBytes?: number; rawBytes?: number; cadComponents?: number; meshes?: number } | null
  }
  generated_at: string
}

/** Live progress for a board-generation job, mirrored from ai:progress. */
export interface BoardJob {
  status: 'idle' | 'running' | 'done' | 'error'
  jobId: string | null
  stage: string | null
  label: string | null
  detail: string | null
  error: string | null
  /** Per-stage log, so the UI can show what happened rather than just a spinner. */
  log: Array<{ stage: string | null; label: string; detail: string | null; at: number }>
}

export interface PipelineProgress {
  activeNode: string
  completedNodes: string[]
}

const idleBoardJob: BoardJob = {
  status: 'idle',
  jobId: null,
  stage: null,
  label: null,
  detail: null,
  error: null,
  log: [],
}

// ---- Shape of the AI pipeline output (mirrors CircuitState from Python) ----
export interface AiOutput {
  requirements: Record<string, unknown> | null
  architecture: Record<string, unknown> | null
  bom: Record<string, unknown> | null
  eda_data: Record<string, unknown> | null
  pcb_ir: Record<string, unknown> | null
  // Schema 1.0 only — carries `passed`. Left null by every current run.
  validation: Record<string, unknown> | null
  // Schema 2.0 — carries `well_formed`. This is the key validation_node
  // actually writes for a current design; `validation` above stayed null and
  // the Validation tab rendered its empty state on every run until this was
  // carried through. The two are deliberately separate keys in CircuitState
  // (see ai_engine/agents/supervisor/state.py) and stay separate here.
  handoff_validation: Record<string, unknown> | null
  documentation: Record<string, unknown> | null
  // Present only after "Generate PCB" has run. Lives inside AiOutput on purpose:
  // a fresh pipeline run replaces the whole object, which clears a board that
  // belongs to a previous BOM rather than showing it against new components.
  board: BoardArtifact | null
}

interface WorkspaceState {
  activeProjectId: string | null
  activeTab: string
  sidebarCollapsed: boolean
  pendingPrompt: string | null

  // Live AI pipeline output — populated when the supervisor stream completes
  aiOutput: AiOutput | null
  boardJob: BoardJob

  // Pipeline node progress — updated by chat-interface as nodes complete
  pipelineProgress: PipelineProgress

  // Counter incremented by sidebar "New Chat" to signal chat-interface to reset
  chatResetCounter: number

  // Selected AI Model for chat / supervisor pipeline
  selectedModel: string
  setSelectedModel: (model: string) => void

  setActiveProjectId: (id: string | null) => void
  setActiveTab: (tab: string) => void
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setPendingPrompt: (prompt: string | null) => void
  setAiOutput: (output: AiOutput) => void
  clearAiOutput: () => void

  setPipelineProgress: (progress: PipelineProgress) => void
  clearPipelineProgress: () => void
  triggerChatReset: () => void
  startBoardJob: (jobId: string) => void
  pushBoardProgress: (update: { stage?: string | null; label?: string | null; detail?: string | null }) => void
  completeBoardJob: (board: BoardArtifact) => void
  failBoardJob: (error: string) => void
  resetBoardJob: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: null,
  activeTab: 'chat',
  sidebarCollapsed: true,
  pendingPrompt: null,
  aiOutput: null,
  boardJob: idleBoardJob,
  pipelineProgress: { activeNode: '', completedNodes: [] },
  chatResetCounter: 0,
  selectedModel: 'openai/gpt-oss-120b',

  setSelectedModel: (model) => set({ selectedModel: model }),
  setActiveProjectId: (id) => set({ activeProjectId: id }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),
  setAiOutput: (output) => set({ aiOutput: output, boardJob: idleBoardJob }),
  clearAiOutput: () => set({ aiOutput: null, boardJob: idleBoardJob }),

  setPipelineProgress: (progress) => set({ pipelineProgress: progress }),
  clearPipelineProgress: () => set({ pipelineProgress: { activeNode: '', completedNodes: [] } }),
  triggerChatReset: () => set((state) => ({ chatResetCounter: state.chatResetCounter + 1 })),

  startBoardJob: (jobId) =>
    set({ boardJob: { ...idleBoardJob, status: 'running', jobId, label: 'Starting board generation' } }),

  pushBoardProgress: (update) =>
    set((state) => {
      const label = update.label ?? state.boardJob.label ?? ''
      return {
        boardJob: {
          ...state.boardJob,
          status: 'running',
          stage: update.stage ?? state.boardJob.stage,
          label,
          detail: update.detail ?? null,
          log: label
            ? [...state.boardJob.log, { stage: update.stage ?? null, label, detail: update.detail ?? null, at: Date.now() }]
            : state.boardJob.log,
        },
      }
    }),

  completeBoardJob: (board) =>
    set((state) => ({
      boardJob: { ...state.boardJob, status: 'done', detail: null, error: null },
      aiOutput: state.aiOutput ? { ...state.aiOutput, board } : state.aiOutput,
    })),

  failBoardJob: (error) =>
    set((state) => ({ boardJob: { ...state.boardJob, status: 'error', error } })),

  resetBoardJob: () => set({ boardJob: idleBoardJob }),
}))
