// 30/60/90 content calendar (GROWTHCREW_VISIBILITY_PHASE2.md Feature 3).
//
// Plans close GEO visibility gaps: for every tracked prompt where the latest
// run did NOT mention the brand, a DeepSeek content brief is generated and
// stored as an `idea` distributed over the 30/60/90 horizons. Generation is
// idempotent per (org, prompt, horizon) — re-running adds nothing.

import { and, asc, eq } from 'drizzle-orm';
import {
  contentPlans,
  geoPrompts,
  geoResults,
  type ContentPlan,
  type ContentPlanBrief,
  type ContentPlanHorizon,
  type ContentPlanStatus,
  type GeoPrompt,
  type GeoResult,
  type GeoRun,
} from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import {
  generateGeoBrief,
  latestRun,
  listPrompts,
  type GeoBrief,
  type GeoEngineClients,
} from './geo.js';

export const PLAN_HORIZONS: ContentPlanHorizon[] = [30, 60, 90];

const STATUS_ORDER: ContentPlanStatus[] = ['idea', 'approved', 'drafted', 'published'];

/** A prompt the latest run never mentioned the brand in (a visibility gap). */
export interface GeoGap {
  prompt: GeoPrompt;
  results: GeoResult[];
}

/**
 * Gap prompts of a run: prompts with at least one stored result where the
 * brand was not mentioned by ANY engine. Prompts without results (every engine
 * failed) are unknowns, not gaps — the honesty rail keeps them out.
 */
export async function getGapPrompts(
  ctx: AgentContext,
  run: GeoRun,
): Promise<GeoGap[]> {
  const [results, prompts] = await Promise.all([
    ctx.db.select().from(geoResults).where(eq(geoResults.runId, run.id)),
    listPrompts(ctx, { activeOnly: false }),
  ]);
  const byPrompt = new Map<string, GeoResult[]>();
  for (const result of results) {
    const slot = byPrompt.get(result.promptId) ?? [];
    slot.push(result);
    byPrompt.set(result.promptId, slot);
  }
  return prompts
    .filter((prompt) => {
      const rows = byPrompt.get(prompt.id);
      return rows && rows.length > 0 && rows.every((r) => !r.brandMentioned);
    })
    .map((prompt) => ({ prompt, results: byPrompt.get(prompt.id)! }));
}

export interface PlanGenerationOptions {
  /** Injectable parser client (tests). Defaults to env-key DeepSeek. */
  clients?: GeoEngineClients;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  /** Injectable clock for due dates (tests). */
  now?: Date;
}

export interface PlanGenerationResult {
  runId: string | null;
  gaps: number;
  created: ContentPlan[];
  skippedExisting: number;
}

/**
 * Generate one plan per gap prompt (brief via the existing DeepSeek briefs
 * service), distributed round-robin over 30/60/90 days. Idempotent: a plan
 * already stored for the same prompt+horizon is skipped, never duplicated.
 */
export async function generateContentPlans(
  ctx: AgentContext,
  opts: PlanGenerationOptions = {},
): Promise<PlanGenerationResult> {
  const run = await latestRun(ctx);
  if (!run) {
    throw new Error('No GEO run yet — run a scan before generating a content plan.');
  }

  const gaps = await getGapPrompts(ctx, run);
  const now = opts.now ?? ctx.now ?? new Date();
  const created: ContentPlan[] = [];
  let skippedExisting = 0;

  for (let i = 0; i < gaps.length; i++) {
    const gap = gaps[i]!;
    const horizon = PLAN_HORIZONS[i % PLAN_HORIZONS.length]!;

    const [existing] = await ctx.db
      .select({ id: contentPlans.id })
      .from(contentPlans)
      .where(
        and(
          eq(contentPlans.orgId, ctx.orgId),
          eq(contentPlans.promptId, gap.prompt.id),
          eq(contentPlans.horizon, horizon),
        ),
      )
      .limit(1);
    if (existing) {
      skippedExisting += 1;
      continue;
    }

    // Metered exactly like brief generation (same DeepSeek call + budget guard).
    const brief: GeoBrief = await generateGeoBrief(
      ctx,
      { promptId: gap.prompt.id },
      { clients: opts.clients, env: opts.env, fetchImpl: opts.fetchImpl },
    );

    const dueDate = new Date(now.getTime() + horizon * 24 * 60 * 60 * 1000);
    const storedBrief: ContentPlanBrief = {
      title: brief.title,
      outline: brief.outline,
      target_queries: brief.target_queries,
    };
    const [row] = await ctx.db
      .insert(contentPlans)
      .values({
        orgId: ctx.orgId,
        horizon,
        promptId: gap.prompt.id,
        title: brief.title,
        brief: storedBrief,
        status: 'idea',
        dueDate,
      })
      .onConflictDoNothing({
        target: [contentPlans.orgId, contentPlans.promptId, contentPlans.horizon],
      })
      .returning();
    if (row) created.push(row);
    else skippedExisting += 1; // concurrent generation raced us — still idempotent
  }

  if (created.length > 0) {
    await ctx.audit.log({
      actorType: ctx.userId ? 'user' : 'system',
      actorId: ctx.userId ?? 'geo-plans',
      action: 'geo.plans_generated',
      entityType: 'content_plan',
      entityId: run.id,
      metadata: { runId: run.id, created: created.length, skippedExisting, gaps: gaps.length },
    });
  }

  return { runId: run.id, gaps: gaps.length, created, skippedExisting };
}

export type ContentPlanWithPrompt = ContentPlan & { promptText: string | null };

/** Calendar board: plans ordered horizon-first, with the gap prompt text. */
export async function listContentPlans(ctx: AgentContext): Promise<ContentPlanWithPrompt[]> {
  const rows = await ctx.db
    .select({
      plan: contentPlans,
      promptText: geoPrompts.text,
    })
    .from(contentPlans)
    .leftJoin(geoPrompts, eq(contentPlans.promptId, geoPrompts.id))
    .where(eq(contentPlans.orgId, ctx.orgId))
    .orderBy(asc(contentPlans.horizon), asc(contentPlans.createdAt));
  return rows.map((row) => ({ ...row.plan, promptText: row.promptText }));
}

export class ContentPlanTransitionError extends Error {
  constructor(current: string, next: string) {
    super(
      `Plans move forward only: idea → approved → drafted → published (current: ${current}, requested: ${next}).`,
    );
    this.name = 'ContentPlanTransitionError';
  }
}

export async function updateContentPlan(
  ctx: AgentContext,
  id: string,
  patch: { status?: ContentPlanStatus },
): Promise<ContentPlan> {
  const [existing] = await ctx.db
    .select()
    .from(contentPlans)
    .where(and(eq(contentPlans.id, id), eq(contentPlans.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Plan not found');

  if (patch.status !== undefined) {
    const from = STATUS_ORDER.indexOf(existing.status as ContentPlanStatus);
    const to = STATUS_ORDER.indexOf(patch.status);
    if (to === -1 || to <= from) {
      throw new ContentPlanTransitionError(existing.status, patch.status);
    }
  }

  const [row] = await ctx.db
    .update(contentPlans)
    .set({ ...(patch.status !== undefined ? { status: patch.status } : {}) })
    .where(eq(contentPlans.id, id))
    .returning();

  await ctx.audit.log({
    actorType: ctx.userId ? 'user' : 'system',
    actorId: ctx.userId ?? 'geo-plans',
    action: 'geo.plan_updated',
    entityType: 'content_plan',
    entityId: id,
    payload: patch,
  });

  return row!;
}
