import { describe, expect, it } from 'vitest';
import { canonicalJson, payloadHash } from '../src/audit.js';

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });
  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });
});

describe('payloadHash', () => {
  it('is key-order independent', () => {
    expect(payloadHash({ a: 1, b: 'x' })).toBe(payloadHash({ b: 'x', a: 1 }));
  });
  it('differs for different payloads', () => {
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });
  it('is a sha256 hex string', () => {
    expect(payloadHash({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
