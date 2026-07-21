import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM, cosineSimilarity, embedText } from '../src/embeddings.js';

describe('offline embeddings', () => {
  it('produces normalized vectors of the right dimension', () => {
    const v = embedText('improve google ads quality score');
    expect(v).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('identical text → similarity 1', () => {
    const a = embedText('core web vitals');
    expect(cosineSimilarity(a, embedText('core web vitals'))).toBeCloseTo(1, 6);
  });

  it('related text scores higher than unrelated text', () => {
    const query = embedText('google ads keyword bidding budget');
    const related = embedText('set keyword bids and daily budget in google ads campaigns');
    const unrelated = embedText('chocolate cake recipe with vanilla frosting');
    expect(cosineSimilarity(query, related)).toBeGreaterThan(cosineSimilarity(query, unrelated));
  });

  it('empty text yields the zero vector with similarity 0', () => {
    const zero = embedText('');
    expect(cosineSimilarity(zero, embedText('anything'))).toBe(0);
  });
});
