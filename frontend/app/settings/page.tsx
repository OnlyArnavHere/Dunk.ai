'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, KeyRound, Moon, Palette, Save, Sun, Trash2, User as UserIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProtectedRoute } from '@/components/layouts/protected-route'
import { toast } from 'sonner'

// BYOK providers — static for now, keys are kept locally until backend support lands
const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...', hint: 'Used for GPT models' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', hint: 'Used for Claude models' },
  { id: 'google', label: 'Google AI', placeholder: 'AIza...', hint: 'Used for Gemini models' },
] as const

const STORAGE_KEY = 'dunkai-byok-keys'

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••'
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`
}

function SettingsContent() {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  const [keys, setKeys] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setMounted(true)
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setKeys(JSON.parse(stored))
    } catch {
      // Corrupted storage — start fresh
    }
  }, [])

  const persist = (next: Record<string, string>) => {
    setKeys(next)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }

  const handleSaveKey = (providerId: string) => {
    const value = (drafts[providerId] || '').trim()
    if (!value) return
    persist({ ...keys, [providerId]: value })
    setDrafts((d) => ({ ...d, [providerId]: '' }))
    toast.success('API key saved')
  }

  const handleRemoveKey = (providerId: string) => {
    const next = { ...keys }
    delete next[providerId]
    persist(next)
    toast.success('API key removed')
  }

  const light = mounted && resolvedTheme === 'light'

  return (
    <div className="min-h-screen bg-background text-foreground noise-overlay">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 right-1/3 w-[700px] h-[700px] bg-foreground/2 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-5 sm:px-10 border-b border-foreground/10">
        <Link href="/" className="flex items-center gap-2">
          <span className="font-display text-xl tracking-tight">DunkAI</span>
          <span className="font-mono text-[9px] tracking-wide text-muted-foreground">COPILOT</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/workspace')}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-2" />
          Back to workspace
        </Button>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Settings</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your workspace preferences and API keys.</p>
        </div>

        {/* BYOK */}
        <Card className="bg-secondary/30 border-foreground/10">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Bring your own keys
              <Badge variant="outline" className="text-[10px] font-mono ml-1">BETA</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Use your own AI provider keys. Keys are stored locally in this browser for now and never leave your device.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {PROVIDERS.map((provider) => {
              const savedKey = keys[provider.id]
              return (
                <div key={provider.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium">{provider.label}</label>
                    <span className="text-[10px] text-muted-foreground">{provider.hint}</span>
                  </div>
                  {savedKey ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-10 rounded-lg bg-background/50 border border-foreground/10 px-3 flex items-center font-mono text-xs text-muted-foreground">
                        {visible[provider.id] ? savedKey : maskKey(savedKey)}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label={visible[provider.id] ? 'Hide key' : 'Show key'}
                        onClick={() => setVisible((v) => ({ ...v, [provider.id]: !v[provider.id] }))}
                        className="h-10 w-10 text-muted-foreground hover:text-foreground"
                        title={visible[provider.id] ? 'Hide key' : 'Show key'}
                      >
                        {visible[provider.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        aria-label="Remove key"
                        onClick={() => handleRemoveKey(provider.id)}
                        className="h-10 w-10 text-destructive hover:bg-destructive/10"
                        title="Remove key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        value={drafts[provider.id] || ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [provider.id]: e.target.value }))}
                        placeholder={provider.placeholder}
                        className="h-10 rounded-lg bg-background/50 font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveKey(provider.id)}
                        disabled={!(drafts[provider.id] || '').trim()}
                        className="h-10 bg-foreground text-background hover:bg-foreground/90"
                      >
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* Appearance */}
        <Card className="bg-secondary/30 border-foreground/10">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Appearance
            </CardTitle>
            <CardDescription className="text-xs">Customize how DunkAI looks for you.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium">Theme</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Switch between light and dark mode.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setTheme(light ? 'dark' : 'light')}
                className="text-xs border-foreground/10"
              >
                {light ? <Moon className="w-3.5 h-3.5 mr-2" /> : <Sun className="w-3.5 h-3.5 mr-2" />}
                {light ? 'Dark mode' : 'Light mode'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account shortcut */}
        <Card className="bg-secondary/30 border-foreground/10">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <UserIcon className="w-4 h-4" />
              Account
            </CardTitle>
            <CardDescription className="text-xs">Profile details, password, and session management.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => router.push('/profile')}
              className="text-xs border-foreground/10"
            >
              Manage profile
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <SettingsContent />
    </ProtectedRoute>
  )
}
