// settings.integrations() mapping (CONTRACTS §5): the payload the settings UI
// renders from must truthfully distinguish "OAuth not configured on this
// deployment" from "ready to connect", expose the signed connect route only
// when it can work, and never carry tokens or provider secrets.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectSandboxAccount, listIntegrations } from '../src/services/settings.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'META_APP_ID',
  'META_APP_SECRET',
  'TIKTOK_APP_ID',
  'TIKTOK_APP_SECRET',
] as const;

const savedEnv: Record<string, string | undefined> = {};

function clearOAuthEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

function configureOAuthEnv() {
  process.env.GOOGLE_CLIENT_ID = 'google-cid';
  process.env.GOOGLE_CLIENT_SECRET = 'google-secret';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-token';
  process.env.META_APP_ID = 'meta-app-id';
  process.env.META_APP_SECRET = 'meta-app-secret';
  process.env.TIKTOK_APP_ID = 'tiktok-app-id';
  process.env.TIKTOK_APP_SECRET = 'tiktok-app-secret';
}

beforeEach(async () => {
  await truncateAll(db);
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  clearOAuthEnv();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('listIntegrations activation mapping', () => {
  it('degrades to an actionable setup state when OAuth env is missing', async () => {
    const { ctx } = await freshOrg();
    const integrations = await listIntegrations(ctx);

    expect(integrations).toHaveLength(5);
    for (const integration of integrations) {
      expect(integration.connected).toBe(false);
      expect(integration.status).toBe('not_connected');
      expect(integration.mode).toBe('sandbox');
      // Not "coming soon" — honestly not configured, and no dead route offered.
      expect(integration.oauthConfigured).toBe(false);
      expect(integration.connectUrl).toBeNull();
    }
  });

  it('exposes the signed connect route for every platform when OAuth env is configured', async () => {
    configureOAuthEnv();
    const { ctx } = await freshOrg();
    const integrations = await listIntegrations(ctx);

    for (const integration of integrations) {
      expect(integration.oauthConfigured).toBe(true);
      expect(integration.connectUrl).toBe(`/api/integrations/${integration.platform}/connect`);
    }
  });

  it('requires the Google Ads developer token on top of the shared Google OAuth client', async () => {
    configureOAuthEnv();
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    const { ctx } = await freshOrg();
    const integrations = await listIntegrations(ctx);

    const googleAds = integrations.find((i) => i.platform === 'google_ads')!;
    expect(googleAds.oauthConfigured).toBe(false);
    expect(googleAds.connectUrl).toBeNull();
    // ga4/gsc share the Google OAuth client and stay ready.
    expect(integrations.find((i) => i.platform === 'ga4')!.oauthConfigured).toBe(true);
    expect(integrations.find((i) => i.platform === 'gsc')!.oauthConfigured).toBe(true);
  });

  it('reports a sandbox connection truthfully without auto-going live', async () => {
    configureOAuthEnv();
    const { ctx } = await freshOrg();
    await connectSandboxAccount(ctx, 'meta');
    const integrations = await listIntegrations(ctx);

    const meta = integrations.find((i) => i.platform === 'meta')!;
    expect(meta.connected).toBe(true);
    expect(meta.mode).toBe('sandbox');
    expect(meta.status).toBe('connected');
    expect(meta.externalAccountId).toBe('sandbox-meta-acct');
    expect(meta.health).toContain('sandbox');
  });

  it('never includes tokens or provider secrets in the payload', async () => {
    configureOAuthEnv();
    const { ctx } = await freshOrg();
    await connectSandboxAccount(ctx, 'meta');
    const integrations = await listIntegrations(ctx);

    for (const integration of integrations) {
      const keys = Object.keys(integration);
      expect(keys).not.toContain('accessTokenEnc');
      expect(keys).not.toContain('refreshTokenEnc');
      expect(keys).not.toContain('accessToken');
      expect(keys).not.toContain('refreshToken');
      expect(keys).not.toContain('clientSecret');
    }
    const serialized = JSON.stringify(integrations).toLowerCase();
    expect(serialized).not.toContain('app-secret');
    expect(serialized).not.toContain('google-secret');
    expect(serialized).not.toContain('dev-token');
  });
});
