// Social media services: composer, calendar/queue, gated publishing,
// engagement refresh. Publishing follows the campaigns.resume pattern —
// sandbox executes immediately but always behind a recorded approval.

import { and, asc, desc, eq } from 'drizzle-orm';
import { approvals, socialPosts, type SocialPost } from '@sayso/db';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';
import { getOrCreateAgent } from '../execute-plan.js';

const PLATFORMS = ['facebook', 'instagram', 'x', 'linkedin', 'tiktok'] as const;
export type SocialPlatformKey = (typeof PLATFORMS)[number];

export async function listPosts(ctx: AgentContext, status?: string): Promise<SocialPost[]> {
  const conditions = [eq(socialPosts.orgId, ctx.orgId)];
  if (status) conditions.push(eq(socialPosts.status, status));
  return ctx.db
    .select()
    .from(socialPosts)
    .where(and(...conditions))
    .orderBy(desc(socialPosts.createdAt))
    .limit(200);
}

/** Scheduled + published posts ordered for the calendar view. */
export async function calendar(ctx: AgentContext): Promise<SocialPost[]> {
  return ctx.db
    .select()
    .from(socialPosts)
    .where(eq(socialPosts.orgId, ctx.orgId))
    .orderBy(asc(socialPosts.scheduledAt), desc(socialPosts.createdAt))
    .limit(200);
}

export interface CreatePostInput {
  platform: SocialPlatformKey;
  content?: string; // omit to let the Social Media Specialist draft from `topic`
  topic?: string;
  scheduledAt?: string; // ISO
}

export async function createPost(ctx: AgentContext, input: CreatePostInput): Promise<SocialPost> {
  const agent = await getOrCreateAgent(ctx, 'social_media');
  if (!input.content && !input.topic) throw new Error('Provide post content or a topic to draft from');

  if (!input.content) {
    const { result } = await executeTool(ctx, 'social.draft_post', {
      platform: input.platform,
      topic: input.topic,
      ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    });
    return result as SocialPost;
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const [post] = await ctx.db
    .insert(socialPosts)
    .values({
      orgId: ctx.orgId,
      platform: input.platform,
      content: input.content,
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt,
      createdByAgentId: agent.id,
    })
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'social.post_created',
    entityType: 'social_post',
    entityId: post!.id,
    payload: { platform: input.platform, scheduled: !!scheduledAt },
  });
  return post!;
}

export async function updatePost(
  ctx: AgentContext,
  id: string,
  patch: { content?: string; scheduledAt?: string | null },
): Promise<SocialPost> {
  const [existing] = await ctx.db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Post not found');
  if (existing.status === 'published') throw new Error('Published posts cannot be edited');
  const scheduledAt = patch.scheduledAt === undefined ? undefined : patch.scheduledAt ? new Date(patch.scheduledAt) : null;
  const [updated] = await ctx.db
    .update(socialPosts)
    .set({
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(scheduledAt !== undefined ? { scheduledAt, status: scheduledAt ? 'scheduled' : 'draft' } : {}),
    })
    .where(eq(socialPosts.id, id))
    .returning();
  return updated!;
}

export async function deletePost(ctx: AgentContext, id: string): Promise<{ ok: true }> {
  const [existing] = await ctx.db
    .select()
    .from(socialPosts)
    .where(and(eq(socialPosts.id, id), eq(socialPosts.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Post not found');
  if (existing.status === 'published') throw new Error('Published posts cannot be deleted');
  await ctx.db.delete(socialPosts).where(eq(socialPosts.id, id));
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'social.post_deleted',
    entityType: 'social_post',
    entityId: id,
    payload: { platform: existing.platform },
  });
  return { ok: true };
}

/** Publish behind a recorded approval (CONTRACTS §6: publishing is gated). */
export async function publishPost(ctx: AgentContext, id: string, via: 'voice' | 'click'): Promise<SocialPost> {
  const args = { postId: id };
  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      orgId: ctx.orgId,
      action: { type: 'tool', toolName: 'social.publish_post', args, summary: 'Publish social post' },
      status: 'approved',
      decidedBy: ctx.userId ?? null,
      decidedVia: via,
      decidedAt: ctx.now ?? new Date(),
    })
    .returning();
  const { result } = await executeTool(ctx, 'social.publish_post', { ...args, __approvalId: approval!.id });
  return result as SocialPost;
}

export async function refreshEngagement(ctx: AgentContext): Promise<{ refreshed: number }> {
  const { result } = await executeTool(ctx, 'social.get_engagement', {});
  return result as { refreshed: number };
}

export interface SocialSummary {
  published: number;
  scheduled: number;
  drafts: number;
  totals: { impressions: number; likes: number; comments: number; shares: number };
  byPlatform: Record<string, { posts: number; impressions: number; likes: number }>;
}

export async function summary(ctx: AgentContext): Promise<SocialSummary> {
  const posts = await listPosts(ctx);
  const totals = { impressions: 0, likes: 0, comments: 0, shares: 0 };
  const byPlatform: SocialSummary['byPlatform'] = {};
  let published = 0;
  let scheduled = 0;
  let drafts = 0;
  for (const post of posts) {
    if (post.status === 'published') published++;
    else if (post.status === 'scheduled') scheduled++;
    else drafts++;
    const m = post.metrics ?? {};
    totals.impressions += m.impressions ?? 0;
    totals.likes += m.likes ?? 0;
    totals.comments += m.comments ?? 0;
    totals.shares += m.shares ?? 0;
    const p = post.platform ?? 'unknown';
    byPlatform[p] ??= { posts: 0, impressions: 0, likes: 0 };
    byPlatform[p]!.posts++;
    byPlatform[p]!.impressions += m.impressions ?? 0;
    byPlatform[p]!.likes += m.likes ?? 0;
  }
  return { published, scheduled, drafts, totals, byPlatform };
}
