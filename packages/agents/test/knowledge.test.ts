import { beforeEach, describe, expect, it } from 'vitest';
import { knowledgeDocuments } from '@growthcrew/db';
import { KNOWLEDGE_SEED_DOCS, embedText } from '@growthcrew/integrations';
import { searchKnowledge } from '../src/services/knowledge.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('knowledge search (cosine similarity)', () => {
  beforeEach(async () => {
    await truncateAll(db);
    await db.insert(knowledgeDocuments).values(
      KNOWLEDGE_SEED_DOCS.map((doc) => ({
        source: doc.source,
        title: doc.title,
        content: doc.content,
        embedding: embedText(`${doc.title}\n${doc.content}`),
      })),
    );
  });

  it('returns at most 5 hits, ranked by score descending', async () => {
    const { ctx } = await freshOrg();
    const hits = await searchKnowledge(ctx, 'how do I improve my google ads quality score');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1]!.score).toBeGreaterThanOrEqual(hits[i]!.score);
    }
  });

  it('finds topically relevant docs first', async () => {
    const { ctx } = await freshOrg();
    const hits = await searchKnowledge(ctx, 'core web vitals page speed LCP');
    expect(hits[0]!.title?.toLowerCase()).toMatch(/core web vitals|speed|seo/);
  });

  it('covers the Phase-3 RAG expansion topics (tiktok, learning phase, pacing)', async () => {
    expect(KNOWLEDGE_SEED_DOCS.length).toBeGreaterThanOrEqual(20);
    const { ctx } = await freshOrg();

    // retrievable within the top hits (the embedder is a hashed bag-of-words,
    // so cross-platform budget docs compete on generic terms)
    const tiktokBudget = await searchKnowledge(ctx, 'tiktok daily budget minimum spend');
    expect(tiktokBudget.some((h) => h.source === 'tiktok_help' && /budget/i.test(h.title ?? ''))).toBe(true);

    const learning = await searchKnowledge(ctx, 'why did my meta ad set reset learning after an edit');
    expect(learning[0]!.source).toBe('meta_help');
    expect(learning[0]!.title?.toLowerCase()).toMatch(/learning/);

    const pacing = await searchKnowledge(ctx, 'google ads monthly budget pacing limited by budget');
    expect(pacing.some((h) => h.source === 'google_ads_help' && /pacing|budget/i.test(h.title ?? ''))).toBe(true);

    const pixel = await searchKnowledge(ctx, 'tiktok pixel events track conversions on my website');
    expect(pixel.some((h) => h.source === 'tiktok_help' && /pixel/i.test(h.title ?? ''))).toBe(true);
  });
});
