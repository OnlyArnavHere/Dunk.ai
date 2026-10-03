/**
 * "The intro loader has lifted", shared between the loader and the scenes
 * that animate in behind it (the hero ribbon draws itself as the curtain
 * rises).
 *
 * Module state on purpose: it survives client-side navigation, so returning
 * to the landing page from the app does not replay the loader, while a full
 * reload starts it fresh.
 */
let done = false
const listeners = new Set<() => void>()

export const introDone = (): boolean => done

export function markIntroDone(): void {
  if (done) return
  done = true
  listeners.forEach((listener) => listener())
  listeners.clear()
}

/** Runs `callback` once the intro is done — immediately if it already is. */
export function onIntroDone(callback: () => void): () => void {
  if (done) {
    callback()
    return () => {}
  }
  listeners.add(callback)
  return () => listeners.delete(callback)
}
