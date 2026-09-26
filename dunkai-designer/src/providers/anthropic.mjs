/**
 * anthropic provider — Claude over the Anthropic API.
 *
 * Distinct from `claude-code`, which drives the Claude Code CLI as an agent
 * that writes the project itself. This one is a plain chat API: the model
 * returns the file contents and chat-provider.mjs writes them, exactly as for
 * the OpenAI-compatible targets. That is why it shares their prompts and their
 * validation rather than the agentic path's.
 *
 * Two models, deliberately
 * ------------------------
 * MODELS below is an allowlist, not a default. The UI offers Sonnet 4.5 and
 * Opus 4.5 and nothing above them, and the cap is enforced HERE because the UI
 * is not the only caller: `--model` is a free-form CLI argument and
 * DESIGNER_MODEL is a free-form environment variable, so a check that lived
 * only in the picker would not be a cap at all. A newer, pricier model is
 * therefore a named error rather than a silent upgrade on somebody's bill.
 */

import Anthropic from "@anthropic-ai/sdk"
import { note } from "../lib/events.mjs"
import { createChatProvider, backoffMs, sleep } from "./chat-provider.mjs"

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/**
 * The only models this provider will run, newest first.
 *
 * Both are the 4.5 generation on purpose — see the header. Aliases let the UI
 * and a human on the CLI say "sonnet" without pinning the exact id in three
 * places.
 */
const MODELS = {
  "claude-opus-4-5": { label: "Claude Opus 4.5", aliases: ["opus", "opus-4.5", "opus4.5"] },
  "claude-sonnet-4-5": { label: "Claude Sonnet 4.5", aliases: ["sonnet", "sonnet-4.5", "sonnet4.5"] },
}

const DEFAULT_MODEL = "claude-opus-4-5"

/** Resolve a requested model to an allowed id, or explain why it is refused. */
export function resolveModel(requested) {
  if (!requested) return DEFAULT_MODEL

  const wanted = String(requested).trim()
  if (MODELS[wanted]) return wanted

  const lowered = wanted.toLowerCase()
  for (const [id, cfg] of Object.entries(MODELS)) {
    if (cfg.aliases.includes(lowered)) return id
  }

  throw new Error(
    `anthropic provider refuses model "${wanted}". This provider is capped at the ` +
      `4.5 generation and will only run: ${Object.keys(MODELS).join(", ")}. ` +
      `Pick one of those, or use a different --provider.`
  )
}

/** Join the text blocks of a message; Claude may return several. */
function textOf(message) {
  return (message.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
}

/**
 * Whether a thrown SDK error is worth another attempt.
 *
 * Checked most-specific first. 429 and 5xx are weather; a bad key or a model
 * the account cannot reach is an account fact, and retrying it just spends ten
 * more minutes arriving at the same message.
 */
function retryability(err) {
  if (err instanceof Anthropic.RateLimitError) return { retry: true, why: "rate limited" }
  if (err instanceof Anthropic.InternalServerError) return { retry: true, why: `HTTP ${err.status}` }
  if (err instanceof Anthropic.APIConnectionError) return { retry: true, why: "connection failed" }
  if (err instanceof Anthropic.APIError && err.status >= 500) {
    return { retry: true, why: `HTTP ${err.status}` }
  }
  return { retry: false, why: null }
}

function createClient({ model, timeoutMs, maxTokens }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      "anthropic provider needs ANTHROPIC_API_KEY. The designer inherits its " +
        "environment from the supervisor, so set it in dunkai/.env (the file " +
        "load_dotenv() resolves) and restart the supervisor."
    )
  }

  // Retries are handled below rather than by the SDK, so that the backoff and
  // the progress lines match every other provider in this project.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs })

  /**
   * One completion, with retries.
   *
   * `json` is honoured through the prompt rather than a parameter — the
   * Messages API has no response_format — and chat-provider.mjs's brace-slice
   * parser is what actually tolerates a model that wraps the object in prose.
   *
   * Streamed because stage D asks for three complete source files: that is a
   * long generation, and a non-streaming request at this max_tokens is the
   * shape that hits an HTTP timeout rather than an answer.
   */
  return async function chat(messages, { tokens = maxTokens } = {}) {
    let lastError = null

    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const stream = client.messages.stream({ model, max_tokens: tokens, messages })
        const message = await stream.finalMessage()
        const content = textOf(message)

        if (message.stop_reason === "refusal") {
          throw new Error(
            `Claude declined the request (stop_reason=refusal${
              message.stop_details?.category ? `, ${message.stop_details.category}` : ""
            })`
          )
        }

        if (!content.trim()) {
          if (message.stop_reason === "max_tokens") {
            throw new Error(
              `${model} returned no content (stop_reason=max_tokens); the reply was ` +
                "cut off before the answer — raise DESIGNER_MAX_TOKENS"
            )
          }
          throw new Error(`${model} returned an empty reply`)
        }

        if (message.stop_reason === "max_tokens") {
          // Content exists but is truncated: almost certainly a half-written
          // file, which would fail the syntax check with a confusing message.
          throw new Error(
            `${model} hit max_tokens (${tokens}) mid-reply, so the files are ` +
              "incomplete — raise DESIGNER_MAX_TOKENS"
          )
        }

        const usage = message.usage
          ? {
              ...message.usage,
              total_tokens: (message.usage.input_tokens ?? 0) + (message.usage.output_tokens ?? 0),
            }
          : undefined

        return { content, usage }
      } catch (err) {
        lastError = err
        const { retry, why } = retryability(err)
        if (!retry || attempt === 4) throw lastError

        // The SDK surfaces the server's retry-after on the response headers.
        const wait = backoffMs(attempt, err.headers?.["retry-after"])
        note(
          `  Anthropic ${why}, retrying in ${Math.round(wait / 1000)}s (attempt ${attempt}/4)`
        )
        await sleep(wait)
      }
    }

    throw lastError
  }
}

export function createAnthropicProvider(options = {}) {
  const model = resolveModel(options.model ?? process.env.DESIGNER_ANTHROPIC_MODEL)
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxTokens = options.maxTokens ?? Number(process.env.DESIGNER_MAX_TOKENS ?? 16000)
  const chat = createClient({ model, timeoutMs, maxTokens })

  return createChatProvider({
    name: "anthropic",
    label: MODELS[model].label,
    model,
    chat,
    maxTokens,
  })
}
