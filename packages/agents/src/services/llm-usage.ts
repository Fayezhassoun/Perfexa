// LLM usage metering + cost guardrails (Fox Biz decision #4/#5).
// Records per-org monthly token usage, enforces budget caps, provides stats.

import { and, eq, sql } from 'drizzle-orm';
import { llmUsage, organizations } from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import type { LLMUsage } from '@growthcrew/llm';

// --- Pricing (cents per 1M tokens) ---
// Default: DeepSeek V4 Flash pricing. Overridable via env for other providers.
const INPUT_COST_PER_M = Number(process.env.LLM_INPUT_COST_PER_M ?? '0.14'); // $0.14/M
const OUTPUT_COST_PER_M = Number(process.env.LLM_OUTPUT_COST_PER_M ?? '0.28'); // $0.28/M

// --- Budget defaults (cents/month) by plan tier ---
// Fox Biz: $19 plan → cap ~$4.60 LLM; $49 → ~$12; $99 → ~$25
const DEFAULT_BUDGET_CENTS: Record<string, number> = {
  starter: 460,
  growth: 1200,
  agency: 2500,
};
const FALLBACK_BUDGET_CENTS = 460;

function currentMonth(now?: Date): string {
  const d = now ?? new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function estimateCostCents(usage: LLMUsage): number {
  const inputCost = (usage.promptTokens / 1_000_000) * INPUT_COST_PER_M;
  const outputCost = (usage.completionTokens / 1_000_000) * OUTPUT_COST_PER_M;
  return Math.round((inputCost + outputCost) * 100); // cents
}

/** Get the org's monthly LLM budget cap in cents. */
export async function getOrgBudgetCents(ctx: AgentContext): Promise<number> {
  const [org] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  if (typeof settings.llmBudgetCents === 'number') return settings.llmBudgetCents;
  const plan = typeof settings.plan === 'string' ? settings.plan : 'starter';
  return DEFAULT_BUDGET_CENTS[plan] ?? FALLBACK_BUDGET_CENTS;
}

export interface UsageStats {
  month: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostCents: number;
  requestCount: number;
  budgetCents: number;
  remainingCents: number;
  pctUsed: number;
}

/** Get current month usage stats for an org. */
export async function getUsageStats(ctx: AgentContext): Promise<UsageStats> {
  const month = currentMonth(ctx.now);
  const [row] = await ctx.db
    .select()
    .from(llmUsage)
    .where(and(eq(llmUsage.orgId, ctx.orgId), eq(llmUsage.month, month)))
    .limit(1);

  const budgetCents = await getOrgBudgetCents(ctx);
  const costCents = row?.estimatedCostCents ?? 0;

  return {
    month,
    promptTokens: row?.promptTokens ?? 0,
    completionTokens: row?.completionTokens ?? 0,
    totalTokens: row?.totalTokens ?? 0,
    estimatedCostCents: costCents,
    requestCount: row?.requestCount ?? 0,
    budgetCents,
    remainingCents: Math.max(0, budgetCents - costCents),
    pctUsed: budgetCents > 0 ? Math.round((costCents / budgetCents) * 100) : 0,
  };
}

/** Check if org is within budget. Returns true if OK to proceed. */
export async function isWithinBudget(ctx: AgentContext): Promise<boolean> {
  const stats = await getUsageStats(ctx);
  return stats.estimatedCostCents < stats.budgetCents;
}

/** Record LLM usage after a successful call. Upserts the monthly rollup. */
export async function recordUsage(
  ctx: AgentContext,
  usage: LLMUsage,
  model?: string,
): Promise<void> {
  const month = currentMonth(ctx.now);
  const costCents = estimateCostCents(usage);

  await ctx.db
    .insert(llmUsage)
    .values({
      orgId: ctx.orgId,
      month,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostCents: costCents,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      target: [llmUsage.orgId, llmUsage.month],
      set: {
        promptTokens: sql`${llmUsage.promptTokens} + ${usage.promptTokens}`,
        completionTokens: sql`${llmUsage.completionTokens} + ${usage.completionTokens}`,
        totalTokens: sql`${llmUsage.totalTokens} + ${usage.totalTokens}`,
        estimatedCostCents: sql`${llmUsage.estimatedCostCents} + ${costCents}`,
        requestCount: sql`${llmUsage.requestCount} + 1`,
        updatedAt: sql`now()`,
      },
    });
}

/** Set the org's monthly LLM budget cap. */
export async function setOrgBudgetCents(ctx: AgentContext, cents: number): Promise<void> {
  const [org] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const settings = { ...((org?.settings ?? {}) as Record<string, unknown>), llmBudgetCents: cents };
  await ctx.db
    .update(organizations)
    .set({ settings })
    .where(eq(organizations.id, ctx.orgId));
}
