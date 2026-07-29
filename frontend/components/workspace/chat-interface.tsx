'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore, type AiOutput } from '@/lib/store'
import { aiApi } from '@/lib/api'

// ---- Message types ----
type MessageRole = 'user' | 'assistant'
interface Message {
  id: string
  role: MessageRole
  content: string
  // Quick-reply options shown beneath an interview question
  options?: string[]
}

const suggestions = [
  'Design a low-power sensor board',
  'Review my power architecture',
  'Create a KiCad starter project',
]
const placeholderPrompts = [
  'Design an IoT temperature sensor with WiFi...',
  'Create a low-power wearable board...',
  'Review my power architecture...',
]

export function ChatInterface({ projectId }: { projectId: string }) {
  const { pendingPrompt, setPendingPrompt, setAiOutput } = useWorkspaceStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

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
  }, [messages, loading])

  // ---- Reset on project switch ----
  useEffect(() => {
    setMessages([])
    setInput('')
    setLoading(false)
    setCurrentStep('')
  }, [projectId])

  // ---- Core agent runner ----
  const runAgent = useCallback(async (request: string) => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-user`, role: 'user', content: request }])
    setLoading(true)
    setCurrentStep('Initializing AI Supervisor pipeline...')

    try {
      // 1. Kick off streaming job
      const res = await aiApi.runStream({
        projectId,
        action: 'run_workflow',
        messages: [
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: request }
        ],
      })
      const jobId = res?.jobId

      // No jobId → fallback to chat endpoint
      if (!jobId) {
        const chatRes = await aiApi.chat(projectId, request) as { reply?: string }
        setMessages((prev) => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: chatRes?.reply || 'Completed.',
        }])
        setLoading(false)
        setCurrentStep('')
        return
      }

      // 2. Subscribe to Socket.io job room
      const socket = (await import('@/lib/socket')).getSocket()
      socket.emit('ai:subscribe', jobId)

      const cleanup = () => {
        socket.off('ai:progress', handleProgress)
        socket.off('ai:complete', handleComplete)
        socket.off('ai:error', handleError)
        socket.emit('ai:unsubscribe', jobId)
      }

      // Progress: update the step label in the loading indicator
      const handleProgress = (data: { node?: string }) => {
        if (data.node) setCurrentStep(`Executing AI Node: ${data.node}...`)
      }

      // Complete: check for interview question OR final pipeline result
      const handleComplete = (socketData: Record<string, any>) => {
        cleanup()
        setLoading(false)
        setCurrentStep('')

        // Unwrap Socket.io wrapper
        let payload = socketData.data ?? socketData.result ?? socketData
        // Unwrap Python SSE wrapper
        if (payload && payload.data && typeof payload.data === 'object') {
          payload = payload.data
        }

        // ---- Case 1: Requirements agent needs more info ----
        if (payload.interview_status === 'question') {
          const question = String(payload.interview_question || 'Could you provide more detail?')
          const options = Array.isArray(payload.interview_options)
            ? (payload.interview_options as string[])
            : []
          setMessages((prev) => [...prev, {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            content: question,
            options: options.length > 0 ? options : undefined,
          }])
          return
        }

        // ---- Case 2: Pipeline ran, write artifacts to store ----
        if (payload) {
          setAiOutput({
            requirements: (payload.requirements as Record<string, unknown>) ?? null,
            architecture: (payload.architecture as Record<string, unknown>) ?? null,
            bom: (payload.bom as Record<string, unknown>) ?? null,
            eda_data: (payload.eda_data as Record<string, unknown>) ?? null,
            pcb_ir: (payload.pcb_ir as Record<string, unknown>) ?? null,
            validation: (payload.validation as Record<string, unknown>) ?? null,
            documentation: (payload.documentation as Record<string, unknown>) ?? null,
          } satisfies AiOutput)
        }

        // ---- Determine reply text ----
        const aiMsgs = payload.messages as Array<{ content?: string }> | undefined
        const lastAiMsg = Array.isArray(aiMsgs) ? aiMsgs[aiMsgs.length - 1]?.content : undefined
        const errors = payload.errors as string[] | undefined

        const finalMsg =
          (errors?.length
            ? `⚠️ Pipeline completed with issues: ${errors.join('; ')}`
            : undefined) ||
          lastAiMsg ||
          'AI pipeline complete. Switch to any tab to review the generated results.'

        setMessages((prev) => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: String(finalMsg),
        }])
      }

      // Error: mid-stream Python failure
      const handleError = (socketData: Record<string, any>) => {
        cleanup()
        setLoading(false)
        setCurrentStep('')

        const errObj = socketData.error
        const errorMsg = typeof errObj === 'object' ? (errObj.error || errObj.message) : errObj

        setMessages((prev) => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: `⚠️ AI Engine error: ${errorMsg || 'Pipeline failed mid-stream.'}`,
        }])
      }

      socket.on('ai:progress', handleProgress)
      socket.on('ai:complete', handleComplete)
      socket.on('ai:error', handleError)

    } catch {
      // Network/auth fallback
      try {
        const chatRes = await aiApi.chat(projectId, request) as { reply?: string }
        setMessages((prev) => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: chatRes?.reply || 'Completed.',
        }])
      } catch (fallbackErr: unknown) {
        const msg = fallbackErr instanceof Error ? fallbackErr.message : 'Failed to connect to Dunk AI'
        setMessages((prev) => [...prev, {
          id: `${Date.now()}-assistant`,
          role: 'assistant',
          content: `⚠️ ${msg}`,
        }])
      } finally {
        setLoading(false)
        setCurrentStep('')
      }
    }
  }, [projectId, setAiOutput, messages])

  // ---- Auto-run initial prompt from new-project screen ----
  useEffect(() => {
    if (pendingPrompt) {
      const p = pendingPrompt
      setPendingPrompt(null)
      runAgent(p)
    }
  }, [pendingPrompt, setPendingPrompt, runAgent])

  const send = () => {
    if (!input.trim() || loading) return
    const request = input.trim()
    setInput('')
    runAgent(request)
  }

  // ---- Composer bar (reused in both empty and active state) ----
  const composer = (
    <div className="mx-auto w-full max-w-[780px] px-5">
      <div className="flex h-[58px] items-center gap-2 rounded-full border border-foreground/15 bg-card/90 px-3 shadow-[0_14px_50px_rgba(0,0,0,0.22)] backdrop-blur-md transition-colors focus-within:border-foreground/35">
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Attach a file">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
          placeholder={placeholder || placeholderPrompts[0]}
          className="h-10 flex-1 border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
        />
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Use voice input">
          <Mic className="h-4 w-4" />
        </Button>
        <Button
          onClick={send}
          disabled={!input.trim() || loading}
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

  // ---- Empty state ----
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

  // ---- Active conversation ----
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
                {/* Quick-reply option chips for interview questions */}
                {message.options && message.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1 ml-0">
                    {message.options.map((opt) => (
                      <button
                        key={opt}
                        disabled={loading}
                        onClick={() => { setInput(''); runAgent(opt) }}
                        className="rounded-full border border-foreground/20 bg-secondary/60 px-3 py-1.5 text-xs text-foreground transition-all hover:bg-foreground hover:text-background active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Live step progress indicator */}
          {loading && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-secondary">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <span className="animate-pulse">{currentStep || 'Working through the design constraints...'}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="border-t border-border bg-background/90 py-5 backdrop-blur-xl">{composer}</div>
    </div>
  )
}
