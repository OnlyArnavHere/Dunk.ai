'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore, type AiOutput, type BoardArtifact } from '@/lib/store'
import { ModelSelector } from './model-selector'
import { aiApi, chatApi, projectApi } from '@/lib/api'
import { useUpdateProject } from '@/hooks/use-projects'
import { useBoardGeneration } from '@/hooks/use-board-generation'

// ---- Message types ----
type MessageRole = 'user' | 'assistant'
interface Message {
  id: string
  role: MessageRole
  content: string
  // Quick-reply options shown beneath an interview question
  options?: string[]
}

const UNHINGED_LOADERS = [
  '🔥 Cooking up your hardware requirements...',
  '💣 Wrecking outdated architectural assumptions...',
  '🍭 Mixing the secret engineering sauce...',
  '🚀 Launching the hardware idea cannon...',
  '⚡ Zapping PCB traces into existence...',
  '🧪 Brewing high-voltage circuit magic...',
  '🔧 Tightening microcontrollers and sensor loops...',
  '🎸 Shredding through component datasheets...',
  '🌪️ Spinning up the hardware topology matrix...',
  '🏗️ Assembling something legendary...',
  '🧠 Downloading AI brain cells for your design...',
  '🎯 Locking onto your engineering vision...',
  '💀 Destroying generic circuit blueprints...',
  '🔮 Consulting the silicon oracle...',
  '🍳 Frying up fresh BOM line items...',
  '🏎️ Revving the component selection engine...',
  '🌶️ Adding extra spice to your circuit architecture...',
]

function humanText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  if (!text) return fallback

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text) as { question?: unknown; content?: unknown; message?: unknown }
      for (const candidate of [parsed.question, parsed.content, parsed.message]) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
      }
    } catch {
      // Preserve normal prose that merely starts with a bracket.
    }
  }
  return text
}

function humanOptions(value: unknown): string[] {
  let raw = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = [raw]
    }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    raw = (raw as { options?: unknown }).options
  }
  if (!Array.isArray(raw)) return []

  return raw.reduce<string[]>((choices, item) => {
    const label = typeof item === 'string'
      ? item
      : item && typeof item === 'object'
        ? String((item as { label?: unknown; text?: unknown; value?: unknown }).label ?? (item as { text?: unknown }).text ?? (item as { value?: unknown }).value ?? '')
        : ''
    const clean = label.trim()
    if (clean && !/^(other|custom)(\b|\s|[-—:])/i.test(clean) && !choices.includes(clean)) choices.push(clean)
    return choices
  }, []).slice(0, 8)
}

const suggestions = [
  'Design a smart water purifier with BLE and quality sensors',
  'Design a low-power sensor board',
  'Review my power architecture',
  'Create a KiCad starter project',
]
const placeholderPrompts = [
  'Design a smart water purifier with BLE & status LED...',
  'Design an IoT temperature sensor with WiFi...',
  'Create a low-power wearable board...',
]

// The three notices the chat posts around an automatic board run. Kept here so
// the failure wording is identical whether the run died before it got a jobId
// or after.
const BOARD_STARTING = 'Generating PCB...'
const BOARD_DONE = 'PCB generated — open the PCB tab for the layout, the 3D board and the manufacturing files.'
const boardFailure = (error: string | null) => `⚠️ PCB generation failed: ${error ?? 'unknown error'}`

