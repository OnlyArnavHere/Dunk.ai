/**
 * A hardware idea typed on the landing page, carried into the workspace.
 *
 * The visitor is usually signed out when they type it, so it has to survive
 * signup or login (both of which land on /workspace). sessionStorage keeps it
 * to this tab and drops it when the tab closes. The new-project composer reads
 * it once to pre-fill its input; it is never sent anywhere on its own.
 */
const KEY = 'dunkai-draft-prompt'

export const saveDraftPrompt = (prompt: string): void => {
  try {
    window.sessionStorage.setItem(KEY, prompt)
  } catch {
    // Storage blocked (private mode): the visitor retypes it. Not worth failing over.
  }
}

export const takeDraftPrompt = (): string | null => {
  try {
    const value = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
    return value
  } catch {
    return null
  }
}
