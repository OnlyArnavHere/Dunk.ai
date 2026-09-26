'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, Loader2 } from 'lucide-react'
import { AuthShell, GoogleButton, PasswordInput } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'
import { ApiError } from '@/lib/axios-client'

// Mirrors registerValidation in backend/src/validators/auth.validators.js.
// Checked here so the user sees what is missing as they type; the backend
// still enforces it, and only reports "Validation failed" when it does.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
]

/** The backend's per-field reason, instead of its generic "Validation failed". */
function registrationError(err: unknown): string {
  if (err instanceof ApiError) {
    const first = err.errors.find((e): e is { msg: string } => typeof (e as { msg?: unknown })?.msg === 'string')
    return first?.msg ?? err.message
  }
  return err instanceof Error ? err.message : 'Registration failed'
}

export default function SignupPage() {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordOk = PASSWORD_RULES.every((rule) => rule.test(password))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!passwordOk) {
      setError('Choose a password that meets all the requirements below.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await register(name, email, password)
    } catch (err) {
      setError(registrationError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell 
      title="Make the first move" 
      description="Create your workspace and turn the next hardware idea into a board-ready plan."
    >
      <div className="space-y-5">
        <GoogleButton />
        
        <div className="flex items-center gap-3 py-3">
          <div className="h-px flex-1 bg-border" />
          <span className="font-sans text-[13px] uppercase tracking-wider text-muted-foreground font-semibold">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            required
            autoComplete="name"
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="h-14 rounded-xl bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring text-[17px] px-5"
            disabled={loading}
          />

          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="h-14 rounded-xl bg-background border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring text-[17px] px-5"
            disabled={loading}
          />

          <div className="space-y-2.5">
            <PasswordInput
              id="password"
              required
              autoComplete="new-password"
              aria-label="Create a password"
              aria-describedby="password-rules"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              disabled={loading}
            />
            <ul id="password-rules" className="flex flex-wrap gap-x-4 gap-y-1 px-1 text-[13px]">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(password)
                return (
                  <li
                    key={rule.label}
                    className={`flex items-center gap-1.5 transition-colors ${met ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    <Check className={`h-3.5 w-3.5 ${met ? 'opacity-100' : 'opacity-30'}`} aria-hidden />
                    <span>
                      {rule.label}
                      <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="h-14 w-full rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-semibold text-[17px]"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Create account'}
          </Button>

          <p className="text-center text-[13px] leading-5 text-muted-foreground">
            By continuing, you agree to DunkAI's terms and privacy policy.
          </p>
        </form>

        <p className="text-center text-[15px] text-muted-foreground pt-3">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground hover:underline underline-offset-4 transition-colors font-semibold">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
