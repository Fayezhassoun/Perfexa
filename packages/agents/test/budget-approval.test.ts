// Budget cap changes >20% require an approval instead of applying (CONTRACTS §5/§6).

import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { approvals, budgets } from '@sayso/db';
import { updateBudgetCap } from '../src/services/settings.js';
import { decideApproval } from '../src/services/approvals.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('updateBudgetCap', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('applies a ≤20% change immediately', async () => {
    const { ctx, orgId } = await freshOrg(); // global monthly $500
    const result = await updateBudgetCap(ctx, { scope: 'global', capCents: 55_000, period: 'monthly' });
    expect(result.applied).toBe(true);
    const [cap] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.scope, 'global')));
    expect(cap!.capCents).toBe(55_000);
  });

  it('a >20% change creates a pending approval and does NOT apply', async () => {
    const { ctx, orgId } = await freshOrg();
    const result = await updateBudgetCap(ctx, { scope: 'global', capCents: 100_000, period: 'monthly' });
    expect(result.applied).toBe(false);
    expect(result.approvalId).toBeTruthy();

    const [cap] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.scope, 'global')));
    expect(cap!.capCents).toBe(50_000); // unchanged

    const [approval] = await db.select().from(approvals).where(eq(approvals.id, result.approvalId!));
    expect(approval!.status).toBe('pending');
  });

  it('approving the pending approval applies the new cap', async () => {
    const { ctx, orgId } = await freshOrg();
    const result = await updateBudgetCap(ctx, { scope: 'global', capCents: 100_000, period: 'monthly' });
    await decideApproval(ctx, result.approvalId!, true, 'click');

    const [cap] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.scope, 'global')));
    expect(cap!.capCents).toBe(100_000);
  });

  it('rejecting the approval leaves the cap unchanged', async () => {
    const { ctx, orgId } = await freshOrg();
    const result = await updateBudgetCap(ctx, { scope: 'global', capCents: 100_000, period: 'monthly' });
    await decideApproval(ctx, result.approvalId!, false, 'click');

    const [cap] = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.scope, 'global')));
    expect(cap!.capCents).toBe(50_000);
  });
});
