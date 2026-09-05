// Integration card truthfulness regression coverage: every connection state
// renders honest copy and a working next step — no "coming soon" for a
// supported feature, no broken buttons when OAuth isn't configured, and no
// credentials or tokens in the markup.

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  IntegrationPlatformCard,
  integrationConnectionState,
  integrationNextStep,
  type IntegrationRecord,
} from '@/components/integrations-platform-card';

function record(overrides: Partial<IntegrationRecord> = {}): IntegrationRecord {
  return {
    platform: 'meta',
    connected: false,
    mode: 'sandbox',
    status: 'not_connected',
    externalAccountId: null,
    health: 'sandbox — simulated responses, no real spend',
    oauthConfigured: false,
    connectUrl: null,
    ...overrides,
  };
}

function renderCard(integration: IntegrationRecord): string {
  return renderToStaticMarkup(
    createElement(IntegrationPlatformCard, {
      integration,
      onConnect: () => {},
      onGoLive: () => {},
      onSwitchToSandbox: () => {},
      connectPending: false,
      setModePending: false,
    }),
  );
}

describe('integrationConnectionState', () => {
  it('maps every record shape to exactly one truthful state', () => {
    expect(integrationConnectionState(record())).toBe('setup_needed');
    expect(
      integrationConnectionState(record({ oauthConfigured: true, connectUrl: '/api/integrations/meta/connect' })),
    ).toBe('ready_to_connect');
    expect(integrationConnectionState(record({ connected: true, status: 'connected' }))).toBe('connected_sandbox');
    expect(integrationConnectionState(record({ connected: true, status: 'connected', mode: 'live' }))).toBe(
      'connected_live',
    );
    expect(integrationConnectionState(record({ connected: true, status: 'error' }))).toBe('connection_error');
    expect(integrationConnectionState(record({ connected: true, status: 'error', mode: 'live' }))).toBe(
      'connection_error',
    );
  });

  it('gives an actionable next step for every state', () => {
    const states: IntegrationRecord[] = [
      record(),
      record({ oauthConfigured: true, connectUrl: '/api/integrations/meta/connect' }),
      record({ connected: true, status: 'connected', externalAccountId: 'act_1' }),
      record({ connected: true, status: 'connected', mode: 'live', externalAccountId: 'act_1' }),
      record({ connected: true, status: 'error', externalAccountId: 'act_1' }),
    ];
    for (const integration of states) {
      const step = integrationNextStep(integration);
      expect(step.length).toBeGreaterThan(20);
      expect(step.toLowerCase()).not.toContain('coming soon');
    }
  });
});

describe('IntegrationPlatformCard — OAuth not configured for this deployment', () => {
  const markup = renderCard(record());

  it('says what is unavailable and why instead of claiming the feature is coming soon', () => {
    expect(markup).not.toContain('coming soon');
    expect(markup).toContain('not configured on this deployment');
    expect(markup).toContain('OAuth app credentials');
    expect(markup).toContain('Sandbox mode is fully available now');
    expect(markup).toContain('Setup needed');
  });

  it('keeps the sandbox path as the working action and renders no dead connect link', () => {
    expect(markup).toContain('Connect sandbox (simulated)');
    expect(markup).not.toContain('Connect account');
    expect(markup).not.toContain('<a href=');
  });
});

describe('IntegrationPlatformCard — ready to connect', () => {
  const integration = record({ oauthConfigured: true, connectUrl: '/api/integrations/meta/connect' });
  const markup = renderCard(integration);

  it('makes the signed connect route the prominent CTA', () => {
    expect(markup).toContain('href="/api/integrations/meta/connect"');
    expect(markup).toContain('Connect account');
    expect(markup).toContain('Ready to connect');
  });

  it('keeps sandbox available and never says coming soon where a route exists', () => {
    expect(markup).toContain('Connect sandbox (simulated)');
    expect(markup).not.toContain('coming soon');
    expect(markup).not.toContain('not configured on this deployment');
    expect(markup).toContain('read-only OAuth');
  });
});

