import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../src/crypto.js';

const KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

describe('AES-256-GCM token crypto', () => {
  it('round-trips plaintext', () => {
    const secret = 'ya29.a0AfB_refresh-token-∆-unicode';
    expect(decrypt(encrypt(secret, KEY), KEY)).toBe(secret);
  });

  it('produces distinct ciphertexts for the same input (random IV)', () => {
    expect(encrypt('same', KEY)).not.toBe(encrypt('same', KEY));
  });

  it('throws on tampered ciphertext', () => {
    const payload = encrypt('secret', KEY);
    const [iv, tag, ct] = payload.split('.');
    const tampered = `${iv}.${tag}.${ct!.slice(0, -2)}AA`;
    expect(() => decrypt(tampered, KEY)).toThrow();
  });

  it('throws on a wrong key', () => {
    const payload = encrypt('secret', KEY);
    const other = 'f'.repeat(64);
    expect(() => decrypt(payload, other)).toThrow();
  });

  it('rejects malformed keys', () => {
    expect(() => encrypt('x', 'short')).toThrow(/64 hex/);
  });
});
