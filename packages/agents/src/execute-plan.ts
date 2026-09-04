// Plan execution (CONTRACTS §8): proposal approval → agents created → each
// gated action gets its own approved approvals row → executeTool. Nothing
// executes without a recorded approval, and execution stops loudly on failure.

import { and, eq } from 'drizzle-orm';
import { agents, agentRuns, approvals, connectedAccounts, proposals, type Agent, type Proposal } from '@growthcrew/db';
import type { AgentContext, AgentType, Plan, ToolCallRecord } from './types.js';
import { executeTool } from './tools.js';
import { remember } from './memory.js';
import { payloadHash } from './audit.js';

const AGENT_DISPLAY: Record<AgentType, string> = {
  orchestrator: 'Orchestrator',
  seo: 'SEO Specialist',
  google_ads: 'Google Ads Specialist',
  meta_ads: 'Meta Ads Specialist',
  tiktok_ads: 'TikTok Ads Specialist',
  lead_gen: 'Lead Gen Specialist',
  analytics: 'Analytics Specialist',
  budget_guardian: 'Budget Guardian',
  social_media: 'Social Media Specialist',
  content: 'Content Specialist',
  competitor: 'Competitor Analyst',
  reputation: 'Reputation Specialist',
};

export async function getOrCreateAgent(
  ctx: AgentContext,
  type: AgentType,
  config?: Record<string, unknown>,
): Promise<Agent> {
  const [existing] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.orgId, ctx.orgId), eq(agents.type, type)))
    .limit(1);
  if (existing) {
    if (config) {
      const merged = { ...((existing.config as Record<string, unknown> | null) ?? {}), ...config };
      await ctx.db.update(agents).set({ config: merged }).where(eq(agents.id, existing.id));
    }
    return existing;
  }
  const [created] = await ctx.db
    .insert(agents)
    .values({ orgId: ctx.orgId, type, name: AGENT_DISPLAY[type], config: config ?? {} })
    .returning();
  await ctx.audit.log({
    actorType: 'agent',
    actorId: 'orchestrator',
    action: 'agent.created',
    entityType: 'agent',
    entityId: created!.id,
    payload: { type, name: AGENT_DISPLAY[type] },
  });
  return created!;
}

function agentTypeForTool(toolName: string, args: Record<string, unknown>): AgentType {
  if (toolName.startsWith('ads.') || toolName.startsWith('campaigns.')) {
    const p = args.platform;
    if (p === 'meta') return 'meta_ads';
    if (p === 'tiktok') return 'tiktok_ads';
    return 'google_ads';
  }
  if (toolName.startsWith('leads.')) return 'lead_gen';
  if (toolName.startsWith('seo.')) return 'seo';
  if (toolName.startsWith('analytics.')) return 'analytics';
  return 'orchestrator';
}

export interface ApproveProposalResult {
  proposal: Proposal;
  plan: Plan;
  agentRuns: string[];
  createdAgents: Agent[];
  errors: string[];
}

const PILOT_BLOCKED_AD_TOOLS = new Set([
  'ads.create_campaign',
  'ads.pause_campaign',
  'ads.resume_campaign',
  'ads.update_budget',
  'campaigns.delete',
]);

function proposalActionKey(toolName: string, args: Record<string, unknown>): string {
  return `${toolName}:${payloadHash(args)}`;
}

async function assertNoLiveAdWrites(ctx: AgentContext, plan: Plan): Promise<void> {
  const candidateActions = plan.actions.filter(
    (action) => PILOT_BLOCKED_AD_TOOLS.has(action.toolName) && typeof action.args.platform === 'string',
  );
  if (candidateActions.length === 0) return;

  const accounts = await ctx.db
    .select({ platform: connectedAccounts.platform })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, ctx.orgId), eq(connectedAccounts.mode, 'live')));
  const livePlatforms = new Set(accounts.map((account) => account.platform));
  const blocked = candidateActions.find((action) => livePlatforms.has(action.args.platform as string));
  if (blocked) {
    throw new Error(
      `This proposal includes ${blocked.toolName} for a live account. External ad changes are disabled during the read-only pilot.`,
    );
  }
}

