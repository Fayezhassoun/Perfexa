'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  FileText,
  Globe2,
  LockKeyhole,
  Megaphone,
  Mic,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageShell } from '@/components/page-shell';
import { readBusinessBrain } from '@/lib/business-brain';

const GOAL_LABELS: Record<string, string> = {
  visibility: 'Be more visible',
  leads: 'Get leads',
  sales: 'Drive sales',
};

const PLAN = [
  {
    day: '01',
    title: 'Business and website baseline',
    objective: 'Get a shared starting point for what is working, what is missing, and what matters this week.',
    owner: 'Orchestrator',
    output: 'Baseline brief with business context, website signals, and the first opportunities to review.',
    icon: Globe2,
    state: 'Ready to draft',
    approval: null,
  },
  {
    day: '02',
    title: 'SEO quick wins',
    objective: 'Prioritize practical visibility improvements that can be reviewed and shipped in small steps.',
    owner: 'SEO specialist',
    output: 'Short SEO action list covering page titles, descriptions, content gaps, and technical follow-ups.',
    icon: SearchCheck,
    state: 'Ready to draft',
    approval: null,
  },
  {
    day: '03',
    title: 'Lead-capture path',
    objective: 'Make it clear how an interested visitor becomes a contact your business can follow up with.',
    owner: 'Lead generation specialist',
    output: 'Lead-capture recommendation with form fields, source tracking, and a follow-up path.',
    icon: UsersRound,
    state: 'Review first',
    approval: null,
  },
  {
    day: '04',
    title: 'First campaign draft',
    objective: 'Turn the strongest opportunity into a focused campaign concept without activating spend.',
    owner: 'Paid media specialist',
    output: 'Sandbox campaign draft with audience, message, budget split, and success criteria.',
    icon: Megaphone,
    state: 'Ready to draft',
    approval: 'Approval required before spend or activation',
  },
  {
    day: '05',
    title: 'Content and social draft',
    objective: 'Create useful, on-brand content that supports the week’s primary goal.',
    owner: 'Content specialist',
    output: 'Content and social draft set with suggested channels, timing, and a review checklist.',
    icon: FileText,
    state: 'Review first',
    approval: 'Approval required before anything is published',
  },
  {
    day: '06',
    title: 'Measurement and audit checkpoint',
    objective: 'Confirm that the plan can be measured and that the next decision will use useful evidence.',
    owner: 'Analytics specialist',
    output: 'Measurement checklist, baseline metrics, and an audit queue for unresolved gaps.',
    icon: BarChart3,
    state: 'Ready to draft',
    approval: null,
  },
  {
    day: '07',
    title: 'Approval review and next-week plan',
    objective: 'Review the work together, approve only what is ready, and choose the next highest-value step.',
    owner: 'Orchestrator + you',
    output: 'Decision-ready proposal with approved, queued, and intentionally deferred actions.',
    icon: ClipboardCheck,
    state: 'You decide',
    approval: 'Approval required for spend and public actions',
  },
] as const;

function formatBudget(cents: number | null | undefined): string {
  if (cents == null) return 'Not set yet';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
}

