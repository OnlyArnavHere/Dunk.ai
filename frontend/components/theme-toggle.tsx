'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  // Avoid hydration mismatch: theme is unknown until mounted on the client
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const light = mounted && resolvedTheme === 'light'
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(light ? 'dark' : 'light')}
      className="h-9 w-9 rounded-full text-foreground bg-card hover:bg-secondary shadow-sm border border-border"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </Button>
  )
}
