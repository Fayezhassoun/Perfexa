'use client';

// Dashboard (CONTRACTS §10): Command Center home. Keep existing data queries
// and safe approval boundaries while prioritizing truth, risk, opportunity,
// pending approvals, and latest evidence in the first viewport.

import { useRef, useState } from 'react';
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
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  FileText,
  Flame,
  Gauge,
  Globe,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageShell, PageHeader } from '@/components/page-shell';
import { ProofFlow, type ProofFlowHandle } from '@/components/proof-flow';
import { ActivationCard } from '@/components/activation-card';
import { DemoDataBanner } from '@/components/demo-data-banner';
import { DataSourceNotice, type DataSource } from '@/components/data-source-notice';
import { cn } from '@/lib/utils';

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function fullDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
};

const SOURCE_META: Record<
  DataSource | 'demo',
  { label: string; body: string; badge: string; tone: string }
> = {
  none: {
    label: 'Setup needed',
    body: 'No campaign data has been synced. Connect a read-only account before treating reports as customer evidence.',
    badge: 'No source',
    tone: 'border-slate-300/70 bg-slate-500/5',
  },
  live: {
    label: 'Live account data',
    body: 'Campaign metrics come from a stored sync of connected live accounts.',
    badge: 'Live',
    tone: 'border-emerald-500/30 bg-emerald-500/10',
  },
  sandbox: {
    label: 'Sandbox data',
    body: 'Campaign metrics are from sandbox rows. Use for testing only.',
    badge: 'Sandbox',
    tone: 'border-amber-500/30 bg-amber-500/10',
  },
  mixed: {
    label: 'Mixed data sources',
    body: 'This workspace combines live and sandbox campaign rows. Review provenance before sharing.',
    badge: 'Mixed',
    tone: 'border-amber-500/30 bg-amber-500/10',
  },
  demo: {
    label: 'Demo data',
    body: 'The workspace is showing deterministic sample numbers. They are not customer evidence.',
    badge: 'Demo',
    tone: 'border-amber-500/30 bg-amber-500/10',
  },
};

type AlertRow = { id: string; severity: string; title: string; message?: string | null };
type FatigueRow = { creativeId: string; severity: string; headline?: string | null; signal?: string };
type ProposalRow = {
  id: string;
  plan: unknown;
  status: string | null;
  createdAt: Date | string;
};
type ReportContent = {
  periodLabel?: string;
  generatedAt?: string;
  source?: 'llm' | 'deterministic';
  demoData?: boolean;
  dataSource?: DataSource | 'demo';
  totals?: { spendCents: number; impressions: number; clicks: number; conversions: number };
  priorities?: string[];
  recommendations?: string[];
};
type WeeklyReportRow = {
  id: string;
  weekStart: Date | string;
  createdAt: Date | string;
  content: ReportContent;
};

