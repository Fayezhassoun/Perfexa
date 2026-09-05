import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, connectedAccounts } from '@growthcrew/db';
import { connectSandboxAccount, listIntegrations, setIntegrationMode } from '../src/services/settings.js';
import { db, freshOrg, truncateAll, connectOAuthTestAccount } from './helpers.js';
beforeEach(async () => { await truncateAll(db); });
afterEach(() => vi.unstubAllEnvs());
describe('pilot integration setup', () => {
  it('returns exact missing names and only working OAuth URLs', async () => {
    const { ctx } = await freshOrg();
    vi.stubEnv('GOOGLE_CLIENT_ID', ''); vi.stubEnv('GOOGLE_CLIENT_SECRET', ''); vi.stubEnv('GOOGLE_ADS_DEVELOPER_TOKEN', '');
    let google = (await listIntegrations(ctx)).find((r) => r.platform === 'google_ads')!;
    expect(google).toMatchObject({ oauthConfigured: false, connectUrl: null, oauthConnected: false, missingConfiguration: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN'] });
    vi.stubEnv('GOOGLE_CLIENT_ID', 'client'); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'private-value');
    google = (await listIntegrations(ctx)).find((r) => r.platform === 'google_ads')!;
    expect(google.missingConfiguration).toEqual(['GOOGLE_ADS_DEVELOPER_TOKEN']);
    vi.stubEnv('GOOGLE_ADS_DEVELOPER_TOKEN', 'developer');
    google = (await listIntegrations(ctx)).find((r) => r.platform === 'google_ads')!;
    expect(google).toMatchObject({ oauthConfigured: true, connectUrl: '/api/integrations/google_ads/connect', missingConfiguration: [] });
    expect(JSON.stringify(google)).not.toContain('private-value');
  });
  it('rejects a simulated account even with LIVE, and audits the rejection', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectSandboxAccount(ctx, 'google_ads');
    await expect(setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE')).rejects.toThrow(/OAuth/);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId));
    expect(logs.some((l) => l.action === 'integration.live_rejected')).toBe(true);
  });
  it('does not let the sandbox helper repair a broken real OAuth account', async () => {
    const { ctx, orgId } = await freshOrg();
    await connectOAuthTestAccount(ctx, 'google_ads');
    await db.update(connectedAccounts).set({ status: 'error' }).where(eq(connectedAccounts.orgId, orgId));
    expect((await connectSandboxAccount(ctx, 'google_ads')).status).toBe('error');
    await expect(setIntegrationMode(ctx, 'google_ads', 'live', 'LIVE')).rejects.toThrow(/Reconnect/);
  });
});