export default function GrowthPlanPage() {
  const { data: org, isLoading, isError } = trpc.onboarding.get.useQuery();

  if (isLoading) {
    return (
      <PageShell className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your business context…</p>
      </PageShell>
    );
  }

  if (isError || !org) {
    return (
      <PageShell className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Business context unavailable</CardTitle>
            <CardDescription>We couldn&apos;t load the plan right now. Try refreshing the page.</CardDescription>
          </CardHeader>
        </Card>
      </PageShell>
    );
  }

  const goals = (org.goals ?? []).map((goal) => GOAL_LABELS[goal] ?? goal);
  const businessBrain = readBusinessBrain(org.settings);
  const planPersonalization = businessBrain.offer
    ? `This week starts with your offer: ${businessBrain.offer}`
    : businessBrain.idealCustomer
      ? `This week is framed for your ideal customer: ${businessBrain.idealCustomer}`
      : businessBrain.location
        ? `This week is grounded in your service area: ${businessBrain.location}`
        : 'Add your offer, audience, and service area to make this timeline more specific.';
  const brainValue = (value: string | undefined) => value || 'Not set yet';

  return (
    <PageShell className="space-y-6" data-testid="growth-plan">
      <PageHeader
        eyebrow="Your week-one operating system"
        title="First 7-Day Growth Plan"
        description="Perfexa turns business context into a week-one operating plan. Every step stays reviewable, practical, and grounded in what you told us."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/proposals">
                Review proposals <ClipboardCheck />
              </Link>
            </Button>
            <Button asChild>
              <Link href="/console">
                Start in Voice Console <Mic />
              </Link>
            </Button>
          </div>
        }
      />

      <Card className="overflow-hidden border-primary/20" data-testid="business-brain-summary">
        <CardHeader className="border-b border-[color:var(--glass-border)] bg-primary/[0.04] pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">Business Brain</CardTitle>
                <CardDescription className="mt-1">
                  The context Perfexa will use to shape this plan.
                </CardDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Context saved
              </Badge>
              <Button asChild size="sm" variant="outline">
                <Link href="/business-brain">Edit Business Brain</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Business</p>
            <p className="mt-1 truncate font-medium">{org.name}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Website</p>
            {org.websiteUrl ? (
              <a
                className="mt-1 block truncate font-medium text-primary hover:underline"
                href={org.websiteUrl}
                target="_blank"
                rel="noreferrer"
              >
                {org.websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
              </a>
            ) : (
              <p className="mt-1 font-medium text-muted-foreground">Not added yet</p>
            )}
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Goals</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {goals.length ? (
                goals.map((goal) => <Badge key={goal} variant="outline">{goal}</Badge>)
              ) : (
                <span className="font-medium text-muted-foreground">Not set yet</span>
              )}
            </div>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly ceiling</p>
            <p className="mt-1 font-medium">{formatBudget(org.monthlyBudgetCeilingCents)}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Main offer</p>
            <p className="mt-1 line-clamp-3 font-medium">{brainValue(businessBrain.offer)}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ideal customer</p>
            <p className="mt-1 line-clamp-3 font-medium">{brainValue(businessBrain.idealCustomer)}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Location</p>
            <p className="mt-1 line-clamp-3 font-medium">{brainValue(businessBrain.location)}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Tone</p>
            <p className="mt-1 capitalize font-medium">{brainValue(businessBrain.tone)}</p>
          </div>
          <div className="glass-tile p-3 sm:col-span-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Primary channels</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {businessBrain.channels?.length ? businessBrain.channels.map((channel) => (
                <Badge key={channel} variant="outline">{channel.replace('_', ' ')}</Badge>
              )) : <span className="font-medium text-muted-foreground">Not set yet</span>}
            </div>
          </div>
        </CardContent>
        <div className="glass-divider-t flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>
            <strong className="font-medium">Sandbox by default.</strong>{' '}
            Perfexa can prepare drafts and proposals immediately; spend and public actions stay behind your approval.
          </span>
          <Badge variant="secondary" className="w-fit shrink-0">
            <LockKeyhole className="mr-1 h-3 w-3" /> Approval safety on
          </Badge>
        </div>
      </Card>

      <section aria-labelledby="timeline-heading">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">The plan</p>
            <h2 id="timeline-heading" className="font-display text-xl font-semibold tracking-tight">Seven days to a clearer next move</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{planPersonalization}.</p>
          </div>
          <Badge variant="secondary">7 steps · reviewable</Badge>
        </div>

        <ol className="relative space-y-3 before:absolute before:bottom-6 before:left-[1.1rem] before:top-6 before:w-px before:bg-[color:var(--glass-border-strong)] sm:space-y-4">
          {PLAN.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.day} className="relative grid gap-3 sm:grid-cols-[4.5rem_1fr] sm:gap-4">
                <div className="relative z-10 flex items-center gap-2 sm:block">
                  <div className="glass-elevated flex h-9 w-9 items-center justify-center rounded-xl text-primary sm:mx-auto">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:mt-2 sm:block sm:text-center">
                    Day {item.day}
                  </span>
                </div>
                <Card className="transition-colors hover:border-[color:var(--glass-border-strong)]">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display font-semibold tracking-tight">{item.title}</h3>
                          <Badge variant={item.state === 'You decide' ? 'warning' : 'secondary'}>
                            <CircleDot className="mr-1 h-3 w-3" /> {item.state}
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.objective}</p>
                      </div>
                      <Badge variant="outline" className="w-fit shrink-0">
                        Owner: {item.owner}
                      </Badge>
                    </div>
                    <div className="mt-4 grid gap-3 border-t border-[color:var(--glass-border)] pt-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                      <div>
                        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Output</p>
                        <p className="mt-1 text-sm">{item.output}</p>
                      </div>
                      {item.approval ? (
                        <Badge variant="warning" className="w-fit">
                          <LockKeyhole className="mr-1 h-3 w-3" /> {item.approval}
                        </Badge>
                      ) : (
                        <Badge variant="success" className="w-fit">
                          Sandbox-safe
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <Card className="border-primary/20 bg-primary/[0.04]">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display font-semibold">Ready to make this useful?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask Perfexa to turn the plan into a proposal, or review anything already waiting for you.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/proposals">Review proposals <ArrowRight /></Link>
            </Button>
            <Button asChild>
              <Link href="/console">Open Voice Console <ArrowRight /></Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
