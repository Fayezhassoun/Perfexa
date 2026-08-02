'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader, PageShell } from '@/components/page-shell';
import {
  BUSINESS_BRAIN_CHANNELS,
  readBusinessBrain,
  type BusinessBrain,
  type BusinessBrainChannel,
  type BusinessBrainTone,
} from '@/lib/business-brain';

const GOAL_LABELS: Record<string, string> = {
  visibility: 'Be more visible',
  leads: 'Get leads',
  sales: 'Drive sales',
};

const TONE_OPTIONS: { value: BusinessBrainTone; label: string }[] = [
  { value: 'friendly', label: 'Friendly and approachable' },
  { value: 'expert', label: 'Expert and helpful' },
  { value: 'premium', label: 'Premium and polished' },
  { value: 'direct', label: 'Direct and concise' },
];

function formatBudget(cents: number | null | undefined): string {
  if (cents == null) return 'Not set yet';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default function BusinessBrainPage() {
  const utils = trpc.useUtils();
  const { data: org, isLoading, isError } = trpc.onboarding.get.useQuery();
  const [offer, setOffer] = useState('');
  const [idealCustomer, setIdealCustomer] = useState('');
  const [location, setLocation] = useState('');
  const [tone, setTone] = useState<BusinessBrainTone | ''>('');
  const [channels, setChannels] = useState<BusinessBrainChannel[]>([]);
  const [constraints, setConstraints] = useState('');
  const [proofPoints, setProofPoints] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!org || hydrated) return;
    const brain = readBusinessBrain(org.settings);
    setOffer(brain.offer ?? '');
    setIdealCustomer(brain.idealCustomer ?? '');
    setLocation(brain.location ?? '');
    setTone(brain.tone ?? '');
    setChannels(brain.channels ?? []);
    setConstraints(brain.constraints ?? '');
    setProofPoints(brain.proofPoints ?? '');
    setHydrated(true);
  }, [org, hydrated]);

  const update = trpc.onboarding.update.useMutation({
    onSuccess: async () => {
      await utils.onboarding.invalidate();
      setMessage('Business Brain saved. GrowthCrew will use this context in your plan and console.');
    },
    onError: (error) => setMessage(error.message),
  });

  function toggleChannel(channel: BusinessBrainChannel) {
    setMessage(null);
    setChannels((current) =>
      current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel],
    );
  }

  async function save() {
    setMessage(null);
    const businessBrain: BusinessBrain = {
      offer: offer.trim(),
      idealCustomer: idealCustomer.trim(),
      location: location.trim(),
      ...(tone ? { tone } : {}),
      channels,
      constraints: constraints.trim(),
      proofPoints: proofPoints.trim(),
    };
    await update.mutateAsync({ businessBrain });
  }

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
        <Card className="elevated-card max-w-md">
          <CardHeader>
            <CardTitle>Business Brain unavailable</CardTitle>
            <CardDescription>We couldn&apos;t load your business context. Try refreshing the page.</CardDescription>
          </CardHeader>
        </Card>
      </PageShell>
    );
  }

  const goals = (org.goals ?? []).map((goal) => GOAL_LABELS[goal] ?? goal);

  return (
    <PageShell className="space-y-6" data-testid="business-brain">
      <PageHeader
        eyebrow="Persistent business context"
        title="Business Brain"
        description="The context GrowthCrew uses before it drafts plans, proposals, and campaigns."
        actions={
          <Button asChild variant="outline">
            <Link href="/growth-plan"><ArrowLeft /> Back to Growth Plan</Link>
          </Button>
        }
      />

      <Card className="elevated-card overflow-hidden border-primary/20">
        <CardHeader className="border-b border-[color:var(--glass-border)] bg-primary/[0.04] pb-4">
          <div className="flex items-start gap-3">
            <div className="glass-chip flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">What GrowthCrew already knows</CardTitle>
                <span className="live-status text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  <span className="live-dot" aria-hidden /> Context active
                </span>
              </div>
              <CardDescription className="mt-1">This profile comes from your onboarding setup.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass-tile p-3">
            <p className="stat-label text-muted-foreground">Business name</p>
            <p className="mt-1 truncate font-display text-base font-semibold">{org.name}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="stat-label text-muted-foreground">Website</p>
            <p className="mt-1 truncate font-display text-base font-semibold">{org.websiteUrl ?? 'Not added yet'}</p>
          </div>
          <div className="glass-tile p-3">
            <p className="stat-label text-muted-foreground">Goals</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {goals.length ? goals.map((goal) => <Badge key={goal} variant="outline">{goal}</Badge>) : (
                <span className="font-medium text-muted-foreground">Not set yet</span>
              )}
            </div>
          </div>
          <div className="glass-tile p-3">
            <p className="stat-label text-muted-foreground">Budget ceiling</p>
            <p className="mt-1 font-display text-base font-semibold tabular-nums">{formatBudget(org.monthlyBudgetCeilingCents)}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="elevated-card">
        <CardHeader>
          <CardTitle className="text-lg">Shape your context</CardTitle>
          <CardDescription>Keep this specific enough to guide useful drafts, and update it as your business changes.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="business-brain-offer">Main offer</Label>
            <Textarea
              id="business-brain-offer"
              aria-label="Main offer"
              maxLength={600}
              placeholder="What do you sell, and what outcome does it create?"
              value={offer}
              onChange={(event) => { setMessage(null); setOffer(event.target.value); }}
            />
            <p className="text-xs text-muted-foreground">{offer.length}/600</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-brain-customer">Ideal customer</Label>
            <Textarea
              id="business-brain-customer"
              aria-label="Ideal customer"
              maxLength={600}
              placeholder="Who is most likely to value this offer?"
              value={idealCustomer}
              onChange={(event) => { setMessage(null); setIdealCustomer(event.target.value); }}
            />
            <p className="text-xs text-muted-foreground">{idealCustomer.length}/600</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-brain-location">Location / service area</Label>
            <Input
              id="business-brain-location"
              maxLength={600}
              placeholder="e.g. Berlin and nearby areas"
              value={location}
              onChange={(event) => { setMessage(null); setLocation(event.target.value); }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-brain-tone">Brand voice / tone</Label>
            <Select id="business-brain-tone" aria-label="Brand voice/tone" value={tone} onChange={(event) => {
              setMessage(null);
              setTone(event.target.value as BusinessBrainTone | '');
            }}>
              <option value="">Choose a tone</option>
              {TONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Primary channels</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Primary channels">
              {BUSINESS_BRAIN_CHANNELS.map((channel) => {
                const selected = channels.includes(channel.key);
                return (
                  <Button
                    key={channel.key}
                    type="button"
                    size="sm"
                    variant={selected ? 'default' : 'outline'}
                    aria-pressed={selected}
                    onClick={() => toggleChannel(channel.key)}
                  >
                    {selected && <Check />}
                    {channel.label}
                  </Button>
                );
              })}
            </div>
            {channels.length === 0 && (
              <div className="empty-state flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                Choose the channels GrowthCrew should prioritize in drafts.
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-brain-constraints">Constraints / things GrowthCrew should avoid</Label>
            <Textarea
              id="business-brain-constraints"
              maxLength={600}
              placeholder="Topics, claims, audiences, or tactics to avoid."
              value={constraints}
              onChange={(event) => { setMessage(null); setConstraints(event.target.value); }}
            />
            <p className="text-xs text-muted-foreground">{constraints.length}/600</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-brain-proof">Proof points / differentiators</Label>
            <Textarea
              id="business-brain-proof"
              maxLength={600}
              placeholder="Experience, results, credentials, or reasons customers choose you."
              value={proofPoints}
              onChange={(event) => { setMessage(null); setProofPoints(event.target.value); }}
            />
            <p className="text-xs text-muted-foreground">{proofPoints.length}/600</p>
          </div>
        </CardContent>
        <CardContent className="glass-divider-t flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="text-sm">
            {message && (
              <p className={update.isError ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'} data-testid="business-brain-save-message">
                {message}
              </p>
            )}
          </div>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Business Brain'}
          </Button>
        </CardContent>
      </Card>

      <Card className="elevated-card border-emerald-500/20 bg-emerald-500/[0.04]">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
          <div>
            <p className="font-medium">Drafts and sandbox by default</p>
            <p className="mt-1 text-sm text-muted-foreground">
              GrowthCrew can prepare plans, proposals, and campaign drafts. Public or spend actions remain approval-gated.
            </p>
            <Badge variant="secondary" className="mt-3"><LockKeyhole className="mr-1 h-3 w-3" /> Approval safety on</Badge>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
