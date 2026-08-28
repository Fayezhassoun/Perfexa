'use client';

import Link from 'next/link';
import { ArrowRight, Check, ListChecks } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ChecklistStep = {
  label: string;
  detail: string;
  href: string;
  action: string;
  complete: boolean;
};

export function CustomerReadinessChecklist() {
  const integrations = trpc.settings.integrations.useQuery();
  const overview = trpc.dashboard.overview.useQuery();
  const reports = trpc.reports.weekly.list.useQuery();

  const rows = integrations.data ?? [];
  const connected = rows.some((row) => row.connected);
  const liveConnected = rows.some(
    (row) => row.connected && row.status === 'connected' && row.mode === 'live',
  );
  const liveData = overview.data?.dataSource === 'live';
  const liveReport = (reports.data ?? []).some(
    (report) => (report.content as { dataSource?: string } | null)?.dataSource === 'live',
  );

  const steps: ChecklistStep[] = [
    {
      label: 'Business context',
      detail: 'Your onboarding details are saved.',
      href: '/business-brain',
      action: 'Review context',
      complete: true,
    },
    {
      label: 'Read-only account',
      detail: connected ? 'An account is connected.' : 'Connect an account to start the supported workflow.',
      href: '/settings',
      action: connected ? 'Review connection' : 'Connect account',
      complete: connected,
    },
    {
      label: 'Live data sync',
      detail: liveData
        ? 'Live campaign data is in the dashboard.'
        : liveConnected
          ? 'Switch to Settings and sync the live account.'
          : 'Switch a connected account to live, then sync it.',
      href: '/settings',
      action: liveData ? 'Review sync' : 'Open connections',
      complete: liveData,
    },
    {
      label: 'Weekly report',
      detail: liveReport ? 'A report is ready to review or share.' : 'Generate a report after live data arrives.',
      href: '/reports',
      action: liveReport ? 'Open report' : 'Open reports',
      complete: liveReport,
    },
  ];

  return (
    <Card data-testid="customer-readiness-checklist">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
          First-customer checklist
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Complete this path before sharing performance with a design partner. Sandbox output is for testing only.
        </p>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => (
          <div key={step.label} className="glass-tile flex items-start gap-3 p-3">
            <span
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                step.complete
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : 'border-[color:var(--glass-border)] text-muted-foreground',
              )}
            >
              {step.complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{step.label}</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              <Link href={step.href} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                {step.action}
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