describe('IntegrationPlatformCard — connected, sandbox mode', () => {
  it('shows the connected account, the sandbox label, and the Go Live gate when OAuth is configured', () => {
    const markup = renderCard(
      record({
        connected: true,
        status: 'connected',
        externalAccountId: 'act_4242',
        oauthConnected: true,
        oauthConfigured: true,
        connectUrl: '/api/integrations/meta/connect',
      }),
    );
    expect(markup).toContain('act_4242');
    expect(markup).toContain('Sandbox mode');
    expect(markup).toContain('>Sandbox</');
    expect(markup).toContain('Go Live');
    expect(markup).toContain('type LIVE to confirm');
  });

  it('degrades to the setup message instead of a Go Live button that would only fail', () => {
    const markup = renderCard(record({ connected: true, status: 'connected', externalAccountId: 'sandbox-meta-acct' }));
    expect(markup).toContain('sandbox-meta-acct');
    expect(markup).not.toContain('Go Live');
    expect(markup).toContain('not configured on this deployment');
    expect(markup).toContain('Sandbox mode is fully available now');
  });
});

describe('IntegrationPlatformCard — connected, live mode', () => {
  it('makes the live account and mode obvious and keeps the sandbox escape hatch', () => {
    const markup = renderCard(
      record({
        connected: true,
        status: 'connected',
        mode: 'live',
        externalAccountId: 'act_4242',
        oauthConnected: true,
        oauthConfigured: true,
        connectUrl: '/api/integrations/meta/connect',
        health: 'live — real API calls',
      }),
    );
    expect(markup).toContain('>Live</');
    expect(markup).toContain('act_4242');
    expect(markup).toContain('Live mode');
    expect(markup).toContain('Back to sandbox');
    expect(markup).toContain('real account data');
    expect(markup).not.toContain('Go Live');
  });
});

describe('IntegrationPlatformCard — connection error', () => {
  it('surfaces a reconnect action through the signed route when OAuth is configured', () => {
    const markup = renderCard(
      record({
        connected: true,
        status: 'error',
        externalAccountId: 'act_4242',
        oauthConnected: true,
        oauthConfigured: true,
        connectUrl: '/api/integrations/meta/connect',
        health: 'live — connection problem',
      }),
    );
    expect(markup).toContain('Needs reconnect');
    expect(markup).toContain('href="/api/integrations/meta/connect"');
    expect(markup).toContain('Reconnect');
    expect(markup).toContain('reconnect to restore syncing');
  });

  it('still allows retreating to sandbox from a broken live connection', () => {
    const markup = renderCard(
      record({
        connected: true,
        status: 'error',
        mode: 'live',
        externalAccountId: 'act_4242',
        oauthConnected: true,
        oauthConfigured: true,
        connectUrl: '/api/integrations/meta/connect',
      }),
    );
    expect(markup).toContain('Back to sandbox');
  });

  it('points at operator setup instead of a dead reconnect link when OAuth is not configured', () => {
    const markup = renderCard(record({ connected: true, status: 'error', externalAccountId: 'act_4242' }));
    expect(markup).toContain('Needs reconnect');
    expect(markup).not.toContain('<a href=');
    expect(markup).toContain('OAuth app credentials');
  });
});

describe('IntegrationPlatformCard — safety rails', () => {
  it('never renders tokens or provider secrets for any state', () => {
    const states: IntegrationRecord[] = [
      record(),
      record({ oauthConfigured: true, connectUrl: '/api/integrations/meta/connect' }),
      record({ connected: true, status: 'connected', externalAccountId: 'act_4242' }),
      record({ connected: true, status: 'connected', mode: 'live', externalAccountId: 'act_4242' }),
      record({ connected: true, status: 'error', externalAccountId: 'act_4242' }),
    ];
    for (const integration of states) {
      const markup = renderCard(integration).toLowerCase();
      expect(markup).not.toContain('accesstoken');
      expect(markup).not.toContain('refreshtoken');
      expect(markup).not.toContain('clientsecret');
      expect(markup).not.toContain('test-secret-value');
    }
  });
});

it('lists missing configuration names without a dead OAuth link', () => {
  const markup = renderCard(record({ platform: 'google_ads', missingConfiguration: ['GOOGLE_CLIENT_SECRET', 'GOOGLE_ADS_DEVELOPER_TOKEN'] }));
  expect(markup).toContain('GOOGLE_CLIENT_SECRET + GOOGLE_ADS_DEVELOPER_TOKEN');
  expect(markup).not.toContain('<a href=');
});
it('requires real OAuth after a simulated sandbox connection', () => {
  const markup = renderCard(record({ connected: true, status: 'connected', externalAccountId: 'sandbox-meta-acct', oauthConfigured: true, oauthConnected: false, connectUrl: '/api/integrations/meta/connect' }));
  expect(markup).toContain('Go Live is blocked');
  expect(markup).toContain('href="/api/integrations/meta/connect"');
  expect(markup).toContain('Connect account');
  expect(markup).not.toContain('>Go Live</');
});
