'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { markIntroDone } from '@/lib/intro'

/**
 * The curtain between pages — the same bottom-to-top lift as the landing
 * page's intro loader, on every navigation.
 *
 * - A click on an internal link: the curtain rises to cover the page, the
 *   route changes behind it, then it lifts to reveal the new page.
 * - Any other route change (router.push after login, back/forward): the new
 *   page arrives already covered and the curtain lifts. The covered state is
 *   derived during render, so it lands in the same commit as the new page and
 *   the new page never flashes uncovered for a frame.
 *
 * The first page load is left alone: the landing page has its own loader, and
 * the app pages show theirs while auth resolves.
 */

type Phase = 'idle' | 'covering' | 'covered' | 'revealing'

const COVER_MS = 400
const REVEAL_MS = 650
/** If a route takes this long to arrive, lift anyway rather than trap the user. */
const STUCK_MS = 5000

export function PageTransition() {
  const pathname = usePathname()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [shownPath, setShownPath] = useState(pathname)
  const pending = useRef<string | null>(null)
  const timers = useRef<number[]>([])

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // A route changed. Arriving covered (or already covering) -> lift. Arriving
  // uncovered (programmatic navigation) -> cover in this very render, then lift.
  if (pathname !== shownPath) {
    setShownPath(pathname)
    setPhase('revealing')
  }

  useEffect(() => {
    if (phase !== 'revealing') return
    // The landing page's intro loader is for first loads only; arriving here
    // through the curtain counts as the intro (and starts the hero ribbon).
    markIntroDone()
    pending.current = null
    const t = window.setTimeout(() => setPhase('idle'), REVEAL_MS + 150)
    return () => clearTimeout(t)
  }, [phase])

  const navigate = useCallback(
    (href: string) => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      pending.current = href
      // Fetch the next route while the curtain rises, not after: the cover
      // animation then hides the load instead of adding to it.
      router.prefetch(href)
      setPhase('covering')
      later(() => {
        setPhase('covered')
        router.push(href)
        later(() => pending.current === href && setPhase('revealing'), STUCK_MS)
      }, reduce ? 150 : COVER_MS)
    },
    [router]
  )

  // Intercept plain left-clicks on internal links (capture phase, before
  // next/link handles them; next/link skips navigation once defaultPrevented).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Same page (including #section links): no curtain.
      if (url.pathname === window.location.pathname) return
      if (phase !== 'idle') {
        e.preventDefault()
        return
      }
      e.preventDefault()
      navigate(url.pathname + url.search + url.hash)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navigate, phase])

  if (phase === 'idle') return null

  return (
    <div
      aria-hidden
      className={`curtain fixed inset-0 z-[90] flex items-center justify-center bg-background ${
        phase === 'covering' ? 'curtain-cover' : phase === 'revealing' ? 'curtain-lift' : ''
      }`}
    >
      <div className="page-wash pointer-events-none absolute inset-0" />
      <div className={`curtain-mark relative flex items-center gap-2.5 ${phase === 'revealing' ? 'opacity-0' : 'opacity-100'}`}>
        <Image src="/logo.png" alt="" width={36} height={29} loading="eager" className="h-7 w-auto [image-rendering:pixelated]" />
        <span className="text-xl font-semibold tracking-tight">DunkAI</span>
      </div>
    </div>
  )
}
