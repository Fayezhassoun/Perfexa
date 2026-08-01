'use client';

import { useEffect, useState } from 'react';
import {
  Bell,
  CalendarDays,
  DollarSign,
  Eye,
  FileText,
  Gauge,
  Inbox,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell, PageHeader } from '@/components/page-shell';
import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

interface ReportContent {
  markdown: string;
  periodLabel: string;
  totals: { spendCents: number; impressions: number; clicks: number; conversions: number };
  byPlatform: Record<string, { spendCents: number; impressions: number; clicks: number; conversions: number }>;
  wins: string[];
  losses: string[];
  recommendations: string[];
  priorities: string[];
  alertCount: number;
  fatiguedCreatives: number;
  source: 'llm' | 'deterministic';
  generatedAt: string;
}

interface WeeklyReportRow {
  id: string;
  weekStart: Date;
  createdAt: Date;
  content: ReportContent;
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function weekLabel(weekStart: Date | string): string {
  const d = new Date(weekStart);
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
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

export default function ReportsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const list = trpc.reports.weekly.list.useQuery();
  const generate = trpc.reports.weekly.generate.useMutation({
    onSuccess: (result) => {
      setSelectedId(result.report.id);
      void utils.reports.weekly.invalidate();
    },
  });

  const rows = (list.data ?? []) as WeeklyReportRow[];

  // Default to the newest report once the list lands.
  useEffect(() => {
    const first = rows[0];
    if (!selectedId && first) setSelectedId(first.id);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null;
  const content = selected?.content;

  const stats = content
    ? [
        { label: 'Spend', value: usd(content.totals.spendCents), icon: DollarSign },
        { label: 'Impressions', value: content.totals.impressions.toLocaleString(), icon: Eye },
        { label: 'Clicks', value: content.totals.clicks.toLocaleString(), icon: MousePointerClick },
        { label: 'Conversions', value: String(content.totals.conversions), icon: Target },
      ]
    : [];

  return (
    <PageShell className="space-y-6" data-testid="reports">
      <PageHeader
        eyebrow="Insights"
        title="Weekly Reports"
        description="Your week in review — wins, losses, and what to do next. Generated from your live campaign, alert, and creative-health data, then narrated by AI."
        actions={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending} data-testid="generate-report">
            {generate.isPending ? <RefreshCw className="animate-spin" /> : <Sparkles />}
            {generate.isPending ? 'Generating…' : 'Generate this week'}
          </Button>
        }
      />

      {list.isLoading ? (
        <div className="glass-panel flex items-center justify-center gap-3 p-12 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading reports…
        </div>
      ) : rows.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-3 p-16 text-center">
          <Inbox className="h-10 w-10 text-primary" />
          <p className="font-display text-lg font-semibold">No reports yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Generate your first weekly report to see a plain-language breakdown of spend, performance, and the moves
            worth making next week.
          </p>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? <RefreshCw className="animate-spin" /> : <Sparkles />}
            {generate.isPending ? 'Generating…' : 'Generate this week'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* History */}
          <div className="space-y-2">
            <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Report history
            </p>
            {rows.map((r) => {
              const active = selected?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    'glass-panel flex w-full items-center gap-3 p-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                    active && 'border-primary/30 bg-primary/10',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      active ? 'bg-primary/15 text-primary' : 'bg-[color:var(--glass-bg-subtle)] text-muted-foreground',
                    )}
                  >
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{weekLabel(r.weekStart)}</span>
                    <span className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            r.content.source === 'llm' ? 'bg-primary' : 'bg-muted-foreground/50',
                          )}
                        />
                        {r.content.source === 'llm' ? 'AI narrated' : 'Deterministic'}
                      </span>
                      <span>·</span>
                      <span>{timeAgo(r.createdAt)}</span>
                    </span>
                  </span>
                  {r.content.alertCount > 0 && (
                    <Badge variant={r.content.alertCount > 0 ? 'warning' : 'secondary'}>{r.content.alertCount}</Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Detail */}
          {selected && content && (
            <div className="space-y-4">
              <div className="glass-panel space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    <h2 className="font-display text-lg font-semibold tracking-tight">{weekLabel(selected.weekStart)}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={content.source === 'llm' ? 'default' : 'secondary'}>
                      <Sparkles className="mr-1 h-3 w-3" />
                      {content.source === 'llm' ? 'AI narrated' : 'Deterministic'}
                    </Badge>
                    <Badge variant="outline">{content.periodLabel}</Badge>
                    <span className="text-xs text-muted-foreground">generated {timeAgo(content.generatedAt)}</span>
                  </div>
                </div>

                {/* Totals */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {stats.map(({ label, value, icon: Icon }) => (
                    <div key={label} className="rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <p className="mt-1 font-display text-xl font-semibold tabular-nums tracking-tight">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Health chips */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant={content.alertCount > 0 ? 'warning' : 'success'}>
                    <Bell className="mr-1 h-3 w-3" /> {content.alertCount} alert{content.alertCount === 1 ? '' : 's'}
                  </Badge>
                  <Badge variant={content.fatiguedCreatives > 0 ? 'warning' : 'success'}>
                    <Gauge className="mr-1 h-3 w-3" /> {content.fatiguedCreatives} fatigued creative
                    {content.fatiguedCreatives === 1 ? '' : 's'}
                  </Badge>
                </div>
              </div>

              {/* Narrated brief */}
              <div className="glass-panel p-6" data-testid="report-markdown">
                <Markdown content={content.markdown} />
              </div>
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
