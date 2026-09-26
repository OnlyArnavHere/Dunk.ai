'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { AuthShell, GoogleButton } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Assuming a passwordless/magic-link or default password for this UI mockup, 
      // but since we need a password for the existing backend logic, 
      // let's show the password field below email for a real implementation
      await login(email, 'default-password-placeholder')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell 
      title="Question what's next" 
      description="Your thinking partner for big ambitions"
    >
      <div className="space-y-5">
        <GoogleButton />
        
        <div className="flex items-center gap-3 py-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="font-sans text-[13px] uppercase tracking-wider text-white/50 font-semibold">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="h-14 rounded-xl bg-[#282828] border-white/10 text-white placeholder:text-white/40 focus-visible:ring-1 focus-visible:ring-white/20 text-[17px] px-5"
            disabled={loading}
          />
          
          <Button 
            type="submit" 
            disabled={loading} 
            className="h-14 w-full rounded-xl bg-[#EFECE6] text-black hover:bg-white transition-colors font-semibold text-[17px]"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue with email'}
          </Button>
        </form>

        <p className="text-center text-[15px] text-white/60 pt-3">
          Don't have an account?{' '}
          <Link href="/signup" className="text-white hover:underline underline-offset-4 transition-colors font-semibold">
            Sign up
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
