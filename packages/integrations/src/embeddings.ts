// Offline deterministic embeddings: 512-dim hashed bag-of-words over word
// unigrams + bigrams, L2-normalized. Swappable for a real embedding API later.

import { hashString } from './util/hash.js';

export const EMBEDDING_DIM = 512;

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export function embedText(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const bump = (token: string, weight: number) => {
    const i = hashString(token) % EMBEDDING_DIM;
    vec[i] = (vec[i] ?? 0) + weight;
  };
  const words = tokens(text);
  for (const w of words) bump(w, 1);
  for (let i = 0; i < words.length - 1; i++) bump(`${words[i]} ${words[i + 1]}`, 0.5);
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
