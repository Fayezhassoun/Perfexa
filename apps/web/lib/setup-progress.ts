import type { BriefSource } from './weekly-brief';

export type SetupConnection = {
  platform: string;
  connected: boolean;
  status: string;
  mode: string;
  oauthConnected?: boolean;
};

/** Simulation, analytics-only connections, and old reports cannot complete
 * the first live ad-report workflow. This is guidance, never a sharing gate. */
export function setupProgress(input: {
  connections: SetupConnection[];
  source: BriefSource;
  reportSource?: BriefSource;
  reportDemo?: boolean;
}) {
  const accounts = input.connections.filter(row =>
    ['google_ads', 'meta', 'tiktok'].includes(row.platform) &&
    row.connected && row.status === 'connected' && row.oauthConnected === true,
  );
  const connected = accounts.length > 0;
  const live = accounts.some(row => row.mode === 'live');
  const synced = live && input.source === 'live';
  const reported = synced && input.reportSource === 'live' && !input.reportDemo;
  return [
    { label: 'Connect', complete: connected, href: '/settings?tab=integrations', action: 'Connect an account', detail: 'Authorize a real ad account. Sample connections do not count.' },
    { label: 'Sync', complete: synced, href: '/settings?tab=integrations', action: live ? 'Sync account data' : 'Enable read-only live mode', detail: input.source === 'mixed' ? 'Resolve mixed live and sample sources before continuing.' : 'Enable live mode, then sync your campaigns.' },
    { label: 'Review', complete: reported, href: '/reports', action: 'Review your report', detail: 'Generate a report and verify its account, dates, currency, and totals.' },
  ];
}
