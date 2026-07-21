// Standalone approval gates (CONTRACTS §5): everything that spends, publishes,
// deletes, or moves a budget cap by >20% outside a proposal lands here and is
// applied only after an explicit human decision.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, budgets, type Approval } from '@voxmarketer/db';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';

export type ApprovalAction =
  | { type: 'tool'; toolName: string; args: Record<string, unknown>; summary?: string }
  | { type: 'budget_cap'; scope: string; capCents: number; period: 'daily' | 'monthly'; summary?: string };

export async function listApprovals(ctx: AgentContext, status?: string): Promise<Approval[]> {
  const where = status
    ? and(eq(approvals.orgId, ctx.orgId), eq(approvals.status, status))
    : eq(approvals.orgId, ctx.orgId);
  return ctx.db.select().from(approvals).where(where).orderBy(desc(approvals.createdAt)).limit(100);
}

async function applyBudgetCap(ctx: AgentContext, scope: string, capCents: number, period: 'daily' | 'monthly'): Promise<void> {
  const [existing] = await ctx.db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, ctx.orgId), eq(budgets.scope, scope), eq(budgets.period, period)))
    .limit(1);
  if (existing) {
    await ctx.db.update(budgets).set({ capCents }).where(eq(budgets.id, existing.id));
  } else {
    await ctx.db.insert(budgets).values({ orgId: ctx.orgId, scope, capCents, period });
  }
}

export async function decideApproval(
  ctx: AgentContext,
  id: string,
  approve: boolean,
  via: 'voice' | 'click',
): Promise<{ approval: Approval; applied: boolean }> {
  const [row] = await ctx.db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, id), eq(approvals.orgId, ctx.orgId)))
    .limit(1);
  if (!row) throw new Error('Approval not found');
  if (row.status !== 'pending') throw new Error(`Approval is already ${row.status}`);

  const now = ctx.now ?? new Date();
  const action = row.action as ApprovalAction;
  let applied = false;

  if (approve) {
    if (action.type === 'budget_cap') {
      await applyBudgetCap(ctx, action.scope, action.capCents, action.period);
      applied = true;
    } else if (action.type === 'tool') {
      // The gate requires an approved row — decide first, then execute against it.
      await ctx.db
        .update(approvals)
        .set({ status: 'approved', decidedBy: ctx.userId ?? null, decidedVia: via, decidedAt: now })
        .where(eq(approvals.id, id));
      await executeTool(ctx, action.toolName, { ...action.args, __approvalId: id });
      applied = true;
    }
  }

  if (!applied || action.type === 'budget_cap') {
    await ctx.db
      .update(approvals)
      .set({
        status: approve ? 'approved' : 'rejected',
        decidedBy: ctx.userId ?? null,
        decidedVia: via,
        decidedAt: now,
      })
      .where(eq(approvals.id, id));
  }

  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: approve ? 'approval.approved' : 'approval.rejected',
    entityType: 'approval',
    entityId: id,
    payload: { via, actionType: action.type },
  });

  const [updated] = await ctx.db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return { approval: updated!, applied };
}