export function ChatInterface({ projectId }: { projectId: string }) {
  const { pendingPrompt, setPendingPrompt, setAiOutput, hydrateAiOutput, setActiveTab, setPipelineProgress, clearPipelineProgress, chatResetCounter, selectedModel, setSelectedModel } = useWorkspaceStore()
  const updateProject = useUpdateProject()
  // Board generation runs itself off the back of the pipeline; this view owns
  // the trigger because this is where the pipeline's completion lands.
  const { generate: generateBoard } = useBoardGeneration(projectId)
  const boardJob = useWorkspaceStore((s) => s.boardJob)
  // The jobId of a board run this view started, so the outcome is announced
  // once and only for a run the chat is actually narrating.
  const announcedBoardJobRef = useRef<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [placeholder, setPlaceholder] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  
  const [completedNodes, setCompletedNodes] = useState<string[]>([])
  const [activeNode, setActiveNode] = useState<string>('')
  const [unhingedMsg, setUnhingedMsg] = useState<string>(UNHINGED_LOADERS[0])

  const bottomRef = useRef<HTMLDivElement>(null)

  // ---- Sync pipeline progress to workspace store for top Nav Tabs ----
  useEffect(() => {
    setPipelineProgress({ activeNode, completedNodes })
  }, [activeNode, completedNodes, setPipelineProgress])

  // ---- Unhinged loader rotation ----
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setUnhingedMsg(UNHINGED_LOADERS[Math.floor(Math.random() * UNHINGED_LOADERS.length)])
    }, 2400)
    return () => clearInterval(interval)
  }, [loading])

  // ---- Animated placeholder ----
  useEffect(() => {
    if (input) return
    const prompt = placeholderPrompts[placeholderIndex]
    if (placeholder.length < prompt.length) {
      const t = window.setTimeout(() => setPlaceholder(prompt.slice(0, placeholder.length + 1)), 42)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      setPlaceholder('')
      setPlaceholderIndex((i) => (i + 1) % placeholderPrompts.length)
    }, 1800)
    return () => window.clearTimeout(t)
  }, [input, placeholder, placeholderIndex])

  // ---- Auto-scroll ----
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, activeNode])

  // Show an assistant line and persist it — the pattern every reply in this
  // view already follows. The id carries a suffix because the board notices can
  // land in the same millisecond as the pipeline's closing message.
  const postAssistant = useCallback((content: string, chatId: string | null) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${prev.length}-assistant`, role: 'assistant', content },
    ])
    if (chatId) chatApi.saveMessage(chatId, 'assistant', content).catch(() => {})
  }, [])

  // ---- Report how an automatic board run ended ----
  // Only for a run this view announced: a board started by hand from the BOM
  // tab narrates itself there and should not appear in the transcript twice.
  useEffect(() => {
    const announced = announcedBoardJobRef.current
    if (!announced || boardJob.jobId !== announced) return
    if (boardJob.status !== 'done' && boardJob.status !== 'error') return

    announcedBoardJobRef.current = null
    postAssistant(boardJob.status === 'done' ? BOARD_DONE : boardFailure(boardJob.error), activeChatId)
  }, [boardJob.status, boardJob.jobId, boardJob.error, activeChatId, postAssistant])

  // ---- Load Chat History & Saved Artifacts from MongoDB ----
  useEffect(() => {
    let isMounted = true
    // Reset messages when active project changes so previous project messages are not retained
    setMessages([])

    async function loadChatAndHistory() {
      if (!projectId) return
      try {
        // 1. Fetch saved project artifacts from MongoDB
        const projectData = (await projectApi.get(projectId)) as Record<string, unknown>
        if (projectData && isMounted) {
          // Mongoose stores these as Mixed with `default: {}`, so an untouched
          // field arrives as `{}` (or absent) rather than null. `{}` must not
          // reach the store: it is indistinguishable from a real-but-empty
          // artifact downstream, and it would replace nothing with nothing.
          const saved = (key: string): Record<string, unknown> | null => {
            const val = projectData[key]
            return val && typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length > 0
              ? (val as Record<string, unknown>)
              : null
          }

          const restored: AiOutput = {
            requirements: saved('requirements'),
            architecture: saved('architecture'),
            bom: saved('bom'),
            eda_data: saved('eda_data'),
            pcb_ir: saved('pcb_ir'),
            validation: saved('validation'),
            // Schema 2.0 designs report here and leave `validation` unset, so
            // forwarding only `validation` left the Validation tab empty on
            // every current run. Not a column on Project yet, so this stays
            // null until the run that produced it writes it somewhere.
            handoff_validation: saved('handoff_validation'),
            documentation: saved('documentation'),
            // The board's files live under uploads/boards/ and outlive the
            // session; `urls` points straight at them, so restoring the saved
            // object is enough to bring the PCB, DRC and Docs figures back.
            // Written by the backend when the run completes, not from here.
            board: saved('board') as BoardArtifact | null,
          }

          // A project with nothing saved yet must not push a wall of nulls into
          // a store that a run may already have filled.
          //
          // hydrateAiOutput, not setAiOutput: this is a replay of the saved
          // design, not a run that produced a new BOM, and setAiOutput would
          // read the restored bom/pcb_ir as new components and discard the
          // board generated from them.
          if (Object.values(restored).some((value) => value !== null)) {
            hydrateAiOutput(restored)
          }
        }

        // 2. Fetch conversation history from MongoDB
        const chatsRes = (await chatApi.list(projectId)) as { items?: Array<{ _id: string; messageCount?: number }> }
        const chatList = chatsRes?.items || []
        const primaryChat = chatList.find((c) => (c.messageCount || 0) > 0) || chatList[0]
        let chatId = primaryChat?._id

        if (!chatId) {
          const newChat = (await chatApi.create(projectId, 'Project Chat')) as { _id: string }
          chatId = newChat?._id
        }

        if (isMounted) {
          if (chatId) setActiveChatId(chatId)

          // Fetch messages across all chats for this project
          const allMsgs: Array<{ type: string; content: string; metadata?: { options?: string[] } }> = []
          for (const c of chatList) {
            try {
              const msgRes = (await chatApi.messages(c._id)) as {
                items?: Array<{ type: string; content: string; metadata?: { options?: string[] } }>
              }
              if (msgRes?.items?.length) {
                allMsgs.push(...msgRes.items)
              }
            } catch {
              // Ignore single chat failure
            }
          }

          if (isMounted) {
            const parsed: Message[] = allMsgs.map((m, idx) => ({
              id: `history-${idx}`,
              role: (m.type === 'user' ? 'user' : 'assistant') as MessageRole,
              content: m.content,
              options: m.metadata?.options,
            }))

            setMessages(parsed)

            const lastAssistant = parsed.filter((m) => m.role === 'assistant').pop()
            if (lastAssistant?.options) {
              setActiveQuestionId(lastAssistant.id)
            }
          }
        }
      } catch {
        // Soft fallback
      }
    }

    setMessages([])
    setInput('')
    setLoading(false)
    setSelectedOptions([])
    setActiveQuestionId(null)
    setCompletedNodes([])
    setActiveNode('')
    clearPipelineProgress()
    loadChatAndHistory()

    return () => {
      isMounted = false
    }
  }, [projectId, clearPipelineProgress, hydrateAiOutput])

  // ---- Watch for "New Chat" reset signal from sidebar ----
  useEffect(() => {
    if (chatResetCounter === 0) return // Skip initial mount
    setMessages([])
    setInput('')
    setLoading(false)
    setSelectedOptions([])
    setActiveQuestionId(null)
    setCompletedNodes([])
    setActiveNode('')
    setActiveChatId(null)
    // Re-initialize the chat session
    async function reinitChat() {
      try {
        const chatsRes = (await chatApi.list(projectId)) as { items?: Array<{ _id: string }> }
        const chatId = chatsRes?.items?.[0]?._id
        if (chatId) setActiveChatId(chatId)
      } catch {
        // Soft fallback
      }
    }
    reinitChat()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatResetCounter])

  // ---- Core agent runner ----
  const runAgent = useCallback(
    async (request: string) => {
      const userMessageId = `${Date.now()}-user`
      setMessages((prev) => {
        if (prev.some((m) => m.content === request)) return prev
        return [...prev, { id: userMessageId, role: 'user', content: request }]
      })
      setLoading(true)
      setCompletedNodes([])
      setActiveNode('supervisor')

      // Dynamically resolve targetChatId if state hasn't populated yet
      let targetChatId = activeChatId
      if (!targetChatId && projectId) {
        try {
          const chatsRes = (await chatApi.list(projectId)) as { items?: Array<{ _id: string }> }
          targetChatId = chatsRes?.items?.[0]?._id || null
          if (!targetChatId) {
            const newChat = (await chatApi.create(projectId, 'Project Chat')) as { _id: string }
            targetChatId = newChat?._id
          }
          if (targetChatId) {
            setActiveChatId(targetChatId)
          }
        } catch {
          // Soft fallback
        }
      }

      // Save user message to MongoDB
      if (targetChatId) {
        try {
          await chatApi.saveMessage(targetChatId, 'user', request)
        } catch {
          // Ignore save error to allow streaming
        }
      }

      try {
        const res = await aiApi.runStream({
          projectId,
          action: 'run_workflow',
          model: selectedModel,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: request },
          ],
        })
        const jobId = res?.jobId

        if (!jobId) {
          const chatRes = (await aiApi.chat(projectId, request)) as { reply?: string }
          const replyText = chatRes?.reply || 'Completed.'
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: replyText },
          ])
          if (targetChatId) {
            chatApi.saveMessage(targetChatId, 'assistant', replyText).catch(() => {})
          }
          setLoading(false)
          setActiveNode('')
          return
        }

        const socket = (await import('@/lib/socket')).getSocket()
        socket.emit('ai:subscribe', jobId)

        const cleanup = () => {
          socket.off('ai:progress', handleProgress)
          socket.off('ai:complete', handleComplete)
          socket.off('ai:error', handleError)
          socket.emit('ai:unsubscribe', jobId)
        }

        const handleProgress = (data: { node?: string }) => {
          if (data.node) {
            setActiveNode(data.node)
            setCompletedNodes((prev) => (prev.includes(data.node!) ? prev : [...prev, data.node!]))
          }
        }

        const handleComplete = async (socketData: Record<string, any>) => {
          cleanup()
          setLoading(false)
          setActiveNode('')

          let payload = socketData.data ?? socketData.result ?? socketData
          if (payload && payload.data && typeof payload.data === 'object') {
            payload = payload.data
          }

          // Case 1: Requirements agent needs clarifying response
          if (payload.interview_status === 'question') {
            const question = humanText(payload.interview_question, 'Could you provide more detail?')
            const options = humanOptions(payload.interview_options)
            const messageId = `${Date.now()}-assistant`
            const assistantMsg: Message = {
              id: messageId,
              role: 'assistant',
              content: question,
              options: options.length > 0 ? options : undefined,
            }
            setMessages((prev) => [...prev, assistantMsg])
            setSelectedOptions([])
            setActiveQuestionId(messageId)

            if (targetChatId) {
              chatApi.saveMessage(targetChatId, 'assistant', question, options).catch(() => {})
            }
            return
          }

          const errors = payload.errors as string[] | undefined

          // Case 2: Full workflow complete -> update state, persist to MongoDB, and update dynamic project title
          if (payload) {
            const artifactPayload = {
              requirements: (payload.requirements as Record<string, unknown>) ?? null,
              architecture: (payload.architecture as Record<string, unknown>) ?? null,
              bom: (payload.bom as Record<string, unknown>) ?? null,
              eda_data: (payload.eda_data as Record<string, unknown>) ?? null,
              pcb_ir: (payload.pcb_ir as Record<string, unknown>) ?? null,
              validation: (payload.validation as Record<string, unknown>) ?? null,
              // Schema 2.0 designs report here and leave `validation` unset, so
              // forwarding only `validation` leaves the Validation tab empty on
              // every current run.
              handoff_validation: (payload.handoff_validation as Record<string, unknown>) ?? null,
              documentation: (payload.documentation as Record<string, unknown>) ?? null,
              code_generation: (payload.code_generation as Record<string, unknown>) ?? null,
              board: (payload.board as AiOutput['board']) ?? null,
            } satisfies AiOutput

            const anyPopulated = Object.values(artifactPayload).some((value) => value != null)

            // A run that failed and produced nothing has nothing to contribute.
            // Writing it would be a no-op under the merging `setAiOutput`, but
            // skipping it keeps the failure purely a chat message and leaves
            // the board job log of the design still on screen untouched.
            if (anyPopulated || !errors?.length) {
              setAiOutput(artifactPayload)
            }

            // Persist all generated artifacts to MongoDB Project Document
            const updatePayload: Record<string, unknown> = {}
            if (artifactPayload.requirements) updatePayload.requirements = artifactPayload.requirements
            if (artifactPayload.architecture) updatePayload.architecture = artifactPayload.architecture
            if (artifactPayload.bom) updatePayload.bom = artifactPayload.bom
            if (artifactPayload.eda_data) updatePayload.eda_data = artifactPayload.eda_data
            if (artifactPayload.pcb_ir) updatePayload.pcb_ir = artifactPayload.pcb_ir
            if (artifactPayload.validation) updatePayload.validation = artifactPayload.validation
            if (artifactPayload.handoff_validation) updatePayload.handoff_validation = artifactPayload.handoff_validation
            if (artifactPayload.documentation) updatePayload.documentation = artifactPayload.documentation
            if (artifactPayload.code_generation) updatePayload.code_generation = artifactPayload.code_generation

            if (payload.requirements && typeof payload.requirements === 'object') {
              const reqs = payload.requirements as Record<string, unknown>
              const projName = typeof reqs.project_name === 'string' ? reqs.project_name.trim() : null
              if (projName && projName.toLowerCase() !== 'untitled project') {
                updatePayload.title = projName
              }
              setActiveTab('requirements')
            }

            if (Object.keys(updatePayload).length > 0) {
              updateProject.mutate({ id: projectId, data: updatePayload })
            }
          }

          const aiMsgs = payload.messages as Array<{ content?: string }> | undefined
          const lastAiMsg = Array.isArray(aiMsgs) ? aiMsgs[aiMsgs.length - 1]?.content : undefined

          const finalMsg =
            (errors?.length ? `⚠️ Pipeline completed with issues: ${errors.join('; ')}` : undefined) ||
            lastAiMsg ||
            'AI pipeline complete. Switch to any tab to review the generated results.'

          const cleanReply = humanText(finalMsg, 'Requirements are ready to review.')
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: cleanReply },
          ])

          if (targetChatId) {
            chatApi.saveMessage(targetChatId, 'assistant', cleanReply).catch(() => {})
          }

          // The pipeline's last act is a PCB handoff, so the board run starts
          // here instead of waiting for someone to find the button. Guarded on
          // a handoff that actually carries components: a run that failed
          // before pcb_ir, or a chat turn that only answered a question, has
          // nothing to build and must not announce that it is building it.
          const handoff = payload.pcb_ir as { components?: unknown[] } | null | undefined
          const handoffComponents = Array.isArray(handoff?.components) ? handoff.components.length : 0
          if (handoffComponents > 0 && useWorkspaceStore.getState().boardJob.status !== 'running') {
            postAssistant(BOARD_STARTING, targetChatId)

            await generateBoard()

            // generate() either reached startBoardJob, which means there is a
            // jobId for the watcher to match on, or it failed before getting
            // one (the POST itself was refused). The second case never produces
            // a state change the watcher can recognise, so it is reported here.
            const started = useWorkspaceStore.getState().boardJob
            if (started.jobId) announcedBoardJobRef.current = started.jobId
            else if (started.status === 'error') postAssistant(boardFailure(started.error), targetChatId)
          }
        }

        const handleError = (socketData: Record<string, any>) => {
          cleanup()
          setLoading(false)
          setActiveNode('')

          const errObj = socketData.error
          const errorMsg = typeof errObj === 'object' ? errObj.error || errObj.message : errObj
          const reply = `⚠️ AI Engine error: ${errorMsg || 'Pipeline failed mid-stream.'}`

          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: reply },
          ])

          if (targetChatId) {
            chatApi.saveMessage(targetChatId, 'assistant', reply).catch(() => {})
          }
        }

        socket.on('ai:progress', handleProgress)
        socket.on('ai:complete', handleComplete)
        socket.on('ai:error', handleError)
      } catch {
        try {
          const chatRes = (await aiApi.chat(projectId, request)) as { reply?: string }
          const reply = chatRes?.reply || 'Completed.'
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: reply },
          ])
          if (activeChatId) {
            chatApi.saveMessage(activeChatId, 'assistant', reply).catch(() => {})
          }
        } catch (fallbackErr: unknown) {
          const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Failed to connect to Dunk AI'
          setMessages((prev) => [
            ...prev,
            { id: `${Date.now()}-assistant`, role: 'assistant', content: `⚠️ ${msg}` },
          ])
        } finally {
          setLoading(false)
          setActiveNode('')
        }
      }
    },
    [projectId, activeChatId, messages, setAiOutput, setActiveTab, updateProject, generateBoard, postAssistant]
  )

  // Auto-run initial prompt passed from new project initial screen
  useEffect(() => {
    if (pendingPrompt) {
      const p = pendingPrompt
      setPendingPrompt(null)
      runAgent(p)
    }
  }, [pendingPrompt, setPendingPrompt, runAgent])

  const send = () => {
    if ((!input.trim() && selectedOptions.length === 0) || loading) return
    const customAnswer = input.trim()
    const request = [
      selectedOptions.length > 0 ? `Selected answers:\n- ${selectedOptions.join('\n- ')}` : '',
      customAnswer,
    ]
      .filter(Boolean)
      .join('\n\n')
    setInput('')
    setSelectedOptions([])
    setActiveQuestionId(null)
    runAgent(request)
  }

  const toggleOption = (option: string) => {
    setSelectedOptions((current) =>
      current.includes(option) ? current.filter((item) => item !== option) : [...current, option]
    )
  }

  const composer = (
    <div className="mx-auto w-full max-w-[780px] px-5">
      <div className="flex h-[58px] items-center gap-2 rounded-full border border-foreground/15 bg-card/90 px-3 shadow-[0_14px_50px_rgba(0,0,0,0.22)] backdrop-blur-md transition-colors focus-within:border-foreground/35">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Attach a file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={loading} />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              send()
            }
          }}
          placeholder={selectedOptions.length ? 'Add any details, or send your selections...' : placeholder || placeholderPrompts[0]}
          className="h-10 flex-1 border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
        />
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Use voice input">
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={send}
          disabled={(!input.trim() && selectedOptions.length === 0) || loading}
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        DunkAI can make mistakes. Review generated engineering decisions before manufacturing.
      </p>
    </div>
  )

  if (!messages.length && !loading) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4 pb-20">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[200px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.07] blur-[90px]" />
        <div className="relative z-10 mb-8 flex max-w-[720px] flex-col items-center text-center">
          <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-secondary/90">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <h1 className="font-display text-4xl tracking-tight sm:text-5xl">What are you building?</h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
            Describe a hardware idea, ask for a design review, or bring an existing board into the workspace.
          </p>
        </div>
        <div className="relative z-10 w-full">{composer}</div>
        <div className="relative z-10 mt-7 flex max-w-[760px] flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setInput(s)}
              className="rounded-full border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-5 py-10">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {message.role === 'assistant' && (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              )}
              <div className="flex flex-col gap-2 max-w-[680px]">
                <div className={`text-sm leading-7 ${message.role === 'user' ? 'rounded-2xl bg-secondary px-4 py-3' : 'text-foreground'}`}>
                  {message.content}
                </div>
                {message.options && message.options.length > 0 && (
                  <div className="mt-2 ml-0">
                    <div className="flex flex-wrap gap-2">
                      {message.options.map((opt) => {
                        const isSelected = selectedOptions.includes(opt)
                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={loading || activeQuestionId !== message.id}
                            aria-pressed={isSelected}
                            onClick={() => toggleOption(opt)}
                            className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${
                              isSelected
                                ? 'border-foreground bg-foreground text-background shadow-sm'
                                : 'border-foreground/20 bg-secondary/60 text-foreground hover:border-foreground/40 hover:bg-secondary'
                            }`}
                          >
                            <span className="font-bold text-[11px]">{isSelected ? '✓' : '+'}</span>
                            <span>{opt}</span>
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Select one or multiple options above, then click send — or type custom details below.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Clean, compact loader with unhinged message */}
          {loading && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground rounded-2xl border border-border/80 bg-card/60 px-4 py-3.5 shadow-md backdrop-blur-md max-w-[680px]">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary shrink-0">
                <Sparkles className="h-3.5 w-3.5 text-sky-400 animate-spin" />
              </div>
              <span className="font-medium text-foreground/90 animate-pulse">{unhingedMsg}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-border bg-background/90 py-5 backdrop-blur-xl">{composer}</div>
    </div>
  )
}
