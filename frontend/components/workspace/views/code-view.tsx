'use client'

import React, { useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Code2,
  Copy,
  Check,
  FileCode,
  Download,
  ChevronDown,
  ChevronRight,
  Cpu,
  Terminal,
  Braces,
  MessageSquare,
  Send,
  Loader2,
  X,
} from 'lucide-react'
import { aiApi } from '@/lib/api'
import { useWorkspaceStore, type AiOutput } from '@/lib/store'

interface CodeFile {
  filename: string
  language: string
  description: string
  code: string
  category: string
}

interface CodeGenData {
  project_name: string
  processing_unit: string
  files: CodeFile[]
  total_files: number
  languages_used: string[]
}

const LANG_COLORS: Record<string, string> = {
  c: 'text-blue-400',
  cpp: 'text-blue-300',
  python: 'text-yellow-400',
  javascript: 'text-yellow-300',
  typescript: 'text-blue-400',
}

const LANG_LABELS: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  firmware: Cpu,
  driver: Terminal,
  ai_ml: Braces,
  config: FileCode,
}

function CodeBlock({ file, isExpanded, onToggle }: { file: CodeFile; isExpanded: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(file.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation()
    const blob = new Blob([file.code], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const CategoryIcon = CATEGORY_ICONS[file.category] || FileCode
  const langColor = LANG_COLORS[file.language] || 'text-muted-foreground'
  const langLabel = LANG_LABELS[file.language] || file.language

  return (
    <div className="rounded-xl border border-foreground/10 bg-background/60 overflow-hidden transition-all duration-200 hover:border-foreground/20">
      {/* Header — a row, not a button: the copy/download buttons live in it,
          and a <button> may not contain another <button>. */}
      <div className="w-full flex items-center hover:bg-foreground/5 transition-colors">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className="flex flex-1 min-w-0 items-center gap-3 py-4 pl-5 pr-3 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <CategoryIcon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground truncate">{file.filename}</span>
              <span className={`text-[10px] font-mono uppercase tracking-wider ${langColor}`}>{langLabel}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{file.description}</p>
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0 pr-5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
            title="Copy to clipboard"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleDownload}
            title="Download file"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Code Content */}
      {isExpanded && (
        <div className="border-t border-foreground/5">
          <ScrollArea className="max-h-[500px]">
            <pre className="p-5 text-[13px] leading-6 font-mono text-foreground/90 overflow-x-auto whitespace-pre">
              {file.code.trim()}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export function CodeView({ projectId }: { projectId: string }) {
  const aiOutput = useWorkspaceStore((s) => s.aiOutput)
  const setAiOutput = useWorkspaceStore((s) => s.setAiOutput)
  const codeGen = (aiOutput?.code_generation ?? null) as CodeGenData | null
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set([0]))
  
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!input.trim() || loading || !codeGen?.files) return
    
    const userMsg = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    
    try {
      const res = await aiApi.codeChat(projectId, codeGen.files, [...messages, userMsg])
      
      if (res.updated_files && res.updated_files.length > 0) {
        const existingFiles = [...codeGen.files]
        res.updated_files.forEach((updated: any) => {
          const idx = existingFiles.findIndex((f) => f.filename === updated.filename)
          if (idx !== -1) existingFiles[idx] = { ...existingFiles[idx], ...updated }
          else existingFiles.push(updated)
        })
        setAiOutput({ code_generation: { ...codeGen, files: existingFiles } })
      }
      
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
    } catch (err) {
      console.error('[CodeAssistant] error:', err)
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error updating the code.' }])
    } finally {
      setLoading(false)
    }
  }

  const toggleFile = (index: number) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const expandAll = () => {
    if (codeGen?.files) {
      setExpandedFiles(new Set(codeGen.files.map((_, i) => i)))
    }
  }

  const collapseAll = () => {
    setExpandedFiles(new Set())
  }

  if (!codeGen || !codeGen.files || codeGen.files.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-foreground/10 bg-foreground/5 mb-5">
          <Code2 className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No code generated yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Code suggestions will appear here after the AI pipeline completes. The agent will generate
          firmware, drivers, and configuration files based on your project's architecture and components.
        </p>
      </div>
    )
  }

  const categories = [...new Set(codeGen.files.map((f) => f.category))]

  return (
    <div className="h-full flex flex-row min-h-0 w-full">
      {/* Main Code Area */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="shrink-0 border-b border-foreground/10 bg-background/85 backdrop-blur-xl px-8 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Code Generation
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {codeGen.total_files} file{codeGen.total_files !== 1 ? 's' : ''} generated for{' '}
              <span className="font-medium text-foreground">{codeGen.project_name}</span>
              {' · '}
              <span className="font-mono text-xs">{codeGen.processing_unit}</span>
              {' · '}
              {codeGen.languages_used.map((l) => LANG_LABELS[l] || l).join(', ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={expandAll} className="text-xs">
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs">
              Collapse All
            </Button>
            <Button 
              variant={chatOpen ? "default" : "outline"} 
              size="sm" 
              onClick={() => setChatOpen(!chatOpen)}
              className="text-xs gap-1.5 ml-2"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Code Assistant
            </Button>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex items-center gap-2 mt-4">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] || FileCode
            const count = codeGen.files.filter((f) => f.category === cat).length
            return (
              <span
                key={cat}
                className="inline-flex items-center gap-1.5 rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs font-medium text-muted-foreground"
              >
                <Icon className="h-3 w-3" />
                {cat.replace('_', ' ')} ({count})
              </span>
            )
          })}
        </div>
      </div>

      {/* File list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-8 space-y-4">
          {codeGen.files.map((file, index) => (
            <CodeBlock
              key={`${file.filename}-${index}`}
              file={file}
              isExpanded={expandedFiles.has(index)}
              onToggle={() => toggleFile(index)}
            />
          ))}
        </div>
      </ScrollArea>
      </div>

      {/* Chat Sidebar */}
      {chatOpen && (
        <div className="w-[380px] shrink-0 border-l border-foreground/10 bg-background/95 backdrop-blur-xl flex flex-col h-full shadow-2xl relative z-10">
          <div className="shrink-0 p-4 border-b border-foreground/10 flex items-center justify-between bg-background/50">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Code2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Code Assistant</h3>
                <p className="text-[10px] text-muted-foreground">Ask to rewrite or modify code</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setChatOpen(false)} className="h-8 w-8 rounded-full">
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4 pb-4">
              {messages.length === 0 && (
                <div className="text-center py-10 px-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    I can modify the generated code for you. Try asking me to rewrite a file in Python, add a new driver, or explain how a function works.
                  </p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                    msg.role === 'user' 
                      ? 'bg-foreground text-background rounded-tr-sm' 
                      : 'bg-foreground/5 text-foreground rounded-tl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-foreground/5 rounded-tl-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground font-medium">Updating code...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
          
          <div className="shrink-0 p-4 bg-background/50 border-t border-foreground/5">
            <form onSubmit={handleSend} className="relative flex items-end gap-2 bg-foreground/5 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-foreground/20 transition-shadow">
              <input 
                type="text" 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask for changes..."
                className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                disabled={loading}
              />
              <Button type="submit" size="icon" disabled={!input.trim() || loading} className="h-9 w-9 shrink-0 rounded-xl bg-foreground text-background hover:bg-foreground/90">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
