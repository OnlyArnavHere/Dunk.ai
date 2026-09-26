'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CircuitBoard, Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'

export function AuthShell({ children, title, description }: { children: React.ReactNode; eyebrow?: string; title: string; description: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => setMounted(true), [])
  const light = mounted && resolvedTheme === 'light'
  
  return (
    <main className="min-h-screen bg-[#0F0F0F] text-[#F3F2F0] flex font-sans">
      {/* Left Panel */}
      <section className="relative flex flex-col w-full lg:w-1/2 min-h-screen z-10 px-6 sm:px-12 py-8">
        
        {/* Header - Top Left */}
        <header className="flex items-center justify-between w-full">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <CircuitBoard className="h-6 w-6 text-[#E16744]" />
            <span className="font-serif text-2xl tracking-tight font-medium">DunkAI</span>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(light ? 'dark' : 'light')} className="h-9 w-9 rounded-full text-muted-foreground hover:bg-white/10 hover:text-white">
              {light ? <Moon className="h-4 w-4"/> : <Sun className="h-4 w-4"/>}
            </Button>
          </div>
        </header>

        {/* Center Content */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-[520px] mx-auto mt-[-40px]">
          <div className="text-center mb-10">
            <h1 className="font-serif text-[48px] sm:text-[56px] leading-[1.1] tracking-tight mb-4 text-[#EFECE6]">{title}</h1>
            <p className="text-xl text-[#EFECE6]/70 tracking-wide">{description}</p>
          </div>
          
          <div className="w-full rounded-3xl border border-white/10 bg-[#161616]/80 p-8 sm:p-10 shadow-2xl backdrop-blur-xl">
            {children}
          </div>

        </div>
      </section>

      {/* Right Panel - Image */}
      <section className="hidden lg:flex w-1/2 p-4 min-h-screen">
        <div className="relative w-full h-full rounded-[32px] overflow-hidden bg-[#161616] border border-white/5">
          <img 
            src="/images/hardware_workbench.jpg" 
            alt="Hardware Workbench" 
            className="object-cover w-full h-full opacity-90"
          />
        </div>
      </section>
    </main>
  )
}

export function GoogleButton() {
  const { loginWithGoogle } = useAuth()
  return (
    <Button 
      type="button" 
      variant="outline" 
      className="h-14 w-full rounded-xl border-white/10 bg-[#282828] hover:bg-[#333333] hover:text-white text-[#EFECE6] transition-colors text-[17px] font-semibold" 
      onClick={loginWithGoogle}
    >
      {/* Small Google 'G' Icon */}
      <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Continue with Google
    </Button>
  )
}
