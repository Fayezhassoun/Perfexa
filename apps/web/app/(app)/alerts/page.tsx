'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Flame,
  Gauge,
  RefreshCw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell, PageHeader } from '@/components/page-shell';
import { cn } from '@/lib/utils';

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  snapchat: 'Snapchat',
};

const TYPE_META: Record<string, { label: string; icon: typeof Zap }> = {
  anomaly: { label: 'Anomaly', icon: Zap },
  creative_fatigue: { label: 'Creative Fatigue', icon: Gauge },
  budget: { label: 'Budget', icon: TrendingDown },
};

function timeAgo(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMetric(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return null;
  switch (key) {
    case 'spendCents':
      return `Spend $${(num / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    case 'ctr':
      return `CTR ${(num * 100).toFixed(2)}%`;
    case 'ctrChangePct':
      return `CTR Δ ${num > 0 ? '+' : ''}${num}%`;
    case 'frequency':
      return `Freq ${num.toFixed(1)}×`;
    case 'impressions':
      return `${num.toLocaleString()} impr.`;
    case 'conversions':
      return `${num} conv.`;
    case 'roas':
      return `ROAS ${num.toFixed(2)}×`;
    case 'cpcCents':
      return `CPC $${(num / 100).toFixed(2)}`;
    default:
      return null;
  }
}

const METRIC_KEYS = ['spendCents', 'ctr', 'frequency', 'impressions', 'conversions', 'roas', 'cpcCents'];

type AlertRow = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  platform: string | null;
  metrics: Record<string, unknown> | null;
  suggestedAction: string | null;
  acknowledged: boolean;
  createdAt: Date;
};

export default function AlertsPage() {
  const [filter, setFilter] = useState<'active' | 'all' | 'critical'>('active');
  const utils = trpc.useUtils();

  const alerts = trpc.alerts.list.useQuery({ limit: 100 });
  const runDetection = trpc.alerts.runDetection.useMutation({
    onSuccess: () => utils.alerts.invalidate(),
  });
  const acknowledge = trpc.alerts.acknowledge.useMutation({
    onSuccess: () => utils.alerts.invalidate(),
  });

  const rows = (alerts.data ?? []) as AlertRow[];
  const active = rows.filter((r) => !r.acknowledged);
  const critical = active.filter((r) => r.severity === 'critical');
  const warnings = active.filter((r) => r.severity === 'warning');

  const visible = rows
    .filter((r) =>
      filter === 'active' ? !r.acknowledged : filter === 'critical' ? !r.acknowledged && r.severity === 'critical' : true,
    )
    .sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
      const sev = { critical: 0, warning: 1, info: 2 } as Record<string, number>;
      if (sev[a.severity] !== sev[b.severity]) return (sev[a.severity] ?? 3) - (sev[b.severity] ?? 3);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const stats = [
    { label: 'Active alerts', value: active.length, icon: Bell, tone: active.length ? 'text-foreground' : 'text-muted-foreground' },
    { label: 'Critical', value: critical.length, icon: Flame, tone: critical.length ? 'text-red-500' : 'text-muted-foreground' },
    { label: 'Warnings', value: warnings.length, icon: AlertTriangle, tone: warnings.length ? 'text-amber-500' : 'text-muted-foreground' },
    { label: 'Acknowledged', value: rows.filter((r) => r.acknowledged).length, icon: CheckCheck, tone: 'text-emerald-500' },
  ];

  return (
    <PageShell className="space-y-6" data-testid="alerts">
      <PageHeader
        eyebrow={
          <span className="live-status">
            <span className="live-dot" aria-hidden /> Guardian monitoring
          </span>
        }
        title="Alerts Center"
        description="Real-time anomaly and creative-fatigue detection across your campaigns. The Guardian watches spend, CTR, frequency, and conversions — and tells you what to do."
        actions={
          <Button onClick={() => runDetection.mutate()} disabled={runDetection.isPending}>
            {runDetection.isPending ? <RefreshCw className="animate-spin" /> : <Zap />}
            {runDetection.isPending ? 'Scanning…' : 'Run detection'}
          </Button>
        }
      />

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }, i) => (
          <div
            key={label}
            className="glass-panel animate-fade-up p-4 transition-transform duration-200 hover:-translate-y-0.5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-center justify-between">
              <p className="stat-label text-muted-foreground">{label}</p>
              <Icon className={cn('h-4 w-4', tone)} />
            </div>
            <p className={cn('stat-value', tone)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {(
          [
            { key: 'active', label: `Active (${active.length})` },
            { key: 'critical', label: `Critical (${critical.length})` },
            { key: 'all', label: `All (${rows.length})` },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
              filter === key
                ? 'border-primary/40 bg-primary/15 text-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:bg-[color:var(--glass-bg-subtle)] hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Alert list */}
      {alerts.isLoading ? (
        <div className="glass-panel flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Scanning campaigns…
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state glass-panel flex flex-col items-center gap-3 p-16 text-center">
          <ShieldAlert className="h-10 w-10 text-emerald-500" />
          <p className="font-display text-lg font-semibold">All clear</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            No {filter === 'critical' ? 'critical' : ''} alerts right now. Run detection to scan your latest campaign data.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((a, i) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, icon: Bell };
            const TypeIcon = meta.icon;
            const isCritical = a.severity === 'critical';
            const metrics = a.metrics ?? {};
            const metricChips = METRIC_KEYS.map((k) => formatMetric(k, metrics[k])).filter(Boolean) as string[];
            return (
              <div
                key={a.id}
                className={cn(
                  'glass-panel group relative overflow-hidden border-l-2 p-5 transition-all duration-200 hover:-translate-y-0.5',
                  isCritical ? 'border-l-red-500 bg-red-500/[0.035]' : a.severity === 'warning' ? 'border-l-amber-500 bg-amber-500/[0.035]' : 'border-l-sky-500 bg-sky-500/[0.025]',
                  a.acknowledged && 'opacity-60',
                )}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {/* severity edge */}
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 w-1',
                    isCritical ? 'bg-red-500' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500',
                  )}
                />
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2 pl-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isCritical ? 'destructive' : a.severity === 'warning' ? 'warning' : 'secondary'}>
                        <TypeIcon className="mr-1 h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <Badge variant={isCritical ? 'destructive' : a.severity === 'warning' ? 'warning' : 'secondary'}>
                        {a.severity}
                      </Badge>
                      {a.platform && <Badge variant="outline">{PLATFORM_LABELS[a.platform] ?? a.platform}</Badge>}
                      <span className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                    </div>
                    <h3 className="font-display text-base font-semibold tracking-tight">{a.title}</h3>
                    <p className="text-sm text-muted-foreground">{a.message}</p>
                    {metricChips.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {metricChips.map((m) => (
                          <span
                            key={m}
                            className="rounded-md border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground"
                          >
                            {m}
                          </span>
                        ))}
                        {metrics.ctrChangePct !== null && metrics.ctrChangePct !== undefined && Number.isFinite(Number(metrics.ctrChangePct)) && (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[0.7rem] tabular-nums',
                              Number(metrics.ctrChangePct) < 0
                                ? 'border-red-500/30 bg-red-500/10 text-red-500'
                                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                            )}
                          >
                            {Number(metrics.ctrChangePct) < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                            CTR {Number(metrics.ctrChangePct) > 0 ? '+' : ''}{Number(metrics.ctrChangePct)}%
                          </span>
                        )}
                      </div>
                    )}
                    {a.suggestedAction && (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2">
                        <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <p className="text-xs leading-relaxed text-foreground/90">{a.suggestedAction}</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 pl-2">
                    {a.acknowledged ? (
                      <Badge variant="success">
                        <Check className="mr-1 h-3 w-3" /> Acknowledged
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => acknowledge.mutate({ alertId: a.id })}
                        disabled={acknowledge.isPending}
                      >
                        <BellOff className="h-3.5 w-3.5" /> Acknowledge
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
