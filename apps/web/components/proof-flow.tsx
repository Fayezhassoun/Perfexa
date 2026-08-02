'use client';

// Demo proof flow: a guided "proof moment" that walks a first-time user through
// a real anomaly detection result in four animated steps — scan → anomaly →
// recommended action → projected impact. All data comes from live tRPC queries
// (campaigns.list, alerts.list); nothing is hardcoded. Dismissal persists to
// org settings via settings.preferences.update so it never shows again.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  ScanSearch,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_BADGE: Record<string, 'destructive' | 'warning' | 'secondary'> = {
  critical: 'destructive',
  warning: 'warning',
  info: 'secondary',
};

const STEP_LABELS = ['Scan', 'Anomaly', 'Action', 'Impact'];
const ADVANCE_MS = 2500;
const REVEAL_MS = 500;
const COMPLETE_STEP = 4;

interface FeaturedAlert {
  type: string;
  severity: string;
  title: string;
  message: string;
  platform?: string | null;
  suggestedAction?: string | null;
  metrics?: Record<string, unknown> | null;
}

interface Impact {
  metric: string;
  beforeLabel: string;
  beforeValue: string;
  beforePct: number;
  afterLabel: string;
  afterValue: string;
  afterPct: number;
  caption: string;
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function pickFeatured(rows: FeaturedAlert[]): FeaturedAlert | undefined {
  return [...rows].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  )[0];
}

// Before/after projection derived from the alert's real metrics. Target
// reference values (2% CTR, $10 CPC) mirror the thresholds the detector itself
// reports in its messages — the plotted numbers are the live metric values.
function projectedImpact(alert: FeaturedAlert): Impact | null {
  const m = (alert.metrics ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const clamp = (p: number) => Math.max(6, Math.min(100, Math.round(p)));

  switch (alert.type) {
    case 'zero_conversions': {
      const spend = n(m.spendCents);
      return {
        metric: 'Wasted spend',
        beforeLabel: 'Burning now',
        beforeValue: money(spend),
        beforePct: 100,
        afterLabel: 'After pause',
        afterValue: '$0',
        afterPct: 6,
        caption: 'Pausing this campaign frees the budget for your top performers.',
      };
    }
    case 'ctr_drop': {
      const ctr = n(m.ctr);
      const target = 0.02;
      const scale = Math.max(ctr, target, 0.03);
      return {
        metric: 'Click-through rate',
        beforeLabel: 'Now',
        beforeValue: `${(ctr * 100).toFixed(2)}%`,
        beforePct: clamp((ctr / scale) * 100),
        afterLabel: 'Target',
        afterValue: `${(target * 100).toFixed(1)}%`,
        afterPct: clamp((target / scale) * 100),
        caption: 'Fresh creative and tighter targeting lift CTR toward the 1–3% industry band.',
      };
    }
    case 'cpc_spike': {
      const cpc = n(m.cpcCents);
      const target = 1000;
      return {
        metric: 'Cost per click',
        beforeLabel: 'Now',
        beforeValue: money(cpc),
        beforePct: 100,
        afterLabel: 'Target',
        afterValue: money(target),
        afterPct: clamp((target / Math.max(cpc, target)) * 100),
        caption: 'Better ad relevance and quality score bring CPC back under $10.',
      };
    }
    case 'spend_velocity': {
      const projected = n(m.projectedDailySpend);
      const budget = n(m.dailyBudget);
      const scale = Math.max(projected, budget, 1);
      return {
        metric: 'Projected daily spend',
        beforeLabel: 'On track for',
        beforeValue: money(projected),
        beforePct: clamp((projected / scale) * 100),
        afterLabel: 'Daily budget',
        afterValue: money(budget),
        afterPct: clamp((budget / scale) * 100),
        caption: 'Bid caps and scheduling spread spend evenly across the day.',
      };
    }
    case 'budget_cap_near': {
      const total = n(m.totalSpend);
      const cap = n(m.monthlyCap);
      const scale = Math.max(cap, total, 1);
      return {
        metric: 'Monthly budget use',
        beforeLabel: 'Spent',
        beforeValue: money(total),
        beforePct: clamp((total / scale) * 100),
        afterLabel: 'Cap',
        afterValue: money(cap),
        afterPct: clamp((cap / scale) * 100),
        caption: 'Reallocating to top performers keeps you under the cap without auto-pause.',
      };
    }
    default:
      return null;
  }
}

function ImpactBar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: 'before' | 'after' }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-display font-semibold tabular-nums">{value}</span>
      </div>
      <div className="glass-track h-3 w-full overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            tone === 'before' ? 'bg-red-500/80' : 'bg-emerald-500/80',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface ProofFlowHandle {
  open: () => void;
}

