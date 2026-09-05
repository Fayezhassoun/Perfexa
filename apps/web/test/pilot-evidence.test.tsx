import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReportSourceEvidence, SyncResults } from '@/components/pilot-evidence';
import { GoLiveDialog } from '@/components/integrations-platform-card';
describe('pilot evidence UI', () => {
  it('shows failures, skips and successful zero rows independently', () => {
    const html = renderToStaticMarkup(createElement(SyncResults, { results: [
      { platform: 'google_ads', externalAccountId: '123', synced: 0, syncedAt: '2026-09-05T09:00:00Z' },
      { platform: 'meta', synced: 0, error: 'Provider denied access' },
      { platform: 'tiktok', synced: 0, skipped: 'sandbox-mode' },
    ] }));
    for (const text of ['The account sync returned no campaigns', 'Account 123', '2026-09-05T09:00:00Z', 'Sync failed: Provider denied access', 'Skipped: sandbox-mode', 'role="alert"']) expect(html).toContain(text);
  });
  it('renders immutable report sync evidence and exact spend units', () => {
    const html = renderToStaticMarkup(createElement(ReportSourceEvidence, { content: { dataSource: 'live', byPlatform: { google_ads: { spendCents: 12345 } }, sourceSyncs: [{ platform: 'google_ads', externalAccountId: '123', syncedAt: '2026-09-05T09:00:00Z' }], metricBasis: 'LAST_30_DAYS' } }));
    for (const text of ['Report data source: live', 'Verify against account', '12345', '123.45', 'LAST_30_DAYS', '2026-09-05T09:00:00Z']) expect(html).toContain(text);
  });
  it('keeps missing, mixed, sandbox and demo provenance explicit', () => {
    for (const source of ['mixed', 'sandbox', 'demo'] as const) {
      const html = renderToStaticMarkup(createElement(ReportSourceEvidence, { content: { dataSource: source, byPlatform: {} } }));
      expect(html).toContain(`Report data source: ${source}`);
      expect(html).not.toContain('Live account data');
    }
    expect(renderToStaticMarkup(createElement(ReportSourceEvidence, { content: { byPlatform: {} } }))).toContain('Source provenance was not recorded');
  });
  it('requires the exact LIVE confirmation and describes only read access', () => {
    const render = (confirmText: string) => renderToStaticMarkup(createElement(GoLiveDialog, { platform: 'meta', confirmText, pending: false, onConfirmTextChange() {}, onConfirm() {}, onCancel() {} }));
    expect(render('live')).toContain('disabled=""');
    expect(render('LIVE')).not.toContain('disabled=""');
    expect(render('LIVE')).toContain('read-only access');
    expect(render('LIVE')).not.toContain('—');
  });
});
