'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CalendarDays, ChevronDown, Circle, FileText, LockKeyhole, RefreshCw, Target } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { SOURCE_LABELS, PLATFORM_NAMES, money, planText, shortDate, snapshotTakeaway, weekToDate, type BriefSource } from '@/lib/weekly-brief';

const DashboardDetails = dynamic(() => import('@/components/dashboard-details'), {
  loading: () => <p className="brief-muted" role="status">Loading performance details…</p>,
});

function QueryNotice({ children, retry }: { children: React.ReactNode; retry: () => void }) {
  return <div className="brief-error" role="alert"><span>{children}</span><button type="button" onClick={retry}><RefreshCw size={14} /> Try again</button></div>;
}

export default function DashboardPage() {
  const [range, setRange] = useState(() => weekToDate(new Date()));
  const [draftRange, setDraftRange] = useState(range);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const overview = trpc.dashboard.overview.useQuery(range);
  const pending = trpc.proposals.list.useQuery({ status: 'pending' });
  const alerts = trpc.alerts.list.useQuery({ unacknowledgedOnly: true, limit: 100 });
  const reports = trpc.reports.weekly.list.useQuery();
  const source: BriefSource = overview.data?.demoData ? 'demo' : overview.data?.dataSource ?? 'none';
  const channels = overview.data?.byPlatform ?? {};
  const takeaway = snapshotTakeaway(channels);
  const proposal = pending.data?.[0];
  const critical = alerts.data?.find((alert) => alert.severity === 'critical');
  const report = reports.data?.[0];
  const content = report?.content;
  const reportSource = content?.demoData ? 'demo' : content?.dataSource;
  const reportSummary = content?.wins?.[0] || content?.priorities?.[0] || content?.recommendations?.[0];
  // The service exposes aggregate history, not per-channel time series. Plot
  // only supported data and leave missing days missing, never fabricate zeros.
  const series = (overview.data?.series ?? []).filter((point) => point.date <= weekToDate(new Date()).to);
  const loadingAction = pending.isLoading || alerts.isLoading || overview.isLoading;
  const actionError = pending.isError || alerts.isError || overview.isError;
  const action = critical
    ? { href: '/alerts', label: 'Review urgent alert', title: critical.title }
    : proposal
    ? { href: `/proposals/${proposal.id}`, label: 'Review recommendation', title: planText(proposal.plan, 'title') || 'Review your next recommendation' }
    : source === 'none'
    ? { href: '/settings', label: 'Connect an account', title: 'Connect your first read-only source' }
    : { href: '/reports', label: report ? 'Open weekly report' : 'Create your first report', title: report ? 'Your latest report is ready to review' : 'Turn your account data into a weekly report' };
  const pendingCount = pending.data?.length ?? 0;
  const subtitle = loadingAction ? 'Bringing your latest work into focus…'
    : actionError ? 'Some workspace data needs a refresh.'
    : critical ? 'An urgent signal needs your attention.'
    : pendingCount ? `${pendingCount === 1 ? 'One decision needs' : `${pendingCount} decisions need`} your attention.`
    : source === 'none' ? 'Your first connection is the next step.' : 'Your latest performance, with a clear next step.';

  return (
    <div className="weekly-brief" data-testid="dashboard">
      <div className={`brief-provenance source-${source}`} data-testid="system-truth-bar" role="status">
        <Circle size={11} strokeWidth={2.5} aria-hidden="true" />
        <span>{overview.isLoading ? 'Checking account sources…' : overview.isError ? 'Account source unavailable · refresh required' : SOURCE_LABELS[source]}</span>
      </div>
      <div className="brief-columns">
        <div className="brief-main">
          <header className="brief-hero">
            <h1>Your week, in focus.</h1>
            <p>{subtitle}</p>
            {actionError ? <QueryNotice retry={() => { void overview.refetch(); void pending.refetch(); void alerts.refetch(); }}>We couldn’t load every signal. Review counts may be incomplete.</QueryNotice>
              : <Button asChild={!loadingAction} className="brief-primary" disabled={loadingAction}>
                  {loadingAction ? <span>Loading recommendations…</span> : <Link href={action.href}>{action.label}</Link>}
                </Button>}
          </header>
          <section className="brief-takeaway" aria-labelledby="takeaway-title">
            <p className="brief-eyebrow">Latest account snapshot</p>
            <h2 id="takeaway-title">{overview.isLoading ? 'Your briefing is coming together.' : overview.isError ? 'Your account snapshot is unavailable.' : takeaway.title}</h2>
            <p className="brief-narrative">{overview.isLoading ? 'Loading your connected sources and recorded performance.' : overview.isError ? 'Refresh the data before making a performance decision.' : takeaway.body}</p>
          </section>
          <section className="brief-chart-section" aria-label="Conversion history">
            <div className="brief-chart-heading"><h3>Conversions by day</h3><span className="brief-chart-legend"><span aria-hidden="true" /> All channels</span></div>
            <div className="brief-range-wrap">
              <button type="button" className="brief-range-trigger" aria-expanded={rangeOpen} aria-controls="brief-date-range" onClick={() => { setDraftRange(range); setRangeError(''); setRangeOpen(!rangeOpen); }}><CalendarDays size={13} />{shortDate(range.from)} – {shortDate(range.to)}<ChevronDown size={13} /></button>
              {rangeOpen && <form id="brief-date-range" className="brief-range-panel" onSubmit={(event) => {
                event.preventDefault();
                if (!draftRange.from || !draftRange.to || draftRange.from > draftRange.to) { setRangeError('Choose an end date on or after the start date.'); return; }
                setRange(draftRange); setRangeOpen(false);
              }}>
                <label>From<input type="date" value={draftRange.from} max={weekToDate(new Date()).to} required onChange={(event) => setDraftRange({ ...draftRange, from: event.target.value })} /></label>
                <label>Through<input type="date" value={draftRange.to} max={weekToDate(new Date()).to} required onChange={(event) => setDraftRange({ ...draftRange, to: event.target.value })} /></label>
                {rangeError && <p role="alert">{rangeError}</p>}
                <div><Button type="submit" size="sm">Apply dates</Button><Button type="button" variant="ghost" size="sm" onClick={() => setRangeOpen(false)}>Cancel</Button></div>
              </form>}
            </div>
            <div className="brief-chart" aria-hidden={series.length > 0 ? true : undefined}>
              {overview.isLoading ? <div className="brief-chart-empty" role="status"><RefreshCw size={22} /><p>Loading conversion history…</p></div>
                : overview.isError ? <div className="brief-chart-empty"><p>History couldn’t be loaded.</p></div>
                : series.length ? <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ top: 12, right: 10, left: -25, bottom: 12 }}>
                      <CartesianGrid vertical={false} stroke="var(--brief-rule)" strokeDasharray="3 5" />
                      <XAxis dataKey="date" tickFormatter={shortDate} axisLine={false} tickLine={false} tickMargin={12} minTickGap={28} tick={{ fill: 'var(--brief-muted)', fontSize: 12 }} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'var(--brief-muted)', fontSize: 12 }} />
                      <Tooltip labelFormatter={(value) => new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} contentStyle={{ background: 'var(--brief-surface)', border: '1px solid var(--brief-rule)', borderRadius: 8, color: 'var(--brief-ink)' }} />
                      <Line name="Conversions" type="linear" dataKey="conversions" stroke="var(--brief-sage)" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: 'var(--brief-bg)' }} activeDot={{ r: 5 }} isAnimationActive={false} connectNulls={false} />
                    </LineChart>
                  </ResponsiveContainer>
                : <div className="brief-chart-empty"><FileText size={26} strokeWidth={1.3} /><p>No daily history in this period.</p><span>Choose another period or connect an account.</span></div>}
            </div>
            <details className="brief-chart-data"><summary>View chart data <ChevronDown size={12} /></summary>
              <p className="brief-muted">Recorded daily history across all channels. Account snapshots may cover a different period.</p>
              <table><caption className="sr-only">Conversions by recorded date</caption><thead><tr><th scope="col">Date</th><th scope="col">Conversions</th></tr></thead><tbody>{series.map((point) => <tr key={point.date}><th scope="row">{point.date}</th><td>{point.conversions.toLocaleString()}</td></tr>)}{!series.length && <tr><td colSpan={2}>No recorded data in this period.</td></tr>}</tbody></table>
            </details>
          </section>
          {!loadingAction && !actionError && <Link href={action.href} className="brief-decision" data-testid="approval-queue">
            <span className="brief-decision-icon"><Target size={27} strokeWidth={1.7} /></span>
            <span><strong>{action.title}</strong><small>{proposal || critical ? 'Drafts stay in review. No ad-account changes here.' : 'Read-only evidence. You decide what happens next.'}</small></span><ArrowRight size={26} strokeWidth={1.5} />
          </Link>}
          <div className="brief-trust"><span><LockKeyhole size={19} /></span><p>{overview.isError ? 'Source unavailable' : source === 'live' ? 'Stored account data' : source === 'mixed' ? 'Live + sandbox data' : source === 'none' ? 'Read-only connections' : 'Sample data'} · Review before taking action</p><Link href="/settings" aria-label="Review account connections"><ArrowUpRight size={15} /></Link></div>
        </div>
        <aside className="brief-report" aria-labelledby="brief-report-heading" data-testid="evidence-card">
          <h2 id="brief-report-heading">Weekly performance report</h2>
          {reports.isLoading ? <p role="status" className="brief-muted">Loading your latest report…</p>
            : reports.isError ? <QueryNotice retry={() => { void reports.refetch(); }}>Your report couldn’t be loaded.</QueryNotice>
            : content && report ? <>
              <p className="brief-report-period">{content.periodLabel}</p>
              <p className="brief-eyebrow brief-report-source">{!reportSource ? 'Source not recorded · verify before sharing' : reportSource === 'live' ? 'Live account data' : reportSource === 'mixed' ? 'Mixed live and sandbox sources' : reportSource === 'none' ? 'No connected source data' : 'Sample report · not customer evidence'}</p>
              <section className="brief-report-overview"><h3>Overview</h3><p>{reportSummary || 'Review the full report for performance, signals, and recommended next steps.'}</p></section>
              <section className="brief-channel-section"><h3>Channel performance</h3>
                <div className="brief-table-wrap"><table><caption className="sr-only">Channel totals from the selected report</caption><thead><tr><th scope="col">Channel</th><th scope="col">Spend (USD)</th><th scope="col">Conversions</th></tr></thead><tbody>
                  {Object.entries(content.byPlatform ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([platform, value], i) => <tr key={platform}><th scope="row"><Circle size={12} className={`channel-marker marker-${i % 3}`} />{PLATFORM_NAMES[platform] || platform}</th><td>{money(value.spendCents)}</td><td>{value.conversions.toLocaleString()}</td></tr>)}
                  {!Object.keys(content.byPlatform ?? {}).length && <tr><td colSpan={3}>No channel data in this report.</td></tr>}
                </tbody></table></div>
              </section>
              <Link href={`/reports?report=${report.id}`} className="brief-report-link">Open report <ArrowUpRight size={20} /></Link>
              <Link href={`/reports?report=${report.id}`} className="brief-document" aria-label="Preview full weekly report">
                <span className="brief-document-label">Weekly performance report</span>
                <h4>{content.periodLabel}</h4>
                <p>{reportSummary || 'Performance overview and recommended next steps.'}</p>
                <h5>Recommended next steps</h5>
                <ol>{(content.recommendations?.length ? content.recommendations.slice(0, 3) : ['Review the full report and its source data.']).map((item, index) => <li key={index}>{item}</li>)}</ol>
                <span className="brief-document-footer">{reportSource === 'live' ? 'Live sources' : 'Review source labels'} · Prepared with Perfexa</span>
              </Link>
              <p className="brief-report-updated">Generated {new Date(content.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · <Link href="/reports">Report history</Link></p>
            </> : <div className="brief-report-empty"><FileText size={36} strokeWidth={1.3} /><h3>Your first report starts here.</h3><p>Turn connected account data into a clear summary of what changed and what to do next.</p><Button asChild variant="outline"><Link href="/reports">Create a report <ArrowRight size={16} /></Link></Button><small>Missing and sample sources stay clearly labeled.</small></div>}
        </aside>
      </div>
      <details className="brief-more" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>Performance details & tools <ChevronDown size={17} /></summary>
        {detailsOpen && <DashboardDetails />}
      </details>
    </div>
  );
}
