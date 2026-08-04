'use client';

// Site health (Visibility Phase 2 Feature 1): technical SEO audit results.
// Every score and issue traces to a stored seo_findings row — when PageSpeed
// couldn't run, the card says "pending — needs API key" instead of a number.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  CircleAlert,
  ExternalLink,
  Gauge,
  Hourglass,
  Loader2,
  ScanSearch,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MetricCard } from '@/components/page-shell';
import { cn } from '@/lib/utils';
import { geoFetch, hostnameOf } from './visibility-fetch';

type Severity = 'pass' | 'info' | 'warn' | 'fail';

interface SeoFindingView {
  id: string;
  category: 'cwv' | 'robots' | 'sitemap' | 'links' | 'images' | 'meta';
  severity: Severity;
  code: string;
  message: string;
  detail: Record<string, unknown> | null;
  hint: string | null;
}

interface SeoAuditSummary {
  audit: {
    id: string;
    siteUrl: string;
    status: 'pending' | 'running' | 'done' | 'failed';
    truncated: boolean;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  };
  counts: Record<Severity, number>;
  scores: {
    performance: number | null;
    seo: number | null;
    psiPending: boolean;
    psiError: string | null;
  };
  cwv: { lcpMs: number | null; cls: number | null; tbtMs: number | null };
  findings: SeoFindingView[];
}

interface LatestPayload {
  summary: SeoAuditSummary | null;
  psiConfigured: boolean;
}

const CATEGORY_LABELS: Record<SeoFindingView['category'], string> = {
  cwv: 'Core Web Vitals',
  robots: 'robots.txt',
  sitemap: 'Sitemap',
  links: 'Links & availability',
  images: 'Images',
  meta: 'On-page meta',
};
const CATEGORY_ORDER: SeoFindingView['category'][] = ['cwv', 'meta', 'links', 'images', 'robots', 'sitemap'];

