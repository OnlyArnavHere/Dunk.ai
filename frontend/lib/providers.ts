/**
 * Board-generation providers offered in the UI.
 *
 * This list mirrors dunkai-designer's provider registry (src/providers/index.mjs)
 * and the whitelist in backend/src/validators/ai.validators.js. All three have to
 * agree: the designer throws on an unknown name, and the validator turns that
 * into a 400 before a job is ever started.
 *
 * `hint` is shown next to the name because the trade-off here is not abstract —
 * claude-code is the only agentic provider and the only one that has produced a
 * board that routed, while the other three are ~100x cheaper per run.
 */

export type BoardProviderId = 'claude-code' | 'gemini' | 'groq' | 'ollama'

export interface BoardProvider {
  id: BoardProviderId
  label: string
  hint: string
  /** Set when the provider needs a key the operator supplies server-side. */
  needsServerKey?: string
}

export const BOARD_PROVIDERS: readonly BoardProvider[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    hint: 'Agentic — writes and repairs the board itself. Highest quality, highest cost.',
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'Fastest. Good structural results on gpt-oss-120b.',
    needsServerKey: 'GROQ_API_KEY',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Cloud or a local daemon. Free tier covers gpt-oss:120b.',
    needsServerKey: 'OLLAMA_API_KEY',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'Large context. Free-tier flash capacity is unreliable.',
    needsServerKey: 'GEMINI_API_KEY',
  },
] as const

export const DEFAULT_BOARD_PROVIDER: BoardProviderId = 'claude-code'

export const PROVIDER_STORAGE_KEY = 'dunkai-board-provider'

export const isBoardProviderId = (value: unknown): value is BoardProviderId =>
  typeof value === 'string' && BOARD_PROVIDERS.some((p) => p.id === value)
