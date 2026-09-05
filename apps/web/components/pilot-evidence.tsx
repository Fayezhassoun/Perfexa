import { DataSourceNotice, type DataSource } from '@/components/data-source-notice';
import { DemoDataBanner } from '@/components/demo-data-banner';

const labels: Record<string, string> = { google_ads: 'Google Ads', meta: 'Meta', tiktok: 'TikTok' };
type Sync = { platform: string; externalAccountId?: string; synced: number; syncedAt?: string; error?: string; skipped?: string };
export function SyncResults({ results }: { results: Sync[] }) {
  return <div className="space-y-2" aria-label="Platform sync results">{results.map((s) =>
    <div key={s.platform} role={s.error ? 'alert' : 'status'} className="rounded-xl border p-3 text-sm">
      <p className="font-semibold">{labels[s.platform] ?? s.platform}{s.externalAccountId ? ` · Account ${s.externalAccountId}` : ''}</p>
      <p>{s.error ? `Sync failed: ${s.error}` : s.skipped ? `Skipped: ${s.skipped}` : s.synced === 0 ? 'The account sync returned no campaigns' : `${s.synced} campaign rows synced from live account data`}</p>
      {s.syncedAt && <p>Synced at {s.syncedAt}</p>}
    </div>,
  )}</div>;
}

type ReportEvidence = {
  dataSource?: DataSource | 'demo'; demoData?: boolean;
  sourceSyncs?: { platform: string; externalAccountId: string; syncedAt: string }[];
  byPlatform: Record<string, { spendCents: number }>;
  metricBasis?: string;
};
export function ReportSourceEvidence({ content }: { content: ReportEvidence }) {
  const source = content.demoData ? 'demo' : content.dataSource;
  const syncs = content.sourceSyncs ?? [];
  return <section className="space-y-3 rounded-xl border-2 border-primary/25 p-4" aria-label="Report data source">
    <h3 className="font-semibold">Report data source: {source ?? 'unknown'}</h3>
    {source === 'demo' ? <DemoDataBanner /> : source ? <DataSourceNotice source={source} /> : <p>Source provenance was not recorded. Regenerate after a live sync.</p>}
    <p className="text-sm">{content.metricBasis}</p>
    {syncs.length ? syncs.map((s) => <p className="text-sm" key={`${s.platform}-${s.externalAccountId}-${s.syncedAt}`}>{labels[s.platform] ?? s.platform} · Account {s.externalAccountId} · Source sync {s.syncedAt}</p>) : <p className="text-sm">Live source sync timestamp unavailable.</p>}
    {(source === 'live' || source === 'mixed') && <div className="space-y-2">
      <h3 className="font-semibold">Verify against account</h3>
      <p className="text-sm">Compare each platform total with its provider UI for the account and metric window shown above. Spend uses the provider account currency. Check currency and window before comparing or combining totals.</p>
      <table className="w-full text-left text-sm"><thead><tr><th>Platform</th><th>Spend</th><th>spendCents</th></tr></thead><tbody>
        {Object.entries(content.byPlatform).map(([platform, totals]) => <tr key={platform}><td>{labels[platform] ?? platform}</td><td>{(totals.spendCents / 100).toFixed(2)}</td><td>{totals.spendCents}</td></tr>)}
      </tbody></table>
    </div>}
  </section>;
}
