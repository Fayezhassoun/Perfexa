'use client';

import { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Flame,
  Gauge,
  Image as ImageIcon,
  RefreshCw,
  ScanSearch,
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

type FatigueSignal = {
  creativeId: string;
  campaignId: string | null;
  platform: string;
  headline: string | null;
  severity: 'warning' | 'critical';
  signal: string;
  frequency: number;
  ctr: number;
  ctrChangePct: number;
  impressions: number;
  suggestedAction: string;
};

/** Circular frequency gauge — the signature visual of this page. */
function FrequencyGauge({ value, severity }: { value: number; severity: 'warning' | 'critical' }) {
  const max = 8;
  const pct = Math.min(value / max, 1);
  const r = 26;
  const circ = 2 * Math.PI * r;
  const color = severity === 'critical' ? '#ef4444' : '#f59e0b';
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeWidth="5" className="text-[color:var(--glass-bg-subtle)]" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 600ms var(--ease-out)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-sm font-semibold tabular-nums" style={{ color }}>
          {value.toFixed(1)}
        </span>
        <span className="text-[0.55rem] uppercase tracking-wider text-muted-foreground">freq</span>
      </div>
    </div>
  );
}

export default function CreativesPage() {
  const utils = trpc.useUtils();
  const [lastScan, setLastScan] = useState<{ scanned: number; fatigued: number; alerts: number } | null>(null);

  const signals = trpc.creatives.fatigueSignals.useQuery() as {
    data: FatigueSignal[] | undefined;
    isLoading: boolean;
  };
  const detect = trpc.creatives.detectFatigue.useMutation({
    onSuccess: (report) => {
      setLastScan({ scanned: report.scannedCreatives, fatigued: report.fatiguedCreatives, alerts: report.alertsCreated });
      utils.creatives.invalidate();
      utils.alerts.invalidate();
    },
  });

  const rows = (signals.data ?? []) as FatigueSignal[];
  const critical = rows.filter((r) => r.severity === 'critical');
  const warnings = rows.filter((r) => r.severity === 'warning');

  const stats = [
    { label: 'Fatigued creatives', value: rows.length, icon: Gauge, tone: rows.length ? 'text-foreground' : 'text-muted-foreground' },
    { label: 'Critical', value: critical.length, icon: Flame, tone: critical.length ? 'text-red-500' : 'text-muted-foreground' },
    { label: 'Warnings', value: warnings.length, icon: AlertTriangle, tone: warnings.length ? 'text-amber-500' : 'text-muted-foreground' },
    {
      label: 'Health',
      value: rows.length === 0 ? 'Good' : critical.length ? 'At risk' : 'Watch',
      icon: Activity,
      tone: rows.length === 0 ? 'text-emerald-500' : critical.length ? 'text-red-500' : 'text-amber-500',
    },
  ];

  return (
    <PageShell className="page-depth space-y-6" data-testid="creatives">
      <PageHeader
        eyebrow={
          <span className="live-status">
            <span className="live-dot" aria-hidden /> Creative intelligence
          </span>
        }
        title="Creative Health"
        description="Ad fatigue is silent until it's expensive. The detector watches frequency, CTR decay, and conversion drought on every creative — and tells you when to rotate."
        actions={
          <Button onClick={() => detect.mutate()} disabled={detect.isPending}>
            {detect.isPending ? <RefreshCw className="animate-spin" /> : <ScanSearch />}
            {detect.isPending ? 'Scanning…' : 'Run fatigue scan'}
          </Button>
        }
      />

      {lastScan && (
        <div className="glass-panel animate-fade-up flex items-center gap-3 border-emerald-500/30 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <p className="text-sm">
            Scanned <strong className="tabular-nums">{lastScan.scanned}</strong> creatives ·{' '}
            <strong className="tabular-nums">{lastScan.fatigued}</strong> fatigued ·{' '}
            <strong className="tabular-nums">{lastScan.alerts}</strong> new alerts created
          </p>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone }, i) => (
          <div
            key={label}
            className="glass-panel elevated-card animate-fade-up p-4 transition-transform duration-200 hover:-translate-y-0.5"
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

      {/* Creative cards */}
      {signals.isLoading ? (
        <div className="glass-panel flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing creatives…
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state glass-panel flex flex-col items-center gap-3 p-16 text-center">
          <ImageIcon className="h-10 w-10 text-emerald-500" />
          <p className="font-display text-lg font-semibold">No fatigued creatives</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Every creative looks fresh. Run a scan after your next data sync to check frequency, CTR decay, and conversion drought.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((s, i) => {
            const isCritical = s.severity === 'critical';
            return (
              <div
                key={s.creativeId}
                className={cn(
                  'glass-panel severity-card animate-fade-up group relative overflow-hidden border-l-2 p-5 transition-all duration-200 hover:-translate-y-0.5',
                  isCritical ? 'severity-critical' : 'severity-warning',
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <span className={cn('severity-edge absolute inset-y-0 left-0 w-1', isCritical ? 'severity-critical' : 'severity-warning')} />
                <div className="flex items-start gap-4 pl-2">
                  <FrequencyGauge value={s.frequency} severity={s.severity} />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isCritical ? 'destructive' : 'warning'}>
                        {isCritical ? <Flame className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                        {s.severity}
                      </Badge>
                      <Badge variant="outline">{PLATFORM_LABELS[s.platform] ?? s.platform}</Badge>
                    </div>
                    <h3 className="truncate font-display text-base font-semibold tracking-tight">
                      {s.headline ?? s.creativeId}
                    </h3>
                    <p className="text-sm text-muted-foreground">{s.signal}</p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="rounded-md border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        CTR {(s.ctr * 100).toFixed(2)}%
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[0.7rem] tabular-nums',
                          s.ctrChangePct < 0
                            ? 'border-red-500/30 bg-red-500/10 text-red-500'
                            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
                        )}
                      >
                        {s.ctrChangePct < 0 ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                        {s.ctrChangePct > 0 ? '+' : ''}
                        {s.ctrChangePct}% vs avg
                      </span>
                      <span className="rounded-md border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-2 py-0.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                        {s.impressions.toLocaleString()} impr.
                      </span>
                    </div>

                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/8 px-3 py-2">
                      <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="text-xs leading-relaxed text-foreground/90">{s.suggestedAction}</p>
                    </div>
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
