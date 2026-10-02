import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

/**
 * AES-256-GCM for secrets at rest — users' BYOK provider keys.
 *
 * The stored form is `v1:<iv>:<tag>:<ciphertext>`, all base64. GCM's tag means
 * a value encrypted under a different BYOK_ENCRYPTION_KEY (or tampered with)
 * fails to decrypt instead of decrypting to garbage that gets sent to a
 * provider as a key.
 */

let warned = false;

const encryptionKey = () => {
  let material = env.byokEncryptionKey;
  if (!material) {
    // env.js refuses to start in production without it; this is dev only.
    if (!warned) {
      console.warn('[secrets] BYOK_ENCRYPTION_KEY is not set; deriving a development key from JWT_ACCESS_SECRET.');
      warned = true;
    }
    material = `dev-byok:${env.accessSecret}`;
  }
  return crypto.createHash('sha256').update(material).digest();
};

export const encryptSecret = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
};

export const decryptSecret = (stored) => {
  const [version, iv, tag, ciphertext] = String(stored || '').split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw ApiError.internal('Stored secret is malformed');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
};

/** `gsk_…a1b2` — enough to recognise a key, never enough to use one. */
export const maskSecret = (plaintext) => {
  const value = String(plaintext || '');
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
};