export async function approveProposal(ctx: AgentContext, proposalId: string, via: 'voice' | 'click'): Promise<ApproveProposalResult> {
  const [proposal] = await ctx.db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, proposalId), eq(proposals.orgId, ctx.orgId)))
    .limit(1);
  if (!proposal) throw new Error('Proposal not found');
  const plan = proposal.plan as Plan;

  // Idempotent: already approved → return existing state.
  if (proposal.status === 'approved') {
    const runs = await ctx.db.select({ id: agentRuns.id }).from(agentRuns).where(eq(agentRuns.conversationId, proposal.conversationId ?? ''));
    return { proposal, plan, agentRuns: runs.map((r) => r.id), createdAgents: [], errors: [] };
  }
  if (proposal.status !== 'pending') throw new Error(`Proposal is ${proposal.status}; only pending proposals can be approved`);

  await assertNoLiveAdWrites(ctx, plan);
  const now = ctx.now ?? new Date();

  // 1. Create the specialist agents (idempotent by orgId+type).
  const createdAgents: Agent[] = [];
  for (const pa of plan.agents) {
    createdAgents.push(await getOrCreateAgent(ctx, pa.type, { rationale: pa.rationale, tasks: pa.tasks, geography: plan.geography }));
  }

  // 2. Execute each gated action behind its own recorded approval.
  // Approved rows for this proposal represent actions that completed in a
  // previous partial attempt; skip them so retry cannot duplicate side effects.
  const priorApprovals = await ctx.db
    .select()
    .from(approvals)
    .where(and(eq(approvals.proposalId, proposal.id), eq(approvals.status, 'approved')));
  const completedActionKeys = new Set(
    priorApprovals.map((approval) => {
      const action = approval.action as { toolName?: string; args?: Record<string, unknown> };
      return proposalActionKey(action.toolName ?? '', action.args ?? {});
    }),
  );

  const runIds: string[] = [];
  const errors: string[] = [];
  for (const action of plan.actions) {
    const actionKey = proposalActionKey(action.toolName, action.args);
    if (completedActionKeys.has(actionKey)) continue;

    try {
      await assertNoLiveAdWrites(ctx, { ...plan, actions: [action] });
    } catch (err) {
      errors.push(`${action.summary}: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }

    const [approval] = await ctx.db
      .insert(approvals)
      .values(approvalsValues(ctx, proposal.id, action, via, now))
      .returning();

    const agentType = agentTypeForTool(action.toolName, action.args);
    const agent = await getOrCreateAgent(ctx, agentType);
    const [run] = await ctx.db
      .insert(agentRuns)
      .values({
        agentId: agent.id,
        orgId: ctx.orgId,
        conversationId: proposal.conversationId ?? ctx.conversationId ?? null,
        input: action.summary,
        status: 'running',
      })
      .returning();

    let records: ToolCallRecord[] = [];
    let output = '';
    try {
      const { result, record } = await executeTool(ctx, action.toolName, { ...action.args, __approvalId: approval!.id });
      records = [record];
      output = summarizeResult(action.toolName, result);
      await ctx.db
        .update(agentRuns)
        .set({ status: 'completed', output, toolCalls: records, completedAt: ctx.now ?? new Date() })
        .where(eq(agentRuns.id, run!.id));
      completedActionKeys.add(actionKey);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${action.summary}: ${message}`);
      await ctx.db
        .update(agentRuns)
        .set({ status: 'failed', error: message, toolCalls: records, completedAt: ctx.now ?? new Date() })
        .where(eq(agentRuns.id, run!.id));
      await ctx.db
        .update(approvals)
        .set({
          status: 'rejected',
          decidedBy: ctx.userId ?? null,
          decidedVia: 'system',
          decidedAt: ctx.now ?? new Date(),
        })
        .where(eq(approvals.id, approval!.id));
      await ctx.audit.log({
        actorType: 'system',
        actorId: 'proposal-executor',
        action: 'approval.rejected',
        entityType: 'approval',
        entityId: approval!.id,
        payload: { proposalId: proposal.id, toolName: action.toolName },
        metadata: { automated: true, reason: 'tool_execution_failed', error: message },
      });
      runIds.push(run!.id);
      break; // stop on first failure — partial execution stays visible (CONTRACTS §8)
    }
    runIds.push(run!.id);
  }

  // 3. Commit approval state only after every action succeeds.
  if (errors.length === 0) {
    await ctx.db
      .update(proposals)
      .set({ status: 'approved', decidedBy: ctx.userId ?? null, decidedVia: via, decidedAt: now })
      .where(eq(proposals.id, proposal.id));
    await ctx.audit.log({
      actorType: 'user',
      actorId: ctx.userId ?? 'unknown',
      action: 'proposal.approved',
      entityType: 'proposal',
      entityId: proposal.id,
      payload: { via, title: plan.title, monthlyBudgetCents: plan.monthlyBudgetCents },
    });
    await remember(ctx, 'approvedMonthlyBudgetCents', plan.monthlyBudgetCents);
    if (plan.geography) await remember(ctx, 'geography', plan.geography);
  }

  const [updated] = await ctx.db.select().from(proposals).where(eq(proposals.id, proposalId)).limit(1);
  return { proposal: updated!, plan, agentRuns: runIds, createdAgents, errors };
}

function approvalsValues(ctx: AgentContext, proposalId: string, action: Plan['actions'][number], via: 'voice' | 'click', now: Date) {
  return {
    orgId: ctx.orgId,
    proposalId,
    action: { type: 'tool', toolName: action.toolName, args: action.args, summary: action.summary },
    status: 'approved' as const,
    decidedBy: ctx.userId ?? null,
    decidedVia: via,
    decidedAt: now,
  };
}

// separate import so the helper name reads naturally above

function summarizeResult(toolName: string, result: unknown): string {
  if (toolName === 'ads.create_campaign') {
    const r = result as { campaign?: { name?: string; externalId?: string; budgetDailyCents?: number } };
    const c = r?.campaign;
    if (c) return `Campaign "${c.name}" is live (${c.externalId}) at $${((c.budgetDailyCents ?? 0) / 100).toFixed(2)}/day.`;
  }
  if (toolName === 'leads.create_form') {
    const f = result as { name?: string };
    return `Lead form "${f?.name ?? 'Contact form'}" created.`;
  }
  if (toolName === 'ads.update_budget') return 'Budget updated.';
  if (toolName === 'campaigns.delete') return 'Campaign removed.';
  return 'Done.';
}
