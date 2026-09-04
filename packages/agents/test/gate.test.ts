// The HARD approval-gate rule (CONTRACTS §8): gated tools refuse to run
// without a matching approved approvals row.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { approvals, auditLogs, campaignsMirror } from '@growthcrew/db';
import { ApprovalRequired } from '@growthcrew/integrations';
import { executeTool } from '../src/tools.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const CAMPAIGN_ARGS = {
  platform: 'google_ads' as const,
  input: {
    name: 'Test Search Campaign',
    objective: 'leads',
    dailyBudgetCents: 1000,
    targeting: { geography: 'Chicago', keywords: ['plumber chicago'] },
  },
};

async function approvedRowFor(orgId: string, userId: string, toolName: string, args: unknown) {
  const [row] = await db
    .insert(approvals)
    .values({
      orgId,
      action: { type: 'tool', toolName, args, summary: 'test' },
      status: 'approved',
      decidedBy: userId,
      decidedVia: 'click',
      decidedAt: new Date(),
    })
    .returning();
  return row!;
}

describe('approval gate', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('gated tool without __approvalId throws ApprovalRequired and spends nothing', async () => {
    const { ctx, orgId } = await freshOrg();
    await expect(executeTool(ctx, 'ads.create_campaign', { ...CAMPAIGN_ARGS })).rejects.toThrow(
      ApprovalRequired,
    );
    const mirror = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(mirror).toHaveLength(0);
  });

  it('rejects an approval whose payload hash does not match', async () => {
    const { ctx, orgId, userId } = await freshOrg();
    const approval = await approvedRowFor(orgId, userId, 'ads.create_campaign', {
      ...CAMPAIGN_ARGS,
      input: { ...CAMPAIGN_ARGS.input, dailyBudgetCents: 999_999 }, // different payload
    });
    await expect(
      executeTool(ctx, 'ads.create_campaign', { ...CAMPAIGN_ARGS, __approvalId: approval.id }),
    ).rejects.toThrow(ApprovalRequired);
  });

  it('rejects a pending (not yet approved) approval', async () => {
    const { ctx, orgId } = await freshOrg();
    const [pending] = await db
      .insert(approvals)
      .values({
        orgId,
        action: { type: 'tool', toolName: 'ads.create_campaign', args: CAMPAIGN_ARGS, summary: 'test' },
        status: 'pending',
      })
      .returning();
    await expect(
      executeTool(ctx, 'ads.create_campaign', { ...CAMPAIGN_ARGS, __approvalId: pending!.id }),
    ).rejects.toThrow(ApprovalRequired);
  });

  it('runs with a matching approved row, mirrors the campaign, and audit-logs', async () => {
    const { ctx, orgId, userId } = await freshOrg();
    const approval = await approvedRowFor(orgId, userId, 'ads.create_campaign', CAMPAIGN_ARGS);

    const { result, record } = await executeTool(ctx, 'ads.create_campaign', {
      ...CAMPAIGN_ARGS,
      __approvalId: approval.id,
    });

    expect(record.status).toBe('completed');
    expect(record.gated).toBe(true);
    expect(record.approvalId).toBe(approval.id);
    const campaign = (result as { campaign: { externalId: string; status: string } }).campaign;
    expect(campaign.status).toBe('active');

    const mirror = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, orgId));
    expect(mirror).toHaveLength(1);
    expect(mirror[0]!.externalId).toBe(campaign.externalId);

    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(audits.some((a) => a.action === 'tool.ads.create_campaign' && a.payloadHash)).toBe(true);
  });

  it('requires a matching approval before pausing even in sandbox', async () => {
    const { ctx, orgId, userId } = await freshOrg();
    const approval = await approvedRowFor(orgId, userId, 'ads.create_campaign', CAMPAIGN_ARGS);
    const { result } = await executeTool(ctx, 'ads.create_campaign', {
      ...CAMPAIGN_ARGS,
      __approvalId: approval.id,
    });
    const externalId = (result as { campaign: { externalId: string } }).campaign.externalId;
    const pauseArgs = { platform: 'google_ads' as const, externalId };

    await expect(executeTool(ctx, 'ads.pause_campaign', pauseArgs)).rejects.toThrow(ApprovalRequired);

    const pauseApproval = await approvedRowFor(orgId, userId, 'ads.pause_campaign', pauseArgs);
    await expect(
      executeTool(ctx, 'ads.pause_campaign', { ...pauseArgs, __approvalId: pauseApproval.id }),
    ).resolves.toBeTruthy();
  });
});