export const ProofFlow = forwardRef<ProofFlowHandle>(function ProofFlow(_props, ref) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [visibleCount, setVisibleCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const triggeredDetection = useRef(false);
  const autoOpened = useRef(false);
  const ahaFired = useRef(false);
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const prefs = trpc.settings.preferences.get.useQuery();
  const campaigns = trpc.campaigns.list.useQuery();
  const alertsQuery = trpc.alerts.list.useQuery({ limit: 100 });
  const runDetection = trpc.alerts.runDetection.useMutation({
    onSuccess: () => utils.alerts.invalidate(),
  });
  const updatePrefs = trpc.settings.preferences.update.useMutation({
    onSuccess: () => utils.settings.preferences.get.invalidate(),
  });

  const campaignRows = campaigns.data ?? [];
  const featured = pickFeatured((alertsQuery.data ?? []) as FeaturedAlert[]);
  const impact = featured ? projectedImpact(featured) : null;

  const dismiss = useCallback(() => {
    setDismissed(true);
    setOpen(false);
    updatePrefs.mutate({ proofDismissed: true });
  }, [updatePrefs]);

  const openFlow = useCallback(() => {
    setStep(0);
    setVisibleCount(0);
    setOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ open: openFlow }), [openFlow]);

  // Auto-open on first arrival: fresh org (proofDismissed=false) with campaign
  // data sees the walkthrough within ~1s of landing on the dashboard.
  useEffect(() => {
    if (autoOpened.current || !prefs.data || prefs.data.proofDismissed || dismissed) return;
    if (campaignRows.length === 0) return;
    autoOpened.current = true;
    const id = setTimeout(openFlow, 800);
    return () => clearTimeout(id);
  }, [prefs.data, dismissed, campaignRows.length, openFlow]);

  // First-win: stamp firstAhaAt when the user reaches the completion screen.
  useEffect(() => {
    if (step !== COMPLETE_STEP || ahaFired.current) return;
    if (prefs.data?.firstAhaAt) return;
    ahaFired.current = true;
    updatePrefs.mutate({ firstAhaAt: new Date().toISOString() });
  }, [step, prefs.data, updatePrefs]);

  // Auto-advance every 2.5s until the completion screen.
  useEffect(() => {
    if (!open || step >= COMPLETE_STEP) return;
    const id = setTimeout(() => setStep((s) => s + 1), ADVANCE_MS);
    return () => clearTimeout(id);
  }, [open, step]);

  // Step 0: reveal campaign names one by one (500ms each).
  useEffect(() => {
    if (!open || step !== 0) return;
    if (reducedMotion || campaignRows.length === 0) {
      setVisibleCount(campaignRows.length);
      return;
    }
    setVisibleCount(1);
    const id = setInterval(() => {
      setVisibleCount((c) => {
        if (c >= campaignRows.length) {
          clearInterval(id);
          return c;
        }
        return c + 1;
      });
    }, REVEAL_MS);
    return () => clearInterval(id);
  }, [open, step, campaignRows.length, reducedMotion]);

  // If the org has no alerts yet, run the real detector once to produce them.
  useEffect(() => {
    if (open && alertsQuery.data && alertsQuery.data.length === 0 && !triggeredDetection.current) {
      triggeredDetection.current = true;
      runDetection.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, alertsQuery.data]);

  // Escape to dismiss + lock body scroll while the sheet is open (mobile).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, dismiss]);

  // Banner only shows for orgs that haven't dismissed; the sheet can still be
  // opened imperatively (e.g. "Show me a demo") regardless of dismissal state.
  const showBanner = Boolean(prefs.data) && !dismissed && !prefs.data?.proofDismissed;

  const next = () => setStep((s) => Math.min(s + 1, COMPLETE_STEP));

  return (
    <>
      {/* Proof banner — the entry point on the dashboard */}
      {showBanner && (
        <Card className="border-primary/25 bg-primary/[0.05]" data-testid="proof-banner">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="glass-chip animate-pulse-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">See what GrowthCrew just found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  A 30-second walkthrough of a real anomaly we detected in your campaigns — and the
                  action we recommend.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button onClick={openFlow} data-testid="proof-open">
                See GrowthCrew in action <ArrowRight />
              </Button>
              <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss proof walkthrough">
                <X />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full-screen proof sheet */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="GrowthCrew proof walkthrough">
          <div className="animate-fade-in absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={dismiss} />
          <div className="relative flex h-full w-full sm:items-center sm:justify-center sm:p-6">
            <div className="glass-strong animate-fade-up relative flex h-full w-full flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[88vh] sm:max-w-xl sm:rounded-3xl">
              {/* Header */}
              <div className="glass-divider-b flex items-center justify-between px-5 py-4 sm:px-7">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                    {step < COMPLETE_STEP ? `Proof · ${STEP_LABELS[step]}` : 'Proof · Complete'}
                  </span>
                </div>
                <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Close walkthrough">
                  <X />
                </Button>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5 px-5 pt-4 sm:px-7" aria-hidden="true">
                {STEP_LABELS.map((label, i) => (
                  <div
                    key={label}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-colors duration-300',
                      i <= Math.min(step, COMPLETE_STEP - 1) ? 'bg-primary' : 'bg-foreground/10',
                    )}
                  />
                ))}
              </div>

              {/* Step body */}
              <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
                {step === 0 && (
                  <div key="step-0" className="animate-fade-up space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <ScanSearch className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="font-display text-xl font-semibold sm:text-2xl">Scanning your campaigns…</h2>
                        <p className="text-sm text-muted-foreground">Checking spend, CTR, CPC, and conversion signals.</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {campaignRows.length === 0 && (
                        <p className="text-sm text-muted-foreground">Loading your campaigns…</p>
                      )}
                      {campaignRows.slice(0, visibleCount).map((c) => (
                        <div key={c.id} className="glass-tile animate-fade-up flex items-center justify-between gap-3 rounded-xl p-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{c.name ?? 'Unnamed campaign'}</p>
                            <p className="text-xs text-muted-foreground">
                              {PLATFORM_LABELS[c.platform ?? ''] ?? c.platform ?? '—'}
                            </p>
                          </div>
                          <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>{c.status ?? '—'}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div key="step-1" className="animate-fade-up space-y-4">
                    {featured ? (
                      <>
                        <div className="flex items-center gap-3">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/15 text-red-500">
                            <AlertTriangle className="h-5 w-5" />
                          </span>
                          <div>
                            <h2 className="font-display text-xl font-semibold sm:text-2xl">Anomaly detected</h2>
                            <p className="text-sm text-muted-foreground">Flagged automatically by the monitoring engine.</p>
                          </div>
                        </div>
                        <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 sm:p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={SEVERITY_BADGE[featured.severity] ?? 'secondary'}>
                              {featured.severity}
                            </Badge>
                            {featured.platform && (
                              <Badge variant="outline">{PLATFORM_LABELS[featured.platform] ?? featured.platform}</Badge>
                            )}
                          </div>
                          <p className="font-display mt-3 text-lg font-semibold leading-snug">{featured.title}</p>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{featured.message}</p>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-3 text-center">
                        <ScanSearch className="h-8 w-8 animate-pulse text-primary" />
                        <p className="text-sm text-muted-foreground">Analyzing live signals…</p>
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div key="step-2" className="animate-fade-up space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
                        <Lightbulb className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="font-display text-xl font-semibold sm:text-2xl">Recommended action</h2>
                        <p className="text-sm text-muted-foreground">What GrowthCrew suggests — you stay in control.</p>
                      </div>
                    </div>
                    {featured ? (
                      <div className="glass-tile rounded-2xl p-4 sm:p-5">
                        {featured.title && (
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {featured.title}
                          </p>
                        )}
                        <p className="mt-2 text-base leading-relaxed sm:text-lg">
                          {featured.suggestedAction ?? 'Review this campaign and approve the recommended fix.'}
                        </p>
                        <p className="mt-4 text-xs text-muted-foreground">
                          Nothing runs without your explicit approval — every action is audit-logged.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Preparing the recommendation…</p>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div key="step-3" className="animate-fade-up space-y-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                        <TrendingUp className="h-5 w-5" />
                      </span>
                      <div>
                        <h2 className="font-display text-xl font-semibold sm:text-2xl">Projected impact</h2>
                        <p className="text-sm text-muted-foreground">Before vs. after acting on the signal.</p>
                      </div>
                    </div>
                    {impact ? (
                      <div className="glass-tile space-y-5 rounded-2xl p-4 sm:p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {impact.metric}
                        </p>
                        <ImpactBar label={impact.beforeLabel} value={impact.beforeValue} pct={impact.beforePct} tone="before" />
                        <ImpactBar label={impact.afterLabel} value={impact.afterValue} pct={impact.afterPct} tone="after" />
                        <p className="text-sm leading-relaxed text-muted-foreground">{impact.caption}</p>
                      </div>
                    ) : (
                      <div className="glass-tile rounded-2xl p-4 sm:p-5">
                        <p className="text-base leading-relaxed">
                          {featured?.suggestedAction ?? 'Acting on this signal protects your budget and improves results.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {step === COMPLETE_STEP && (
                  <div key="step-complete" className="animate-fade-up flex h-full flex-col items-center justify-center gap-4 py-6 text-center">
                    <span className="animate-pulse-glow flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
                      <CheckCircle2 className="h-8 w-8" />
                    </span>
                    <div className="space-y-2">
                      <h2 className="font-display text-2xl font-semibold sm:text-3xl">
                        This runs 24/7 for every campaign.
                      </h2>
                      <p className="mx-auto max-w-md text-base text-muted-foreground">
                        Welcome to your AI marketing team. GrowthCrew watches your spend around the
                        clock and brings you approved-ready actions — never a surprise charge.
                      </p>
                    </div>
                    <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                      <Button asChild size="lg" onClick={dismiss}>
                        <Link href="/console">
                          Open the Console <ArrowRight />
                        </Link>
                      </Button>
                      <Button variant="outline" size="lg" onClick={dismiss}>
                        Explore the dashboard
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer controls (hidden on the completion screen) */}
              {step < COMPLETE_STEP && (
                <div className="glass-divider-t flex items-center justify-between gap-3 px-5 py-4 sm:px-7">
                  <Button variant="ghost" onClick={dismiss}>
                    Skip
                  </Button>
                  <Button onClick={next} data-testid="proof-next">
                    {step === COMPLETE_STEP - 1 ? 'See the impact' : 'Next'} <ArrowRight />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});
