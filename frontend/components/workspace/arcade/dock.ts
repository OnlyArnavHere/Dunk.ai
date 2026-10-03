/** Where the arcade launcher sits, as offsets from the viewport's bottom-right corner. */
export interface Dock {
  right: number
  bottom: number
}

export const DEFAULT_DOCK: Dock = { right: 24, bottom: 132 }

/** The launcher bubble is h-16 w-16. */
export const SHIP_SIZE = 64

const EDGE = 8
const STORAGE_KEY = 'dunk-arcade-dock'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const clampDock = (dock: Dock): Dock => ({
  right: clamp(dock.right, EDGE, window.innerWidth - SHIP_SIZE - EDGE),
  bottom: clamp(dock.bottom, EDGE, window.innerHeight - SHIP_SIZE - EDGE),
})

export const loadDock = (): Dock => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (typeof saved?.right === 'number' && typeof saved?.bottom === 'number') return clampDock(saved)
  } catch {
    // Storage blocked or corrupt: fall back to the default spot.
  }
  return clampDock(DEFAULT_DOCK)
}

export const saveDock = (dock: Dock) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dock))
  } catch {
    // Not persisting the position is harmless.
  }
}

export const dockStyle = (dock: Dock) => ({ right: dock.right, bottom: dock.bottom })
