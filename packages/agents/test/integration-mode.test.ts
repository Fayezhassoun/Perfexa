// Sandbox→live switching requires BOTH an OAuth-connected account AND the
// literal confirm text "LIVE" — and both outcomes are audit-logged
// (CONTRACTS §5/§16, acceptance invariant 4).

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, connectedAccounts } from '@voxmarketer/db';
import { connectSandboxAccount, listIntegrations, setIntegrationMode } from '../src/services/settings.js';
import { db, freshOrg, truncateAll } from './helpers.js';

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
    await connectSandboxAccount(ctx, 'google_ads');
    await expect(setIntegrationMode(ctx, 'google_ads', 'live', 'yes really')).rejects.toThrow(/LIVE/);
    await expect(setIntegrationMode(ctx, 'google_ads', 'live')).rejects.toThrow(/LIVE/);
  });

  it('goes live with a connected account + LIVE confirm, and audit-logs it', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectSandboxAccount(ctx, 'google_ads');
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

  it('switching back to sandbox needs no confirmation', async () => {
    const { ctx } = await freshOrg();
    await connectSandboxAccount(ctx, 'google_ads');
    await setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE');
    const back = await setIntegrationMode(ctx, 'google_ads', 'sandbox');
    expect(back.mode).toBe('sandbox');
  });
});
