import { describe, expect, it } from 'vitest';
import { createMockSocialAdapter } from '../src/social.js';
import { fetchMockReviews } from '../src/reviews.js';
import { analyzeSentiment, sentimentForReview } from '../src/sentiment.js';

const NOW = new Date('2026-07-18T12:00:00Z');

describe('mock social adapter', () => {
  it('publishes with a stable external id for identical inputs', async () => {
    const adapter = createMockSocialAdapter('instagram');
    const a = await adapter.publishPost({ content: 'Hello Chicago!' }, NOW);
    const b = await adapter.publishPost({ content: 'Hello Chicago!' }, NOW);
    expect(a.externalId).toBe(b.externalId);
    expect(a.externalId).toMatch(/^instagram_/);
  });

  it('engagement is deterministic and grows over time', async () => {
    const adapter = createMockSocialAdapter('instagram');
    const { externalId } = await adapter.publishPost({ content: 'Post' }, NOW);
    const publishedAt = NOW;
    const at1h = await adapter.getEngagement(externalId, publishedAt, new Date(NOW.getTime() + 3_600_000));
    const at1hAgain = await adapter.getEngagement(externalId, publishedAt, new Date(NOW.getTime() + 3_600_000));
    const at48h = await adapter.getEngagement(externalId, publishedAt, new Date(NOW.getTime() + 48 * 3_600_000));

    expect(at1hAgain).toEqual(at1h); // pure function of (id, time)
    expect(at48h.impressions).toBeGreaterThan(at1h.impressions);
    expect(at48h.likes).toBeGreaterThanOrEqual(at1h.likes);
  });

  it('engagement is zero at publish time', async () => {
    const adapter = createMockSocialAdapter('x');
    const { externalId } = await adapter.publishPost({ content: 'Post' }, NOW);
    const at0 = await adapter.getEngagement(externalId, NOW, NOW);
    expect(at0.impressions).toBe(0);
    expect(at0.likes).toBe(0);
  });
});

describe('mock reviews', () => {
  it('is deterministic per org seed', () => {
    const a = fetchMockReviews('org-abc-123', 8, NOW);
    const b = fetchMockReviews('org-abc-123', 8, NOW);
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
  });

  it('differs across org seeds', () => {
    const a = fetchMockReviews('org-abc-123', 8, NOW);
    const b = fetchMockReviews('org-xyz-789', 8, NOW);
    expect(a.map((r) => r.rating).join()).not.toBe(b.map((r) => r.rating).join());
  });

  it('ratings stay within 1..5', () => {
    for (const review of fetchMockReviews('bounds', 20, NOW)) {
      expect(review.rating).toBeGreaterThanOrEqual(1);
      expect(review.rating).toBeLessThanOrEqual(5);
    }
  });
});

describe('sentiment', () => {
  it('classifies clearly positive and negative text', () => {
    expect(analyzeSentiment('Great service, very professional and friendly!')).toBe('positive');
    expect(analyzeSentiment('Terrible experience, rude and slow.')).toBe('negative');
    expect(analyzeSentiment('It was a service.')).toBe('neutral');
  });

  it('rating dominates the words', () => {
    expect(sentimentForReview('great great great', 1)).toBe('negative');
    expect(sentimentForReview('bad bad bad', 5)).toBe('positive');
    expect(sentimentForReview('friendly and helpful team', 3)).toBe('positive');
  });
});