const SEVERITY_META: Record<Severity, { label: string; badge: 'success' | 'secondary' | 'warning' | 'destructive'; Icon: typeof CheckCircle }> = {
  pass: { label: 'pass', badge: 'success', Icon: CheckCircle },
  info: { label: 'info', badge: 'secondary', Icon: CircleAlert },
  warn: { label: 'warn', badge: 'warning', Icon: AlertTriangle },
  fail: { label: 'fail', badge: 'destructive', Icon: AlertTriangle },
};

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function SiteHealthSection() {
  const [payload, setPayload] = useState<LatestPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    const res = await geoFetch<LatestPayload>('/api/seo/latest');
    setPayload(res);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the audit'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const runAudit = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await geoFetch('/api/seo/audit', { method: 'POST' });
      setNotice('Audit complete — findings below are from your live site.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const summary = payload?.summary ?? null;

  const grouped = useMemo(() => {
    const map = new Map<SeoFindingView['category'], SeoFindingView[]>();
    for (const finding of summary?.findings ?? []) {
      const slot = map.get(finding.category) ?? [];
      slot.push(finding);
      map.set(finding.category, slot);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, findings: map.get(c)! }));
  }, [summary]);

  const issueCount = (summary?.counts.warn ?? 0) + (summary?.counts.fail ?? 0);
  const visibleGroups = showAll ? grouped : grouped.slice(0, 3);

  return (
    <Card data-testid="site-health">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-4 w-4 text-primary" /> Site health
          </CardTitle>
          <div className="flex items-center gap-2">
            {summary && (
              <span className="text-xs text-muted-foreground">
                Last audit {new Date(summary.audit.createdAt).toLocaleString()} · {hostnameOf(summary.audit.siteUrl)}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={runAudit} disabled={busy} data-testid="run-audit">
              {busy ? <Loader2 className="animate-spin" /> : <Activity />}
              {busy ? 'Auditing site…' : summary ? 'Re-run audit' : 'Run site audit'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || notice) && (
          <div
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm',
              error
                ? 'border-red-500/30 text-red-600 dark:text-red-400'
                : 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
            )}
            role="status"
          >
            <span>{error ?? notice}</span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running real checks against your site (PageSpeed, robots.txt, sitemap, up to 50 pages)… this can take a few minutes.
          </p>
        )}

        {!loading && !summary && !busy && (
          <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="site-health-empty">
            <div className="glass-chip flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
              <Gauge className="h-6 w-6" />
            </div>
            <p className="font-medium">No site audit yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Run a technical audit — Core Web Vitals from Google PageSpeed plus robots.txt, sitemap and
              on-page checks. Every result is a real measurement of your live site; nothing is simulated.
            </p>
          </div>
        )}

        {summary && (
          <>
            {summary.audit.status === 'failed' && (
              <p className="rounded-xl border border-red-500/30 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                This audit run failed: {summary.audit.error ?? 'unknown error'}
              </p>
            )}
            {summary.audit.truncated && (
              <p className="rounded-xl border border-amber-500/30 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
                The audit hit its 5-minute cap — the findings below are real but partial.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="site-health-kpis">
              {summary.scores.psiPending || summary.scores.performance === null ? (
                <div className="glass-panel metric-card p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Performance
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold">
                    <Hourglass className="h-4 w-4 text-muted-foreground" /> Pending
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {summary.scores.psiError ?? 'Needs a PageSpeed API key (PAGESPEED_API_KEY) to measure.'}
                  </p>
                </div>
              ) : (
                <MetricCard
                  label="Performance"
                  value={`${summary.scores.performance}`}
                  detail={`PageSpeed mobile score (${summary.cwv.lcpMs !== null ? `LCP ${formatMs(summary.cwv.lcpMs)}` : 'LCP —'})`}
                />
              )}
              {summary.scores.seo === null ? (
                <div className="glass-panel metric-card p-4">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    PageSpeed SEO
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-display text-lg font-semibold">
                    <Hourglass className="h-4 w-4 text-muted-foreground" /> Pending
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Measured when PageSpeed runs.</p>
                </div>
              ) : (
                <MetricCard label="PageSpeed SEO" value={`${summary.scores.seo}`} detail="Crawlability basics" />
              )}
              <MetricCard
                label="Issues"
                value={String(issueCount)}
                detail={`${summary.counts.fail} fail · ${summary.counts.warn} warn`}
              />
              <MetricCard
                label="Checks passed"
                value={String(summary.counts.pass)}
                detail={`${summary.counts.info} informational`}
              />
            </div>

            {grouped.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings were recorded for this run.</p>
            ) : (
              <div className="space-y-4" data-testid="audit-findings">
                {visibleGroups.map(({ category, findings }) => (
                  <div key={category}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <ul className="space-y-1.5">
                      {findings.map((finding) => {
                        const meta = SEVERITY_META[finding.severity];
                        const detailUrl =
                          typeof finding.detail?.url === 'string' ? finding.detail.url : null;
                        return (
                          <li key={finding.id} className="glass-tile flex items-start gap-2.5 p-2.5">
                            <meta.Icon
                              className={cn(
                                'mt-0.5 h-4 w-4 shrink-0',
                                finding.severity === 'pass'
                                  ? 'text-emerald-500'
                                  : finding.severity === 'warn'
                                    ? 'text-amber-500'
                                    : finding.severity === 'fail'
                                      ? 'text-red-500'
                                      : 'text-muted-foreground',
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={meta.badge}>{meta.label}</Badge>
                                <span className="truncate text-sm">{finding.message}</span>
                                {detailUrl && (
                                  <a
                                    href={detailUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                                  >
                                    open <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              {finding.hint && finding.severity !== 'pass' && (
                                <p className="mt-1 text-xs text-muted-foreground">{finding.hint}</p>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {grouped.length > 3 && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? 'Show less' : `Show all ${grouped.length} categories`}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
