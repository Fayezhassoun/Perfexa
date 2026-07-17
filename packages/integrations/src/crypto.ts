// AES-256-GCM encryption for connected-account tokens at rest (CONTRACTS §7).

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyFromEnv(keyHex?: string): Buffer {
  const hex = keyHex ?? process.env.ENCRYPTION_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      'ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256-GCM. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypt → "base64url(iv).base64url(tag).base64url(ciphertext)". */
export function encrypt(plaintext: string, keyHex?: string): string {
  const key = keyFromEnv(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ct].map((b) => b.toString('base64url')).join('.');
}

/** Decrypt a payload produced by {@link encrypt}. Throws on tampering. */
export function decrypt(payload: string, keyHex?: string): string {
  const key = keyFromEnv(keyHex);
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload (expected iv.tag.ct)');
  const iv = Buffer.from(parts[0] ?? '', 'base64url');
  const tag = Buffer.from(parts[1] ?? '', 'base64url');
  const ct = Buffer.from(parts[2] ?? '', 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
