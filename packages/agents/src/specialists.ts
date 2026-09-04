// Specialist agents (CONTRACTS §8): lightweight dispatch — each specialist is a
// system prompt + tool set + memory + permission scope, executed on demand
// (plan execution, worker polls, dashboard "simulate"). Not long-running daemons.

import { eq } from 'drizzle-orm';
import { agentRuns } from '@growthcrew/db';
import type { SeoAudit } from '@growthcrew/integrations';
import type { AgentContext, AgentType } from './types.js';
import { executeTool } from './tools.js';
import { getOrCreateAgent } from './execute-plan.js';
import { tick } from './guardian.js';

export interface SpecialistResult {
  agentRunId: string;
  output: string;
}

export async function runSpecialistAgent(ctx: AgentContext, agentType: AgentType, task: string): Promise<SpecialistResult> {
  const agent = await getOrCreateAgent(ctx, agentType);
  const [run] = await ctx.db
    .insert(agentRuns)
    .values({ agentId: agent.id, orgId: ctx.orgId, conversationId: ctx.conversationId ?? null, input: task, status: 'running' })
    .returning();

  let output = '';
  let status = 'completed';
  try {
    output = await dispatch(ctx, agentType, task);
  } catch (err) {
    status = 'failed';
    output = err instanceof Error ? err.message : String(err);
  }

  await ctx.db
    .update(agentRuns)
    .set({ status, output, completedAt: ctx.now ?? new Date() })
    .where(eq(agentRuns.id, run!.id));

  await ctx.audit.log({
    actorType: 'agent',
    actorId: agentType,
    action: `agent.run.${agentType}`,
    entityType: 'agent_run',
    entityId: run!.id,
    payload: { task, status },
  });

  return { agentRunId: run!.id, output };
}

async function dispatch(ctx: AgentContext, agentType: AgentType, task: string): Promise<string> {
  switch (agentType) {
    case 'seo': {
      const { result } = await executeTool(ctx, 'seo.run_audit', {});
      const audit = result as SeoAudit;
      const failing = audit.checks.filter((c) => c.status !== 'pass');
      return (
        `SEO audit of ${audit.url}: score ${audit.score}/100 (mobile ${audit.pagespeed.performanceScore}/100). ` +
        (failing.length
          ? `Top fixes: ${failing.slice(0, 3).map((c) => c.detail).join(' ')}`
          : 'All checks pass — looking good.')
      );
    }
    case 'lead_gen': {
      const { result: form } = await executeTool(ctx, 'leads.create_form', { name: 'Contact form' });
      const f = form as { id: string; name: string };
      return `Lead form "${f.name}" is ready (hosted at /f/${f.id}). New submissions will be scored automatically.`;
    }
    case 'google_ads':
    case 'meta_ads':
    case 'tiktok_ads': {
      const platform = agentType === 'google_ads' ? 'google_ads' : agentType === 'meta_ads' ? 'meta' : 'tiktok';
      const { result } = await executeTool(ctx, 'ads.list_campaigns', { platform });
      const campaigns = (result as { name: string; status: string; metrics?: { spendCents: number; clicks: number } }[]) ?? [];
      if (campaigns.length === 0) return `No ${platform} campaigns yet.`;
      return campaigns
        .map(
          (c) =>
            `"${c.name}" (${c.status}): $${((c.metrics?.spendCents ?? 0) / 100).toFixed(2)} spent, ${c.metrics?.clicks ?? 0} clicks`,
        )
        .join(' ');
    }
    case 'analytics': {
      const { result } = await executeTool(ctx, 'analytics.get_overview', {});
      const o = result as { totals: { impressions: number; clicks: number; spendCents: number; conversions: number } };
      return `This period: $${(o.totals.spendCents / 100).toFixed(2)} spent, ${o.totals.impressions} impressions, ${o.totals.clicks} clicks, ${o.totals.conversions} conversions.`;
    }
    case 'budget_guardian': {
      const verdict = await tick(ctx);
      return verdict.ok
        ? 'Budget Guardian: all within caps.'
        : `Budget Guardian observed a risk: ${verdict.reason} Review it before making changes.`;
    }
    default:
      return `Task noted: ${task}`;
  }
}
