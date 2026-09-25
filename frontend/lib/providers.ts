/**
 * Board-generation options offered in the UI.
 *
 * This list mirrors dunkai-designer's provider registry (src/providers/index.mjs)
 * and the whitelist in backend/src/validators/ai.validators.js. All three have to
 * agree: the designer throws on an unknown name, and the validator turns that
 * into a 400 before a job is ever started.
 *
 * An OPTION is not the same thing as a provider. One provider can appear more
 * than once when the model is the real choice — `anthropic` is offered twice,
 * as Opus 4.5 and as Sonnet 4.5 — so each entry carries its own `id` for the
 * select and localStorage, plus the `provider`/`model` pair actually sent to the
 * backend. Only `provider` is whitelisted server-side; `model` is validated by
 * the designer, which refuses anything above the 4.5 generation.
 *
 * `hint` is shown next to the name because the trade-off here is not abstract —
 * claude-code is the only agentic provider and the only one that has produced a
 * board that routed, while the OpenAI-compatible three are ~100x cheaper per run.
 */

export type BoardProviderId = 'claude-code' | 'gemini' | 'groq' | 'ollama'

export interface BoardProvider {
  /** Select value and localStorage key. Unique per OPTION, not per provider. */
  id: BoardProviderId
  /** The designer provider name sent to the backend. */
  provider: string
  /** Passed through as --model. Omitted means the provider's own default. */
  model?: string
  label: string
  hint: string
  /** Set when the provider needs a key the operator supplies server-side. */
  needsServerKey?: string
}

export const BOARD_PROVIDERS: readonly BoardProvider[] = [
  {
    id: 'claude-code',
    provider: 'claude-code',
    label: 'Claude Code',
    hint: 'Agentic — writes and repairs the board itself. Highest quality, highest cost.',
  },
  // The two Anthropic API options (Opus 4.5 / Sonnet 4.5) are deliberately NOT
  // offered. The `anthropic` provider exists and is tested in dunkai-designer,
  // but it bills against an Anthropic API key with its own prepaid credit —
  // separate from the Claude subscription `claude-code` already uses — and that
  // account is not set up. Offering an option that always fails on a missing
  // key is worse than not offering it.
  //
  // To restore: add entries with provider 'anthropic' and model
  // 'claude-opus-4-5' / 'claude-sonnet-4-5', and put a key in dunkai/.env.
  // Nothing else needs changing; the backend and designer already accept them.
  {
    id: 'groq',
    provider: 'groq',
    label: 'Groq',
    hint: 'Fastest. Good structural results on gpt-oss-120b.',
    needsServerKey: 'GROQ_API_KEY',
  },
  {
    id: 'ollama',
    provider: 'ollama',
    label: 'Ollama',
    hint: 'Cloud or a local daemon. Free tier covers gpt-oss:120b.',
    needsServerKey: 'OLLAMA_API_KEY',
  },
  {
    id: 'gemini',
    provider: 'gemini',
    label: 'Gemini',
    hint: 'Large context. Free-tier flash capacity is unreliable.',
    needsServerKey: 'GEMINI_API_KEY',
  },
] as const

export const DEFAULT_BOARD_PROVIDER: BoardProviderId = 'claude-code'

export const PROVIDER_STORAGE_KEY = 'dunkai-board-provider'

export const isBoardProviderId = (value: unknown): value is BoardProviderId =>
  typeof value === 'string' && BOARD_PROVIDERS.some((p) => p.id === value)

/** The {provider, model} pair to send for an option id. */
export const boardProviderRequest = (
  id: BoardProviderId
): { provider: string; model?: string } => {
  const option = BOARD_PROVIDERS.find((p) => p.id === id)
  // Falling back to the id keeps a stale localStorage value working as the
  // provider name it used to be, rather than starting a job with no provider.
  if (!option) return { provider: id }
  return option.model ? { provider: option.provider, model: option.model } : { provider: option.provider }
}
