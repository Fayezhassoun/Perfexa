// Deterministic hashing / PRNG utilities used by all mock paths.

import { createHash } from 'node:crypto';

/** FNV-1a 32-bit hash — fast, stable across runs/platforms. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** sha256 hex digest, optionally truncated. */
export function hashHex(s: string, len = 10): string {
  return createHash('sha256').update(s).digest('hex').slice(0, len);
}

/** mulberry32 seeded PRNG → [0,1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic pick from a non-empty array. */
export function pickDeterministic<T>(seed: number, arr: readonly T[]): T {
  const item = arr[seed % arr.length];
  if (item === undefined) throw new Error('pickDeterministic: empty array');
  return item;
}

/** Deterministic number in [min, max] from a seed. */
export function seededRange(seed: number, min: number, max: number): number {
  const r = seededRandom(seed)();
  return Math.round(min + r * (max - min));
}

/** ISO date string (YYYY-MM-DD) n days before `from` (default now). */
export function dateDaysAgo(n: number, from: Date = new Date()): string {
  const d = new Date(from.getTime() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    const first = url.replace(/^https?:\/\//, '').split('/')[0] ?? '';
    return first.replace(/^www\./, '');
  }
}
