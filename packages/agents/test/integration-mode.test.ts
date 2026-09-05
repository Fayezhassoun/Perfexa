// Sandbox→live switching requires BOTH an OAuth-connected account AND the
// literal confirm text "LIVE" — and both outcomes are audit-logged
// (CONTRACTS §5/§16, acceptance invariant 4).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { approvals, auditLogs, campaignsMirror, connectedAccounts } from '@growthcrew/db';
import { listCampaigns, resumeCampaign } from '../src/services/campaigns.js';
import { listIntegrations, setIntegrationMode } from '../src/services/settings.js';
import { connectOAuthTestAccount, db, freshOrg, truncateAll } from './helpers.js';

afterEach(() => vi.unstubAllEnvs());

describe('setIntegrationMode', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('refuses live without a connected account, and audit-logs the rejection', async () => {
    const { ctx, orgId } = await freshOrg();
    await expect(setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE')).rejects.toThrow(/connect/i);

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(rows.some((r) => r.action === 'integration.live_rejected')).toBe(true);
    // Still sandbox afterwards.
    const integrations = await listIntegrations(ctx);
    expect(integrations.find((i) => i.platform === 'google_ads')!.mode).toBe('sandbox');
  });

  it('refuses live without the exact LIVE confirm text even when connected', async () => {
    const { ctx } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    await expect(setIntegrationMode(ctx, 'google_ads', 'live', 'yes really')).rejects.toThrow(/LIVE/);
    await expect(setIntegrationMode(ctx, 'google_ads', 'live')).rejects.toThrow(/LIVE/);
  });

  it('goes live with a connected account + LIVE confirm, and audit-logs it', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    const result = await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');
    expect(result.mode).toBe('live');

    const [account] = await db
      .select()
      .from(connectedAccounts)
      .where(eq(connectedAccounts.orgId, orgId));
    expect(account!.mode).toBe('live');

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(rows.some((r) => r.action === 'integration.mode_changed')).toBe(true);
  });

  it('uses connected-account mode for stale mirror rows and creates no impossible resume approval', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    const [mirror] = await db
      .insert(campaignsMirror)
      .values({
        orgId,
        platform: 'google_ads',
        externalId: 'stale-sandbox-row',
        name: 'Paused live campaign',
        status: 'paused',
        mode: 'sandbox',
      })
      .returning();
    const [staleApproval] = await db
      .insert(approvals)
      .values({
        orgId,
        action: {
          type: 'tool',
          toolName: 'ads.resume_campaign',
          args: { platform: 'google_ads', externalId: 'stale-sandbox-row' },
        },
        status: 'pending',
      })
      .returning();
    await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');

    const [campaign] = await listCampaigns(ctx);
    expect(campaign!.mode).toBe('sandbox');
    expect(campaign!.accountMode).toBe('live');
    await expect(resumeCampaign(ctx, mirror!.id, 'click')).rejects.toThrow(/read-only pilot/i);
    const pending = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.status, 'pending')));
    expect(pending).toHaveLength(0);
    const [retired] = await db.select().from(approvals).where(eq(approvals.id, staleApproval!.id));
    expect(retired!.status).toBe('rejected');
    const auditRows = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(
      auditRows.some(
        (entry) => entry.action === 'approval.rejected' && entry.entityId === staleApproval!.id,
      ),
    ).toBe(true);
  });

  it('keeps live-provenance rows read-only after switching the account back to sandbox', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');
    const [mirror] = await db
      .insert(campaignsMirror)
      .values({
        orgId,
        platform: 'google_ads',
        externalId: 'live-provider-row',
        name: 'Live provider campaign',
        status: 'paused',
        mode: 'live',
      })
      .returning();
    await setIntegrationMode(ctx, 'google_ads', 'sandbox');

    const [campaign] = await listCampaigns(ctx);
    expect(campaign!.mode).toBe('live');
    expect(campaign!.accountMode).toBe('sandbox');
    await expect(resumeCampaign(ctx, mirror!.id, 'click')).rejects.toThrow(/sandbox-provenance/i);
    const approvalRows = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    expect(approvalRows).toHaveLength(0);
  });

  it('switching back to sandbox needs no confirmation', async () => {
    const { ctx } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');
    const back = await setIntegrationMode(ctx, 'google_ads', 'sandbox');
    expect(back.mode).toBe('sandbox');
  });
});
