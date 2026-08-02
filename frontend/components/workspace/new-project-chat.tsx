'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspaceStore } from '@/lib/store'
import { useCreateProject } from '@/hooks/use-projects'
import { toast } from 'sonner'

const suggestions = ['Design a low-power sensor board', 'Review my power architecture', 'Create a KiCad starter project']
const placeholderPrompts = [
  'Design an IoT temperature sensor with WiFi...',
  'Create a low-power wearable board...',
  'Review my power architecture...',
]

// Placeholder title — the real title will be generated from context by the AI later
const PLACEHOLDER_TITLE = 'Untitled Project'

export function NewProjectChat() {
  const { setActiveProjectId, setActiveTab, setPendingPrompt } = useWorkspaceStore()
  const createProject = useCreateProject()
  const [input, setInput] = useState('')
  const [placeholder, setPlaceholder] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  useEffect(() => {
    if (input) return
    const prompt = placeholderPrompts[placeholderIndex]
    if (placeholder.length < prompt.length) {
      const timer = window.setTimeout(() => setPlaceholder(prompt.slice(0, placeholder.length + 1)), 42)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => {
      setPlaceholder('')
      setPlaceholderIndex((current) => (current + 1) % placeholderPrompts.length)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [input, placeholder, placeholderIndex])

  const send = async () => {
    const prompt = input.trim()
    if (!prompt || createProject.isPending) return
    try {
      const project = await createProject.mutateAsync({
        title: PLACEHOLDER_TITLE,
        description: prompt,
      })
      // Hand the prompt off to the project chat so the agent starts running immediately
      setPendingPrompt(prompt)
      setActiveProjectId(project._id)
      setActiveTab('chat')
      setInput('')
    } catch {
      toast.error('Failed to start the project. Please try again.')
    }
  }

  const busy = createProject.isPending

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-4 pb-20">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[300px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.07] blur-[90px]" />
      <div className="relative z-10 mb-8 flex max-w-[720px] flex-col items-center text-center">
        <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-secondary/90">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">What are you building?</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Describe a hardware idea, ask for a design review, or bring an existing board into the workspace.
        </p>
      </div>
      <div className="relative z-10 w-full">
        <div className="mx-auto w-full max-w-[780px] px-5">
          <div className="flex h-[58px] items-center gap-2 rounded-full border border-foreground/15 bg-card/90 px-3 shadow-[0_14px_50px_rgba(0,0,0,0.22)] backdrop-blur-md transition-colors focus-within:border-foreground/35">
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Attach a file" aria-label="Attach a file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  send()
                }
              }}
              disabled={busy}
              placeholder={placeholder || placeholderPrompts[0]}
              className="h-10 flex-1 border-0 bg-transparent px-1 text-sm shadow-none placeholder:text-muted-foreground/80 focus-visible:ring-0"
            />
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-full text-muted-foreground hover:text-foreground" title="Use voice input" aria-label="Use voice input">
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              onClick={send}
              disabled={!input.trim() || busy}
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-foreground text-background hover:bg-foreground/90"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            {busy ? 'Setting up your project workspace...' : 'DunkAI can make mistakes. Review generated engineering decisions before manufacturing.'}
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-7 flex max-w-[760px] flex-wrap justify-center gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => setInput(suggestion)}
            disabled={busy}
            className="rounded-full border border-border bg-secondary/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground disabled:opacity-50"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}
