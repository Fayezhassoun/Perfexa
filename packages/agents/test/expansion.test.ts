// Expansion features: social publishing gate, content studio, competitor
// analysis, reputation flow — all through the same service layer the UI uses.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, socialPosts } from '@growthcrew/db';
import { ApprovalRequired } from '@growthcrew/integrations';
import { executeTool } from '../src/tools.js';
import * as social from '../src/services/social.js';
import * as content from '../src/services/content.js';
import * as competitorsService from '../src/services/competitors.js';
import * as reviewsService from '../src/services/reviews.js';
import { sendChatMessage } from '../src/services/conversations.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('social media', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('drafts a post with an AI caption from a topic', async () => {
    const { ctx } = await freshOrg();
    const post = await social.createPost(ctx, { platform: 'instagram', topic: 'our summer discount' });
    expect(post.status).toBe('draft');
    expect(post.content).toMatch(/summer discount/i);
    expect(post.content).toContain('#');
  });

  it('publish is HARD-gated: the tool refuses without an approval', async () => {
    const { ctx } = await freshOrg();
    const post = await social.createPost(ctx, { platform: 'x', topic: 'grand opening' });
    await expect(executeTool(ctx, 'social.publish_post', { postId: post.id })).rejects.toThrow(ApprovalRequired);
    const [row] = await db.select().from(socialPosts).where(eq(socialPosts.id, post.id));
    expect(row!.status).toBe('draft'); // unchanged
  });

  it('publishPost service records an approval, publishes, and audit-logs', async () => {
    const { ctx, orgId } = await freshOrg();
    const post = await social.createPost(ctx, { platform: 'linkedin', topic: 'we are hiring' });
    const published = await social.publishPost(ctx, post.id, 'click');
    expect(published.status).toBe('published');
    expect(published.externalId).toMatch(/^linkedin_/);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'tool.social.publish_post')).toBe(true);
  });

  it('summary aggregates engagement after a refresh', async () => {
    const { ctx } = await freshOrg({ now: new Date('2026-07-01T12:00:00Z') });
    const post = await social.createPost(ctx, { platform: 'instagram', topic: 'before and after photos' });
    await social.publishPost(ctx, post.id, 'click');
    // Two days later the deterministic curve has accrued reach.
    const later = { ...ctx, now: new Date('2026-07-03T12:00:00Z') };
    await social.refreshEngagement(later);
    const summary = await social.summary(later);
    expect(summary.published).toBe(1);
    expect(summary.totals.impressions).toBeGreaterThan(0);
  });

  it('voice command "post about X on instagram" drafts via the orchestrator', async () => {
    const org = await freshOrg();
    const result = await sendChatMessage(org.ctx, {
      content: 'Can you post about our summer discount on Instagram',
      modality: 'voice',
    });
    expect(result.reply).toMatch(/drafted.*instagram/i);
    const posts = await social.listPosts(org.ctx);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.platform).toBe('instagram');
    expect(posts[0]!.status).toBe('draft'); // never auto-published
  });
});

describe('content studio', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('drafts a grounded blog piece with an approval workflow', async () => {
    const { ctx } = await freshOrg();
    const piece = await content.draftPiece(ctx, { type: 'blog', topic: 'emergency plumbing costs' });
    expect(piece.status).toBe('draft');
    expect(piece.title).toMatch(/emergency plumbing costs/i);
    expect(piece.body!.length).toBeGreaterThan(100);

    const approved = await content.updatePiece(ctx, piece.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
  });
});

describe('competitor intelligence', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('adds + analyzes a competitor with snapshot, suggestions, history', async () => {
    const { ctx } = await freshOrg();
    const competitor = await competitorsService.addCompetitor(ctx, 'rival-example.com');
    const snapshot = competitor.snapshot as { score?: number; keywords?: string[] };
    expect(snapshot.score).toBeGreaterThanOrEqual(0);
    expect(competitor.suggestions!.length).toBeGreaterThan(0);
    expect(competitor.history!.length).toBe(1);

    const again = await competitorsService.analyzeCompetitor(ctx, competitor.id);
    expect((again.history ?? []).length).toBe(2);
  });

  it('adding the same url twice is idempotent', async () => {
    const { ctx } = await freshOrg();
    const a = await competitorsService.addCompetitor(ctx, 'https://rival-example.com');
    const b = await competitorsService.addCompetitor(ctx, 'https://rival-example.com');
    expect(b.id).toBe(a.id);
    expect(await competitorsService.listCompetitors(ctx)).toHaveLength(1);
  });
});

describe('reputation', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('syncs deterministic reviews with sentiment; resync adds nothing new', async () => {
    const { ctx } = await freshOrg();
    const first = await reviewsService.syncReviews(ctx);
    expect(first.added).toBe(8);
    const second = await reviewsService.syncReviews(ctx);
    expect(second.added).toBe(0);

    const stats = await reviewsService.stats(ctx);
    expect(stats.total).toBe(8);
    expect(stats.positive + stats.neutral + stats.negative).toBe(8);
  });

  it('reply flow: draft → gated post (tool refuses without approval)', async () => {
    const { ctx } = await freshOrg();
    await reviewsService.syncReviews(ctx);
    const [review] = await reviewsService.listReviews(ctx);

    const drafted = await reviewsService.draftReply(ctx, review!.id);
    expect(drafted.replyStatus).toBe('drafted');
    expect(drafted.replyDraft!.length).toBeGreaterThan(10);

    // Direct tool call without approval is refused.
    await expect(executeTool(ctx, 'reviews.post_reply', { reviewId: review!.id })).rejects.toThrow(ApprovalRequired);

    // The service path records the approval and posts.
    const posted = await reviewsService.postReply(ctx, review!.id, 'click');
    expect(posted.replyStatus).toBe('replied');
    expect(posted.repliedAt).toBeTruthy();
  });

  it('reply tone matches sentiment', async () => {
    const { ctx } = await freshOrg();
    await reviewsService.syncReviews(ctx);
    const negative = (await reviewsService.listReviews(ctx, 'negative'))[0];
    if (negative) {
      const drafted = await reviewsService.draftReply(ctx, negative.id);
      expect(drafted.replyDraft).toMatch(/sorry|make it right/i);
    }
    const positive = (await reviewsService.listReviews(ctx, 'positive'))[0];
    if (positive) {
      const drafted = await reviewsService.draftReply(ctx, positive.id);
      expect(drafted.replyDraft).toMatch(/thank/i);
    }
  });
});
