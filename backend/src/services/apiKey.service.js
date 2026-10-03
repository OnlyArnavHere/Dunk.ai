import { User } from '../models/User.js';
import { BYOK_PROVIDERS, BYOK_PROVIDER_IDS } from '../config/providers.js';
import { ApiError } from '../utils/ApiError.js';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/secrets.js';

/**
 * Users' own provider keys (BYOK).
 *
 * Plaintext exists in exactly two places: the request that saves a key (to
 * verify and encrypt it), and resolveCredentials, whose result goes only into
 * the supervisor request body. The browser only ever gets `masked`.
 */

const loadKeys = async (userId) => {
  const user = await User.findById(userId).select('+apiKeys');
  if (!user) throw ApiError.notFound('User not found');
  return user;
};

const describe = (provider, entry) => ({
  provider,
  label: BYOK_PROVIDERS[provider].label,
  powers: BYOK_PROVIDERS[provider].powers,
  configured: Boolean(entry),
  masked: entry?.masked ?? null,
  verifiedAt: entry?.verifiedAt ?? null,
});

export const listApiKeys = async (user) => {
  const doc = await loadKeys(user._id);
  return BYOK_PROVIDER_IDS.map((provider) => describe(provider, doc.apiKeys?.get(provider)));
};

/** Provider ids the user has a key for. Reads no secrets. */
export const configuredProviders = async (userId) => {
  const doc = await loadKeys(userId);
  return new Set(doc.apiKeys ? [...doc.apiKeys.keys()] : []);
};

/**
 * Prove the key works with a cheap authenticated read, so a typo surfaces
 * here and not three minutes into a pipeline run.
 *
 * 401/403 (and Gemini's 400 API_KEY_INVALID) mean the provider refused the key.
 * 429 means it authenticated and is rate-limited: a valid key, so it is kept.
 */
export const verifyApiKey = async (provider, key) => {
  const { label, verify } = BYOK_PROVIDERS[provider];
  const { url, headers } = verify(key);

  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new ApiError(502, `Could not reach ${label} to verify the key. Try again in a moment.`);
  }

  if ([400, 401, 403].includes(response.status)) {
    throw ApiError.badRequest(`${label} rejected this key. Check that it was copied in full and is still active.`);
  }
  if (!response.ok && response.status !== 429) {
    throw new ApiError(502, `${label} returned HTTP ${response.status} while verifying the key. Try again shortly.`);
  }
};

export const saveApiKey = async (user, provider, rawKey) => {
  const key = String(rawKey || '').trim();
  await verifyApiKey(provider, key);

  const doc = await loadKeys(user._id);
  if (!doc.apiKeys) doc.apiKeys = new Map();
  doc.apiKeys.set(provider, {
    encrypted: encryptSecret(key),
    masked: maskSecret(key),
    verifiedAt: new Date(),
  });
  await doc.save();
  return describe(provider, doc.apiKeys.get(provider));
};

export const removeApiKey = async (user, provider) => {
  const doc = await loadKeys(user._id);
  doc.apiKeys?.delete(provider);
  await doc.save();
  return describe(provider, null);
};

/**
 * `{ groq: 'gsk_…', gemini: '…' }` for the supervisor request body.
 *
 * A key that no longer decrypts (BYOK_ENCRYPTION_KEY was rotated) is skipped,
 * not fatal: the run falls back to the hosted key, and Settings shows the
 * provider as configured until the user re-enters it.
 */
export const resolveCredentials = async (userId) => {
  const doc = await loadKeys(userId);
  const credentials = {};
  for (const [provider, entry] of doc.apiKeys ?? []) {
    try {
      credentials[provider] = decryptSecret(entry.encrypted);
    } catch {
      console.warn(`[BYOK] stored ${provider} key for user ${userId} could not be decrypted; skipping it.`);
    }
  }
  return credentials;
};
