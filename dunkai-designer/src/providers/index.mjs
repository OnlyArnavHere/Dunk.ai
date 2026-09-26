/**
 * Provider registry.
 *
 * A provider turns a design brief into tscircuit sources, and synthesises a
 * land pattern when the catalogue has nothing (Stage B tier 5). Keeping this
 * behind one interface is what makes `--provider` a real switch rather than a
 * setting that only one implementation honours.
 *
 * Two kinds live here. `claude-code` is agentic: it is given the project
 * directory and writes the files itself. The rest are chat APIs that ask for
 * file contents as JSON and write them on the model's behalf, sharing
 * chat-provider.mjs for everything above the transport — `anthropic` speaks the
 * Messages API, the other three speak the OpenAI /chat/completions shape. All
 * satisfy the same four-member interface, so stages B, D and the repair loop
 * cannot tell them apart.
 *
 * `claude-code` and `anthropic` are both Claude and are still different
 * choices: the first spends a Claude Code subscription and can edit its own
 * output through tooling, the second spends API credit and answers in one shot.
 */

import { createClaudeCodeProvider } from "./claude-code.mjs"
import { createAnthropicProvider } from "./anthropic.mjs"
import {
  createOpenAICompatibleProvider,
  OPENAI_COMPATIBLE_TARGETS,
} from "./openai-compatible.mjs"

const REGISTRY = {
  "claude-code": createClaudeCodeProvider,
  anthropic: createAnthropicProvider,
  ...Object.fromEntries(
    OPENAI_COMPATIBLE_TARGETS.map((target) => [
      target,
      (options) => createOpenAICompatibleProvider(target, options),
    ])
  ),
}

export const PROVIDER_NAMES = Object.keys(REGISTRY)

export function getProvider(name = "claude-code", options = {}) {
  const factory = REGISTRY[name]
  if (!factory) {
    throw new Error(`unknown provider "${name}" — available: ${PROVIDER_NAMES.join(", ")}`)
  }
  return factory(options)
}
