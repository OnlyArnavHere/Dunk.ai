'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Loader2 } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authApi } from '@/lib/api'

function ResetPasswordContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('Invalid or missing reset token')
      return
    }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPassword(token, password)
      router.push('/workspace')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <AuthShell eyebrow="Account recovery" title="Invalid link" description="The reset link is invalid or has expired. Please request a new one.">
        <Button asChild className="h-12 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90">
          <Link href="/forgot-password">Request new link</Link>
        </Button>
      </AuthShell>
    )
  }

  return (
    <AuthShell eyebrow="Account recovery" title="Set new password" description="Enter your new password below to regain access to your workspace.">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            {error}
          </div>
        )}
        <div>
          <label htmlFor="password" className="mb-2 block text-xs font-medium">New password</label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="h-12 rounded-xl bg-secondary/50"
            disabled={loading}
          />
          <p className="mt-2 text-xs text-muted-foreground">Must be at least 8 characters with one uppercase letter and one number.</p>
        </div>
        <Button type="submit" disabled={loading} className="h-12 w-full rounded-xl bg-foreground text-background hover:bg-foreground/90">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Reset password <ArrowRight className="ml-2 h-4 w-4" /></>}
        </Button>
      </form>
    </AuthShell>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams requires a Suspense boundary for static prerendering
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
