// Reputation services: sync reviews, sentiment stats, gated reply posting.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, reviews, type Review } from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';
import { getOrCreateAgent } from '../execute-plan.js';

export async function listReviews(ctx: AgentContext, sentiment?: string): Promise<Review[]> {
  const conditions = [eq(reviews.orgId, ctx.orgId)];
  if (sentiment) conditions.push(eq(reviews.sentiment, sentiment));
  return ctx.db
    .select()
    .from(reviews)
    .where(and(...conditions))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
}

export async function syncReviews(ctx: AgentContext): Promise<{ added: number; total: number }> {
  await getOrCreateAgent(ctx, 'reputation');
  const { result } = await executeTool(ctx, 'reviews.sync', {});
  return result as { added: number; total: number };
}

export async function draftReply(ctx: AgentContext, reviewId: string): Promise<Review> {
  const { result } = await executeTool(ctx, 'reviews.draft_reply', { reviewId });
  return result as Review;
}

export async function updateReplyDraft(ctx: AgentContext, reviewId: string, replyDraft: string): Promise<Review> {
  const [existing] = await ctx.db
    .select()
    .from(reviews)
    .where(and(eq(reviews.id, reviewId), eq(reviews.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Review not found');
  if (existing.replyStatus === 'replied') throw new Error('Reply is already posted');
  const [updated] = await ctx.db
    .update(reviews)
    .set({ replyDraft, replyStatus: 'drafted' })
    .where(eq(reviews.id, reviewId))
    .returning();
  return updated!;
}

/** Posting a reply is a publish action → recorded approval (CONTRACTS §6). */
export async function postReply(ctx: AgentContext, reviewId: string, via: 'voice' | 'click'): Promise<Review> {
  const args = { reviewId };
  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      orgId: ctx.orgId,
      action: { type: 'tool', toolName: 'reviews.post_reply', args, summary: 'Post review reply' },
      status: 'approved',
      decidedBy: ctx.userId ?? null,
      decidedVia: via,
      decidedAt: ctx.now ?? new Date(),
    })
    .returning();
  const { result } = await executeTool(ctx, 'reviews.post_reply', { ...args, __approvalId: approval!.id });
  return result as Review;
}

export interface ReviewStats {
  total: number;
  avgRating: number | null;
  positive: number;
  neutral: number;
  negative: number;
  awaitingReply: number;
}

export async function stats(ctx: AgentContext): Promise<ReviewStats> {
  const rows = await listReviews(ctx);
  const total = rows.length;
  const rated = rows.filter((r) => r.rating != null);
  const avgRating = rated.length
    ? Math.round((rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length) * 10) / 10
    : null;
  return {
    total,
    avgRating,
    positive: rows.filter((r) => r.sentiment === 'positive').length,
    neutral: rows.filter((r) => r.sentiment === 'neutral').length,
    negative: rows.filter((r) => r.sentiment === 'negative').length,
    awaitingReply: rows.filter((r) => r.replyStatus !== 'replied').length,
  };
}
