import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveModel, createAnthropicProvider } from "../src/providers/anthropic.mjs"
import { getProvider, PROVIDER_NAMES } from "../src/providers/index.mjs"

/**
 * The cap is the point of this provider, so it is what gets tested.
 *
 * These are the checks that would have caught a newer model reaching the API:
 * the allowlist is enforced in the factory, not only in the UI, because
 * `--model` and DESIGNER_MODEL both bypass the UI entirely.
 */

test("defaults to Opus 4.5 when no model is named", () => {
  assert.equal(resolveModel(undefined), "claude-opus-4-5")
  assert.equal(resolveModel(""), "claude-opus-4-5")
})

test("accepts exactly the two 4.5 models", () => {
  assert.equal(resolveModel("claude-opus-4-5"), "claude-opus-4-5")
  assert.equal(resolveModel("claude-sonnet-4-5"), "claude-sonnet-4-5")
})

test("accepts the short aliases the UI and a human would type", () => {
  assert.equal(resolveModel("sonnet"), "claude-sonnet-4-5")
  assert.equal(resolveModel("Sonnet"), "claude-sonnet-4-5")
  assert.equal(resolveModel("sonnet4.5"), "claude-sonnet-4-5")
  assert.equal(resolveModel("opus"), "claude-opus-4-5")
  assert.equal(resolveModel("opus-4.5"), "claude-opus-4-5")
})

test("refuses every model above the 4.5 generation", () => {
  // The whole reason the allowlist exists: a newer model must be a named
  // error, never a silent and more expensive substitution.
  for (const model of ["claude-opus-5", "claude-sonnet-5", "claude-opus-5-5", "claude-fable-5-1"]) {
    assert.throws(() => resolveModel(model), /capped at the 4\.5 generation/, `should refuse ${model}`)
  }
})

test("refuses a model from another vendor rather than passing it through", () => {
  assert.throws(() => resolveModel("gpt-4"), /refuses model "gpt-4"/)
})

test("the refusal names the models that ARE allowed", () => {
  // An error that only says "no" makes the caller go and read the source.
  assert.throws(() => resolveModel("claude-opus-5"), (err) => {
    assert.match(err.message, /claude-opus-4-5/)
    assert.match(err.message, /claude-sonnet-4-5/)
    return true
  })
})

test("a missing API key fails with the fix, not a stack trace", () => {
  const saved = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    assert.throws(() => createAnthropicProvider({}), /ANTHROPIC_API_KEY/)
    assert.throws(() => createAnthropicProvider({}), /dunkai\/\.env/)
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
  }
})

test("the model cap is checked before the API key, so the message is the useful one", () => {
  // Order matters: told "bad model" AND "no key", the model is the thing the
  // caller can act on without going to find a credential first.
  const saved = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY
  try {
    assert.throws(() => createAnthropicProvider({ model: "claude-opus-5" }), /capped at the 4\.5/)
  } finally {
    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved
  }
})

test("anthropic is registered and satisfies the provider interface", () => {
  assert.ok(PROVIDER_NAMES.includes("anthropic"))

  const saved = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = "test-key-not-used"
  try {
    const provider = getProvider("anthropic", { model: "sonnet" })
    assert.equal(provider.name, "anthropic")
    assert.equal(provider.model, "claude-sonnet-4-5")
    for (const member of ["synthesiseFootprint", "generateProject", "repair"]) {
      assert.equal(typeof provider[member], "function", `missing ${member}`)
    }
  } finally {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  }
})

test("claude-code is still a separate provider from anthropic", () => {
  // They are both Claude; conflating them would silently change which one runs
  // and which account pays for it.
  assert.ok(PROVIDER_NAMES.includes("claude-code"))
  assert.notEqual(getProvider("claude-code").name, "anthropic")
})