function readPlanText(plan: unknown, key: 'title' | 'summary'): string | null {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const value = (plan as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function SystemTruthBar({
  source,
  campaigns,
  hasActivity,
  loading,
}: {
  source: DataSource | 'demo';
  campaigns: number;
  hasActivity: boolean;
  loading: boolean;
}) {
  const meta = SOURCE_META[source];
  return (
    <Card className={cn('border p-0', meta.tone)} data-testid="system-truth-bar">
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1.2fr_0.8fr_auto] md:items-center">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--glass-border)] bg-background/70">
            <ShieldCheck className="h-4 w-4 text-primary" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-base font-semibold">{loading ? 'Checking workspace truth' : meta.label}</p>
              <Badge variant={source === 'live' ? 'success' : source === 'none' ? 'secondary' : 'warning'}>{meta.badge}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{meta.body}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Campaign rows</p>
            <p className="font-display text-xl font-semibold tabular-nums">{campaigns}</p>
          </div>
          <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/60 p-3">
            <p className="text-xs text-muted-foreground">Activity</p>
            <p className="font-display text-xl font-semibold">{hasActivity ? 'Present' : 'None yet'}</p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/settings">
            Review connections <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function DecisionQueue({
  risk,
  opportunity,
}: {
  risk: { title: string; body: string; href: string; cta: string; tone: 'danger' | 'warning' | 'neutral' };
  opportunity: { title: string; body: string; href: string; cta: string };
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="decision-queue">
      <Card className={cn('border-l-4', risk.tone === 'danger' ? 'border-l-destructive' : risk.tone === 'warning' ? 'border-l-amber-500' : 'border-l-emerald-500')}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className={cn('h-4 w-4', risk.tone === 'danger' ? 'text-destructive' : risk.tone === 'warning' ? 'text-amber-500' : 'text-emerald-500')} />
            Top risk
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{risk.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{risk.body}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={risk.href}>
              {risk.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Best next move
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-medium">{opportunity.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{opportunity.body}</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={opportunity.href}>
              {opportunity.cta} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SignalSummary({
  alerts,
  fatigue,
  awaitingReplies,
  portalEnabled,
}: {
  alerts: AlertRow[];
  fatigue: FatigueRow[];
  awaitingReplies: number;
  portalEnabled: boolean;
}) {
  const tiles = [
    { label: 'Alerts', value: alerts.length, href: '/alerts', icon: Bell, tone: alerts.length ? 'text-amber-500' : 'text-emerald-500' },
    { label: 'Creative fatigue', value: fatigue.length, href: '/creatives', icon: Gauge, tone: fatigue.length ? 'text-amber-500' : 'text-emerald-500' },
    { label: 'Review replies', value: awaitingReplies, href: '/reviews', icon: Activity, tone: awaitingReplies ? 'text-amber-500' : 'text-emerald-500' },
    { label: 'Portal', value: portalEnabled ? 'On' : 'Off', href: '/portal', icon: Globe, tone: portalEnabled ? 'text-emerald-500' : 'text-muted-foreground' },
  ];
  return (
    <Card data-testid="signal-summary">
      <CardHeader>
        <CardTitle className="text-base">Signals ranked for review</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(({ label, value, href, icon: Icon, tone }) => (
          <Link key={label} href={href} className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-3 hover:bg-[color:var(--glass-bg-subtle)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className={cn('h-4 w-4', tone)} />
            </div>
            <p className="mt-2 font-display text-xl font-semibold tabular-nums">{value}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ApprovalQueue({ proposals }: { proposals: ProposalRow[] }) {
  const first = proposals[0];
  return (
    <Card data-testid="approval-queue">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Awaiting approval</span>
          <Badge variant={proposals.length ? 'warning' : 'success'}>{proposals.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {first ? (
          <div>
            <p className="font-medium">{readPlanText(first.plan, 'title') ?? 'Proposal ready for review'}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {readPlanText(first.plan, 'summary') ?? 'Review the proposed action before anything runs.'}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Created {timeAgo(first.createdAt)}</p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/proposals">
                Review safely <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            title="No approvals waiting"
            body="No proposal will spend, publish, pause, or resume without an explicit approval."
            href="/console"
            cta="Open Console"
          />
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceCard({ report }: { report: WeeklyReportRow | null }) {
  const content = report?.content;
  return (
    <Card data-testid="evidence-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-4 w-4 text-primary" />
          Latest evidence
        </CardTitle>
      </CardHeader>
      <CardContent>
        {report && content ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={content.demoData || content.dataSource === 'demo' ? 'warning' : 'outline'}>
                {content.demoData || content.dataSource === 'demo' ? 'Demo labeled' : content.source === 'llm' ? 'AI narrated' : 'Deterministic'}
              </Badge>
              <span className="text-xs text-muted-foreground">{content.periodLabel ?? 'Weekly report'}</span>
            </div>
            <p className="mt-3 font-medium">Weekly report generated {timeAgo(content.generatedAt ?? report.createdAt)}</p>
            {content.totals && (
              <p className="mt-2 text-sm text-muted-foreground">
                {fullDollars(content.totals.spendCents)} spend, {content.totals.conversions} conversions.
              </p>
            )}
            {(content.priorities?.[0] || content.recommendations?.[0]) && (
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {content.priorities?.[0] ?? content.recommendations?.[0]}
              </p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/reports">
                Open report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            title="No report yet"
            body="Generate the first weekly report from the Reports surface once sources are ready."
            href="/reports"
            cta="Open Reports"
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  body,
  href,
  cta,
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="empty-state p-4">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <Button asChild variant="outline" size="sm" className="mt-4">
        <Link href={href}>
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

export default function DashboardPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const utils = trpc.useUtils();
  const proofFlowRef = useRef<ProofFlowHandle>(null);

  const overview = trpc.dashboard.overview.useQuery(
    from || to ? { from: from || undefined, to: to || undefined } : undefined,
  );
  const feed = trpc.dashboard.activityFeed.useQuery({ limit: 20 });
  const seo = trpc.dashboard.seoTracker.useQuery();
  const social = trpc.social.summary.useQuery();
  const reviewStats = trpc.reviews.stats.useQuery();
  const activeAlerts = trpc.alerts.list.useQuery({ unacknowledgedOnly: true, limit: 100 });
  const fatigue = trpc.creatives.fatigueSignals.useQuery();
  const portal = trpc.portal.get.useQuery();
  const pendingProposals = trpc.proposals.list.useQuery({ status: 'pending' });
  const reports = trpc.reports.weekly.list.useQuery();
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
        { label: 'CPC', value: totals.cpcCents ? dollars(totals.cpcCents) : 'No clicks' },
        { label: 'Conversions', value: totals.conversions.toLocaleString() },
        { label: 'CPL', value: totals.cplCents ? dollars(totals.cplCents) : 'No leads' },
        { label: 'ROAS', value: totals.roas ? `${totals.roas}x` : 'No revenue' },
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

  const alertRows = (activeAlerts.data ?? []) as AlertRow[];
  const criticalAlerts = alertRows.filter((a) => a.severity === 'critical');
  const fatigueRows = (fatigue.data ?? []) as FatigueRow[];
  const criticalFatigue = fatigueRows.filter((f) => f.severity === 'critical');
  const portalEnabled = portal.data?.enabled ?? false;
  const proposals = (pendingProposals.data ?? []) as ProposalRow[];
  const latestReport = ((reports.data ?? []) as WeeklyReportRow[])[0] ?? null;
  const source: DataSource | 'demo' = overview.data?.demoData ? 'demo' : overview.data?.dataSource ?? 'none';
  const awaitingReplies = reviewStats.data?.awaitingReply ?? 0;

  const risk =
    criticalAlerts[0]
      ? {
          title: criticalAlerts[0].title,
          body: criticalAlerts[0].message ?? 'A critical alert is waiting for review.',
          href: '/alerts',
          cta: 'Review alert',
          tone: 'danger' as const,
        }
      : criticalFatigue[0]
      ? {
          title: criticalFatigue[0].headline ?? 'Creative fatigue is critical',
          body: criticalFatigue[0].signal ?? 'A creative is showing critical fatigue and needs review.',
          href: '/creatives',
          cta: 'Review creative',
          tone: 'danger' as const,
        }
      : source !== 'live'
      ? {
          title: SOURCE_META[source].label,
          body: SOURCE_META[source].body,
          href: '/settings',
          cta: 'Review source',
          tone: source === 'none' ? ('neutral' as const) : ('warning' as const),
        }
      : awaitingReplies > 0
      ? {
          title: `${awaitingReplies} review ${awaitingReplies === 1 ? 'reply' : 'replies'} waiting`,
          body: 'AI-drafted replies stay in review until you approve them.',
          href: '/reviews',
          cta: 'Review replies',
          tone: 'warning' as const,
        }
      : {
          title: 'No urgent risk detected',
          body: 'Active alerts, creative fatigue, and review replies are clear based on the loaded signals.',
          href: '/alerts',
          cta: 'Open Signals',
          tone: 'neutral' as const,
        };

  const bestPlatform = Object.entries(overview.data?.byPlatform ?? {})
    .filter(([, value]) => value.conversions > 0 && value.cplCents > 0)
    .sort(([, a], [, b]) => a.cplCents - b.cplCents)[0];
  const opportunity = bestPlatform
    ? {
        title: `${PLATFORM_LABELS[bestPlatform[0]] ?? bestPlatform[0]} is most efficient`,
        body: `${PLATFORM_LABELS[bestPlatform[0]] ?? bestPlatform[0]} is producing conversions at ${dollars(bestPlatform[1].cplCents)} CPL. Use Console to turn this into an approval-ready next move.`,
        href: '/console',
        cta: 'Draft next move',
      }
    : latestReport?.content?.recommendations?.[0]
    ? {
        title: 'Latest report has a recommendation',
        body: latestReport.content.recommendations[0],
        href: '/reports',
        cta: 'Open evidence',
      }
    : {
        title: 'Generate the weekly report',
        body: hasActivity
          ? 'Turn the loaded performance data into an approval-ready weekly report.'
          : 'Connect sources or use the Console to prepare the first safe plan before reporting.',
        href: hasActivity ? '/reports' : '/console',
        cta: hasActivity ? 'Open Reports' : 'Open Console',
      };

  return (
    <PageShell className="space-y-6" data-testid="dashboard">
      <PageHeader
        eyebrow="Command"
        title="Command Center"
        description="Connect, diagnose, decide, approve, and report from one operating view."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="dashboard-from" className="sr-only">Start date</label>
            <Input id="dashboard-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
            <span className="text-sm text-muted-foreground">to</span>
            <label htmlFor="dashboard-to" className="sr-only">End date</label>
            <Input id="dashboard-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
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

      <SystemTruthBar
        source={source}
        campaigns={overview.data?.campaigns ?? 0}
        hasActivity={hasActivity}
        loading={overview.isLoading}
      />

      {overview.data?.demoData && <DemoDataBanner />}
      {overview.data && !overview.data.demoData && (
        <DataSourceNotice
          source={overview.data.dataSource === 'demo' ? 'none' : overview.data.dataSource}
          actionHref="/settings"
          actionLabel="Review connections"
        />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-4">
          <DecisionQueue risk={risk} opportunity={opportunity} />
          <SignalSummary
            alerts={alertRows}
            fatigue={fatigueRows}
            awaitingReplies={awaitingReplies}
            portalEnabled={portalEnabled}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <ApprovalQueue proposals={proposals} />
          <EvidenceCard report={latestReport} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3" data-testid="command-bridges">
        <Card>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Console</p>
              <p className="mt-1 text-sm text-muted-foreground">Turn diagnosis into an approval-ready plan.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/console">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Studio</p>
              <p className="mt-1 text-sm text-muted-foreground">Create content, social, video, and inspiration drafts.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/content">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Evidence</p>
              <p className="mt-1 text-sm text-muted-foreground">Review reports, portal state, and audit history.</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports">Open <ArrowRight className="h-3.5 w-3.5" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <ProofFlow ref={proofFlowRef} />
      <ActivationCard onShowDemo={() => proofFlowRef.current?.open()} />

      <Card className="border-primary/20 bg-primary/[0.04]" data-testid="growth-plan-bridge">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="glass-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">First 7-Day Growth Plan</p>
                <Badge variant={hasActivity ? 'success' : 'secondary'}>
                  {hasActivity ? 'Use current data' : 'Start here'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActivity
                  ? 'Turn the latest signal into a practical plan before approving action.'
                  : 'Frame the first operating week before you start spending.'}
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

      <Card className="border-primary/20 bg-primary/[0.04]" data-testid="inspiration-bridge">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="glass-chip flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary">
              <WandSparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">Competitor-inspired campaign draft</p>
                <Badge variant="outline">Review first</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Research visible competitor patterns, adapt the useful pieces, and prepare a paused campaign draft.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/inspiration">
              Open Inspiration <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="kpi-cards">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="font-display mt-1 truncate text-xl font-semibold">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
        {!totals && overview.isLoading && (
          <p className="col-span-full text-sm text-muted-foreground">Loading...</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Spend and results over time</CardTitle>
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
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      boxShadow: 'var(--perfexa-shadow)',
                      color: 'hsl(var(--foreground))',
                    }}
                  />
                  <Line type="monotone" dataKey="spend" stroke="hsl(var(--primary))" strokeWidth={2} name="Spend ($)" dot={false} />
                  <Line type="monotone" dataKey="clicks" stroke="hsl(var(--accent))" strokeWidth={2} name="Clicks" dot={false} />
                  <Line type="monotone" dataKey="conversions" stroke="hsl(158 64% 40%)" strokeWidth={2} name="Conversions" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No activity yet. Approve a plan in Console to get started.
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
              <div key={platform} className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{PLATFORM_LABELS[platform] ?? platform}</span>
                  <span className="text-sm">{dollars(t.spendCents)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.impressions.toLocaleString()} impressions, {t.clicks} clicks, {t.conversions} conversions
                </p>
              </div>
            ))}
            {!Object.keys(overview.data?.byPlatform ?? {}).length && (
              <p className="text-sm text-muted-foreground">Nothing running yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
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
                  {social.data.published} published, {social.data.scheduled} scheduled,{' '}
                  {social.data.totals.likes.toLocaleString()} likes, {social.data.totals.comments.toLocaleString()} comments
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
                Nothing published yet. Draft a post on the Social page or use Console.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reputation</CardTitle>
          </CardHeader>
          <CardContent>
            {reviewStats.data && reviewStats.data.total > 0 ? (
              <div className="space-y-2">
                <p className="font-display text-2xl font-semibold">
                  {reviewStats.data.avgRating ?? 'No rating'}★{' '}
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
                  {reviewStats.data.positive} positive, {reviewStats.data.neutral} neutral,{' '}
                  {reviewStats.data.negative} negative, {reviewStats.data.awaitingReply} awaiting a reply
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No reviews synced yet. Visit Reviews to pull them in.
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
              <div key={item.id} className="border-b border-[color:var(--glass-divider)] pb-2 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm">{item.text}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.actor}, {new Date(item.at).toLocaleString()}
                    </p>
                  </div>
                  {item.status && (
                    <Badge variant={item.status === 'completed' ? 'success' : 'secondary'}>{item.status}</Badge>
                  )}
                </div>
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
                    {seo.data.score ?? 'No score'}
                  </div>
                  <div className="text-sm">
                    <p className="font-medium">{seo.data.url}</p>
                    <p className="text-muted-foreground">
                      {seo.data.missingMetaDescriptions ?? 0} missing meta descriptions,{' '}
                      {seo.data.hasLeadForm ? 'lead form present' : 'no lead form'}
                    </p>
                  </div>
                </div>
                {seo.data.cwv && (
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-2">
                      <p className="text-muted-foreground">LCP</p>
                      <p className="font-medium">{seo.data.cwv.lcpMs ? `${(seo.data.cwv.lcpMs / 1000).toFixed(1)}s` : 'No data'}</p>
                    </div>
                    <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-2">
                      <p className="text-muted-foreground">CLS</p>
                      <p className="font-medium">{seo.data.cwv.cls ?? 'No data'}</p>
                    </div>
                    <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-2">
                      <p className="text-muted-foreground">INP</p>
                      <p className="font-medium">{seo.data.cwv.inpMs ? `${seo.data.cwv.inpMs}ms` : 'No data'}</p>
                    </div>
                    <div className="rounded-lg border border-[color:var(--glass-border)] bg-background/55 p-2">
                      <p className="text-muted-foreground">FCP</p>
                      <p className="font-medium">{seo.data.cwv.fcpMs ? `${(seo.data.cwv.fcpMs / 1000).toFixed(1)}s` : 'No data'}</p>
                    </div>
                  </div>
                )}
                {seo.data.rankings.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Keyword positions</p>
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
                Add your website in Settings or during onboarding to see SEO health here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

