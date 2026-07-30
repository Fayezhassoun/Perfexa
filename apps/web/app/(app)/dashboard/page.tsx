'use client';

// Dashboard (CONTRACTS §10): KPI cards, trend chart, platform breakdown,
// activity feed, SEO tracker, date-range picker, dev simulate button.

import { useState } from 'react';
import Link from 'next/link';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { Activity, ArrowRight, RefreshCw, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageShell, PageHeader } from '@/components/page-shell';

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
};

export default function DashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const utils = trpc.useUtils();

  const overview = trpc.dashboard.overview.useQuery(
    from || to ? { from: from || undefined, to: to || undefined } : undefined,
  );
  const feed = trpc.dashboard.activityFeed.useQuery({ limit: 20 });
  const seo = trpc.dashboard.seoTracker.useQuery();
  const social = trpc.social.summary.useQuery();
  const reviewStats = trpc.reviews.stats.useQuery();
  const simulate = trpc.dashboard.simulateTick.useMutation({
    onSuccess: () => utils.dashboard.invalidate(),
  });

  const totals = overview.data?.totals;
  const kpis = totals
    ? [
        { label: 'Spend', value: dollars(totals.spendCents) },
        { label: 'Impressions', value: totals.impressions.toLocaleString() },
        { label: 'Clicks', value: totals.clicks.toLocaleString() },
        { label: 'CTR', value: `${(totals.ctr * 100).toFixed(1)}%` },
        { label: 'CPC', value: totals.cpcCents ? dollars(totals.cpcCents) : '—' },
        { label: 'Conversions', value: totals.conversions.toLocaleString() },
        { label: 'CPL', value: totals.cplCents ? dollars(totals.cplCents) : '—' },
        { label: 'ROAS', value: totals.roas ? `${totals.roas}×` : '—' },
      ]
    : [];

  const series = (overview.data?.series ?? []).map((p) => ({
    ...p,
    spend: p.spendCents / 100,
  }));
  const hasActivity = Boolean(
    totals &&
      (totals.spendCents > 0 || totals.impressions > 0 || totals.clicks > 0 || totals.conversions > 0),
  );

  return (
    <PageShell className="space-y-6" data-testid="dashboard">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        description="A decision-ready view of growth, spend, and operator activity."
        actions={
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
            {process.env.NODE_ENV !== 'production' && (
              <Button
                variant="outline"
                size="sm"
                disabled={simulate.isPending}
                onClick={() => simulate.mutate()}
                data-testid="simulate-tick"
              >
                <RefreshCw className={simulate.isPending ? 'animate-spin' : ''} /> Simulate poll
              </Button>
            )}
          </div>
        }
      />

      <Card className="border-primary/20 bg-primary/[0.04]" data-testid="growth-plan-bridge">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="glass-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Next action</p>
                <Badge variant={hasActivity ? 'success' : 'secondary'}>
                  {hasActivity ? 'Keep the momentum' : 'Start here'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActivity
                  ? 'Use your First 7-Day Growth Plan to turn the latest signal into the next approved action.'
                  : 'Turn your business context into a practical week-one operating plan before you start spending.'}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/growth-plan">
              Open Growth Plan <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="kpi-cards">
        {kpis.map((kpi, i) => (
          <Card key={kpi.label} className="lift animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
              <p className="font-display mt-1 truncate text-xl font-semibold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
        {!totals && overview.isLoading && (
          <p className="col-span-full text-sm text-muted-foreground">Loading…</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Spend & results over time</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {series.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--glass-bg-strong)',
                      backdropFilter: 'blur(16px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
                      border: '1px solid var(--glass-border-strong)',
                      borderRadius: 12,
                      boxShadow: 'var(--glass-shadow)',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Line type="monotone" dataKey="spend" stroke="hsl(224 88% 56%)" strokeWidth={2} name="Spend ($)" dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="hsl(190 82% 46%)" strokeWidth={2} name="Clicks" dot={false} />
                  <Line type="monotone" dataKey="conversions" stroke="hsl(158 64% 40%)" strokeWidth={2} name="Conversions" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No activity yet — approve a plan in the Voice Console to get things moving.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">By platform</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(overview.data?.byPlatform ?? {}).map(([platform, t]) => (
              <div key={platform} className="glass-tile p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{PLATFORM_LABELS[platform] ?? platform}</span>
                  <span className="text-sm">{dollars(t.spendCents)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.impressions.toLocaleString()} impressions · {t.clicks} clicks · {t.conversions}{' '}
                  conversions
                </p>
              </div>
            ))}
            {!Object.keys(overview.data?.byPlatform ?? {}).length && (
              <p className="text-sm text-muted-foreground">Nothing running yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Social + reputation snapshot */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lift">
          <CardHeader>
            <CardTitle className="text-base">Social engagement</CardTitle>
          </CardHeader>
          <CardContent>
            {social.data && social.data.published > 0 ? (
              <div className="space-y-2">
                <p className="font-display text-2xl font-semibold">
                  {social.data.totals.impressions.toLocaleString()}{' '}
                  <span className="text-sm font-normal text-muted-foreground">impressions</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {social.data.published} published · {social.data.scheduled} scheduled ·{' '}
                  {social.data.totals.likes.toLocaleString()} likes ·{' '}
                  {social.data.totals.comments.toLocaleString()} comments
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(social.data.byPlatform).map(([p, v]) => (
                    <Badge key={p} variant="outline">
                      {p}: {v.impressions.toLocaleString()} impr
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nothing published yet — draft a post on the Social page or just say “post about…” in
                the console.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lift">
          <CardHeader>
            <CardTitle className="text-base">Reputation</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewStats.data && reviewStats.data.total > 0 ? (
              <div className="space-y-2">
                <p className="font-display text-2xl font-semibold">
                  {reviewStats.data.avgRating ?? '—'}★{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    across {reviewStats.data.total} reviews
                  </span>
                </p>
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/10">
                  {reviewStats.data.total > 0 && (
                    <>
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${(reviewStats.data.positive / reviewStats.data.total) * 100}%` }}
                      />
                      <div
                        className="bg-amber-500"
                        style={{ width: `${(reviewStats.data.neutral / reviewStats.data.total) * 100}%` }}
                      />
                      <div
                        className="bg-red-500"
                        style={{ width: `${(reviewStats.data.negative / reviewStats.data.total) * 100}%` }}
                      />
                    </>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {reviewStats.data.positive} positive · {reviewStats.data.neutral} neutral ·{' '}
                  {reviewStats.data.negative} negative · {reviewStats.data.awaitingReply} awaiting a
                  reply
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reviews synced yet — visit the Reviews page to pull them in.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Agent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2" data-testid="activity-feed">
            {(feed.data ?? []).map((item) => (
              <div key={item.id} className="glass-divider-b flex items-start justify-between gap-2 pb-2 last:border-0">
                <div>
                  <p className="text-sm">{item.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.actor} · {new Date(item.at).toLocaleString()}
                  </p>
                </div>
                {item.status && (
                  <Badge variant={item.status === 'completed' ? 'success' : 'secondary'}>{item.status}</Badge>
                )}
              </div>
            ))}
            {!feed.data?.length && <p className="text-sm text-muted-foreground">No agent activity yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">SEO tracker</CardTitle>
          </CardHeader>
          <CardContent>
            {seo.data?.url ? (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-primary text-xl font-bold">
                    {seo.data.score ?? '—'}
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{seo.data.url}</p>
                    <p className="text-muted-foreground">
                      {seo.data.missingMetaDescriptions ?? 0} missing meta descriptions ·{' '}
                      {seo.data.hasLeadForm ? 'lead form present' : 'no lead form'}
                    </p>
                  </div>
                </div>
                {seo.data.cwv && (
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="glass-tile p-2">
                      <p className="text-muted-foreground">LCP</p>
                      <p className="font-medium">{seo.data.cwv.lcpMs ? `${(seo.data.cwv.lcpMs / 1000).toFixed(1)}s` : '—'}</p>
                    </div>
                    <div className="glass-tile p-2">
                      <p className="text-muted-foreground">CLS</p>
                      <p className="font-medium">{seo.data.cwv.cls ?? '—'}</p>
                    </div>
                    <div className="glass-tile p-2">
                      <p className="text-muted-foreground">INP</p>
                      <p className="font-medium">{seo.data.cwv.inpMs ? `${seo.data.cwv.inpMs}ms` : '—'}</p>
                    </div>
                    <div className="glass-tile p-2">
                      <p className="text-muted-foreground">FCP</p>
                      <p className="font-medium">{seo.data.cwv.fcpMs ? `${(seo.data.cwv.fcpMs / 1000).toFixed(1)}s` : '—'}</p>
                    </div>
                  </div>
                )}
                {seo.data.rankings.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs uppercase text-muted-foreground">Keyword positions</p>
                    <div className="space-y-1">
                      {seo.data.rankings.slice(0, 8).map((r) => (
                        <div key={r.keyword} className="flex justify-between text-sm">
                          <span className="truncate">{r.keyword}</span>
                          <span className="text-muted-foreground">#{r.position}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add your website in Settings (or during onboarding) to see SEO health here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
