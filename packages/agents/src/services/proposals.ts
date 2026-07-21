// Proposal services (CONTRACTS §5): review list + approve/reject/request-changes.
// Execution itself lives in execute-plan.ts — nothing spends without approvals.

import { and, desc, eq } from 'drizzle-orm';
import { proposals, type Proposal } from '@voxmarketer/db';
import type { AgentContext, OrchestratorResult } from '../types.js';
import { approveProposal, type ApproveProposalResult } from '../execute-plan.js';
import { handleUserMessage } from '../orchestrator.js';

export async function listProposals(ctx: AgentContext, status?: string): Promise<Proposal[]> {
  const where = status
    ? and(eq(proposals.orgId, ctx.orgId), eq(proposals.status, status))
    : eq(proposals.orgId, ctx.orgId);
  return ctx.db.select().from(proposals).where(where).orderBy(desc(proposals.createdAt));
}

export async function getProposal(ctx: AgentContext, id: string): Promise<Proposal> {
  const [row] = await ctx.db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.orgId, ctx.orgId)))
    .limit(1);
  if (!row) throw new Error('Proposal not found');
  return row;
}

export async function approveProposalById(ctx: AgentContext, id: string, via: 'voice' | 'click'): Promise<ApproveProposalResult> {
  return approveProposal(ctx, id, via);
}

export async function rejectProposal(ctx: AgentContext, id: string, via: 'voice' | 'click'): Promise<Proposal> {
  const row = await getProposal(ctx, id);
  if (row.status !== 'pending') throw new Error(`Proposal is ${row.status}; only pending proposals can be rejected`);
  const [updated] = await ctx.db
    .update(proposals)
    .set({ status: 'rejected', decidedBy: ctx.userId ?? null, decidedVia: via, decidedAt: ctx.now ?? new Date() })
    .where(eq(proposals.id, id))
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'proposal.rejected',
    entityType: 'proposal',
    entityId: id,
    payload: { via },
  });
  return updated!;
}

/**
 * Request changes: the old proposal is closed as `changes_requested` and the
 * comment goes back through the orchestrator, which may emit a NEW proposal.
 */
export async function requestChanges(
  ctx: AgentContext,
  id: string,
  comment: string,
  via: 'voice' | 'click',
): Promise<{ proposal: Proposal; orchestrator: OrchestratorResult }> {
  const row = await getProposal(ctx, id);
  if (row.status !== 'pending') throw new Error(`Proposal is ${row.status}; only pending proposals can be changed`);
  const [updated] = await ctx.db
    .update(proposals)
    .set({ status: 'changes_requested', decidedBy: ctx.userId ?? null, decidedVia: via, decidedAt: ctx.now ?? new Date() })
    .where(eq(proposals.id, id))
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'proposal.changes_requested',
    entityType: 'proposal',
    entityId: id,
    payload: { via, comment },
  });
  const orchestrator = await handleUserMessage(
    { ...ctx, conversationId: row.conversationId ?? ctx.conversationId },
    comment,
    via === 'voice' ? 'voice' : 'text',
  );
  return { proposal: updated!, orchestrator };
}
