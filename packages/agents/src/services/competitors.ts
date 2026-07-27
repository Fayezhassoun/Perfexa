// Competitor intelligence services: track sites, analyze snapshots, diffs.

import { and, desc, eq } from 'drizzle-orm';
import { competitors, type Competitor } from '@sayso/db';
import { hostnameOf } from '@sayso/integrations';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';
import { getOrCreateAgent } from '../execute-plan.js';

export async function listCompetitors(ctx: AgentContext): Promise<Competitor[]> {
  return ctx.db
    .select()
    .from(competitors)
    .where(eq(competitors.orgId, ctx.orgId))
    .orderBy(desc(competitors.createdAt))
    .limit(50);
}

export async function addCompetitor(ctx: AgentContext, url: string, name?: string): Promise<Competitor> {
  await getOrCreateAgent(ctx, 'competitor');
  const normalized = /^https?:\/\//.test(url) ? url : `https://${url}`;
  const [existing] = await ctx.db
    .select()
    .from(competitors)
    .where(and(eq(competitors.orgId, ctx.orgId), eq(competitors.url, normalized)))
    .limit(1);
  if (existing) return existing;

  const [row] = await ctx.db
    .insert(competitors)
    .values({ orgId: ctx.orgId, url: normalized, name: name ?? hostnameOf(normalized), history: [] })
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'competitor.added',
    entityType: 'competitor',
    entityId: row!.id,
    payload: { url: normalized },
  });
  // First analysis inline — mock mode is instant, live degrades gracefully.
  const { result } = await executeTool(ctx, 'competitor.analyze', { competitorId: row!.id });
  return result as Competitor;
}

export async function analyzeCompetitor(ctx: AgentContext, id: string): Promise<Competitor> {
  const { result } = await executeTool(ctx, 'competitor.analyze', { competitorId: id });
  return result as Competitor;
}

export async function removeCompetitor(ctx: AgentContext, id: string): Promise<{ ok: true }> {
  const [existing] = await ctx.db
    .select()
    .from(competitors)
    .where(and(eq(competitors.id, id), eq(competitors.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Competitor not found');
  await ctx.db.delete(competitors).where(eq(competitors.id, id));
  return { ok: true };
}
