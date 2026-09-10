'use client';

import Link from 'next/link';
import { ArrowRight, Check, RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { setupProgress } from '@/lib/setup-progress';
import type { BriefSource } from '@/lib/weekly-brief';

export function CustomerReadinessChecklist() {
  const integrations = trpc.settings.integrations.useQuery();
  const overview = trpc.dashboard.overview.useQuery();
  const reports = trpc.reports.weekly.list.useQuery();
  const loading = integrations.isLoading || overview.isLoading || reports.isLoading;
  const error = integrations.isError || overview.isError || reports.isError;
  if (loading) return <p className="brief-muted py-4" role="status">Checking your setup…</p>;
  if (error) return <div className="brief-error my-4" role="alert"><span>Your setup progress couldn’t be loaded.</span><button type="button" onClick={() => { void integrations.refetch(); void overview.refetch(); void reports.refetch(); }}><RefreshCw size={14} /> Try again</button></div>;

  const latest = reports.data?.[0]?.content;
  const steps = setupProgress({
    connections: integrations.data ?? [],
    source: overview.data?.demoData ? 'demo' : overview.data?.dataSource ?? 'none',
    reportSource: latest?.dataSource as BriefSource | undefined,
    reportDemo: latest?.demoData,
  });
  const completed = steps.filter(step => step.complete).length;
  // Completed workspaces keep their main briefing uncluttered.
  if (completed === steps.length) return null;
  const next = steps.find(step => !step.complete)!;
  return (
    <section className="setup-guide" aria-labelledby="setup-guide-heading" data-testid="customer-readiness-checklist">
      <div className="setup-guide-heading"><div><p className="brief-eyebrow">Your first performance report</p><h2 id="setup-guide-heading">A clear path from account to insight.</h2></div><span>{completed} of {steps.length} steps complete</span></div>
      <ol className="setup-guide-steps">
        {steps.map((step, index) => <li key={step.label} aria-current={step === next ? 'step' : undefined}>
          <span className={step.complete ? 'setup-step-number is-complete' : 'setup-step-number'}>{step.complete ? <Check size={15} aria-label="Complete" /> : index + 1}</span>
          <div><strong>{step.label}</strong><p>{step.detail}</p></div>
        </li>)}
      </ol>
      <Link className="setup-guide-action" href={next.href}>{next.action}<ArrowRight size={16} /></Link>
    </section>
  );
}
