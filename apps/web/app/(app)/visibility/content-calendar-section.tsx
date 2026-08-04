'use client';

// 30/60/90 content calendar (Visibility Phase 2 Feature 3). Plans close GEO
// visibility gaps: one DeepSeek brief per tracked prompt the brand is absent
// from, scheduled over 30/60/90 days. Empty states are honest — "nothing to
// close" only when the latest scan really cited the brand everywhere.

import { useCallback, useEffect, useState } from 'react';
import {
  BadgeCheck,
  CalendarDays,
  Check,
  FileText,
  Lightbulb,
  Loader2,
  Megaphone,
  Radar,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { geoFetch } from './visibility-fetch';

type PlanStatus = 'idea' | 'approved' | 'drafted' | 'published';

interface PlanView {
  id: string;
  horizon: 30 | 60 | 90;
  promptId: string | null;
  promptText: string | null;
  title: string;
  brief: { title: string; outline: string[]; target_queries: string[] } | null;
  status: PlanStatus;
  dueDate: string | null;
}

const HORIZONS = [30, 60, 90] as const;

const STATUS_BADGE: Record<PlanStatus, { label: string; variant: 'secondary' | 'default' | 'warning' | 'success' }> = {
  idea: { label: 'idea', variant: 'secondary' },
  approved: { label: 'approved', variant: 'default' },
  drafted: { label: 'drafted', variant: 'warning' },
  published: { label: 'published', variant: 'success' },
};

const NEXT_STEP: Record<Exclude<PlanStatus, 'published'>, { next: PlanStatus; label: string; Icon: typeof Check }> = {
  idea: { next: 'approved', label: 'Approve', Icon: BadgeCheck },
  approved: { next: 'drafted', label: 'Mark drafted', Icon: FileText },
  drafted: { next: 'published', label: 'Mark published', Icon: Megaphone },
};

export function ContentCalendarSection({
  runExists,
  gapCount,
}: {
  /** Whether a GEO run exists at all (controls which empty state shows). */
  runExists: boolean;
  /** Gap prompts in the latest run (brand not mentioned anywhere). */
  gapCount: number;
}) {
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [advancing, setAdvancing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await geoFetch<{ plans: PlanView[] }>('/api/geo/plans');
    setPlans(res.plans);
  }, []);

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load the calendar'))
      .finally(() => setLoading(false));
  }, [refresh]);

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await geoFetch<{ gaps: number; created: PlanView[]; skippedExisting: number }>(
        '/api/geo/plans/generate',
        { method: 'POST' },
      );
      if (res.created.length === 0 && res.skippedExisting > 0) {
        setNotice('Calendar is already up to date — every gap has a plan.');
      } else if (res.created.length === 0) {
        setNotice('No new gaps — your brand was cited everywhere in the latest scan.');
      } else {
        setNotice(`${res.created.length} plan(s) drafted from ${res.gaps} visibility gap(s).`);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed');
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const advance = useCallback(
    async (plan: PlanView) => {
      if (plan.status === 'published') return;
      const step = NEXT_STEP[plan.status];
      setAdvancing(plan.id);
      setError(null);
      try {
        await geoFetch(`/api/geo/plans/${plan.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: step.next }),
        });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update the plan');
      } finally {
        setAdvancing(null);
      }
    },
    [refresh],
  );

  const byHorizon = new Map<number, PlanView[]>();
  for (const horizon of HORIZONS) byHorizon.set(horizon, []);
  for (const plan of plans) byHorizon.get(plan.horizon)?.push(plan);

  return (
    <Card data-testid="content-calendar">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-primary" /> Content calendar — 30/60/90
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              One content brief per visibility gap, scheduled over the next 90 days.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={generate} disabled={busy || !runExists} data-testid="generate-plans">
            {busy ? <Loader2 className="animate-spin" /> : <Lightbulb />}
            {busy ? 'Drafting briefs…' : 'Generate from gaps'}
          </Button>
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

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center" data-testid="calendar-empty">
            <div className="glass-chip flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
              <Radar className="h-6 w-6" />
            </div>
            {!runExists ? (
              <>
                <p className="font-medium">No scan data yet</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Run an AI-visibility scan first — the calendar is built from the gaps it finds.
                </p>
              </>
            ) : gapCount === 0 ? (
              <>
                <p className="font-medium">You&rsquo;re cited everywhere you asked</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  The latest scan mentioned your brand in every tracked answer — nothing to close right
                  now. Re-generate after the next scan.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  {gapCount} visibility {gapCount === 1 ? 'gap' : 'gaps'} without a plan
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Generate briefs for the questions where competitors get cited instead of you, spread
                  over 30/60/90 days.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3" data-testid="calendar-columns">
            {HORIZONS.map((horizon) => {
              const column = byHorizon.get(horizon) ?? [];
              return (
                <div key={horizon} className="glass-tile rounded-2xl p-3" data-testid={`calendar-col-${horizon}`}>
                  <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>{horizon} days</span>
                    <Badge variant="secondary">{column.length}</Badge>
                  </p>
                  <div className="space-y-2">
                    {column.length === 0 && (
                      <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                        No plans in this window.
                      </p>
                    )}
                    {column.map((plan) => {
                      const badge = STATUS_BADGE[plan.status];
                      const step = plan.status === 'published' ? null : NEXT_STEP[plan.status];
                      return (
                        <div key={plan.id} className="glass-panel space-y-2 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{plan.title}</p>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                          {plan.promptText && (
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              Closes gap: &ldquo;{plan.promptText}&rdquo;
                            </p>
                          )}
                          {plan.dueDate && (
                            <p className="text-xs text-muted-foreground">
                              Due {new Date(plan.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </p>
                          )}
                          {step && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => advance(plan)}
                              disabled={advancing === plan.id}
                            >
                              {advancing === plan.id ? <Loader2 className="animate-spin" /> : <step.Icon className="h-3.5 w-3.5" />}
                              {step.label}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
