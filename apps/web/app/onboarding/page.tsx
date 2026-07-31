'use client';

// Onboarding wizard (CONTRACTS §10): business → goals → budget → connect
// (skippable) → done → /growth-plan. Each step persists via onboarding.update.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Globe, Target, Wallet } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { BrandMark, BrandMarkIcon } from '@/components/brand-mark';

const GOALS = [
  { key: 'visibility' as const, label: 'Be more visible', hint: 'Show up when people search' },
  { key: 'leads' as const, label: 'Get leads', hint: 'Collect contacts of interested people' },
  { key: 'sales' as const, label: 'Drive sales', hint: 'Turn visitors into customers' },
];

const PLATFORMS = [
  { key: 'google_ads' as const, label: 'Google Ads' },
  { key: 'meta' as const, label: 'Meta (Facebook & Instagram)' },
  { key: 'tiktok' as const, label: 'TikTok' },
];

type Step = 'business' | 'goals' | 'budget' | 'connect';
const STEPS: Step[] = ['business', 'goals', 'budget', 'connect'];

export default function OnboardingPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.onboarding.get.useQuery();

  const [step, setStep] = useState<Step>('business');
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [goals, setGoals] = useState<('visibility' | 'leads' | 'sales')[]>([]);
  const [budget, setBudget] = useState(500);
  const [connected, setConnected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!org || hydrated) return;
    setHydrated(true);
    if (org.onboardingStep === 'done') {
      router.replace('/growth-plan');
      return;
    }
    setName(org.name ?? '');
    setWebsiteUrl(org.websiteUrl ?? '');
    setGoals((org.goals as ('visibility' | 'leads' | 'sales')[]) ?? []);
    setBudget(Math.round((org.monthlyBudgetCeilingCents ?? 50000) / 100));
  }, [org, hydrated, router]);

  const update = trpc.onboarding.update.useMutation({ onError: (e) => setError(e.message) });
  const complete = trpc.onboarding.complete.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: async () => {
      await utils.invalidate();
      router.push('/growth-plan');
      router.refresh();
    },
  });
  const connect = trpc.settings.connect.useMutation({
    onSuccess: (_d, vars) => setConnected((c) => [...c, vars.platform]),
    onError: (e) => setError(e.message),
  });

  async function next() {
    setError(null);
    if (step === 'business') {
      if (!name.trim()) return setError('Give your business a name');
      let url = websiteUrl.trim();
      if (url && !/^https?:\/\//.test(url)) url = `https://${url}`;
      await update.mutateAsync({
        name: name.trim(),
        ...(url ? { websiteUrl: url } : {}),
        onboardingStep: 'goals',
      });
      setWebsiteUrl(url);
      setStep('goals');
    } else if (step === 'goals') {
      if (!goals.length) return setError('Pick at least one goal');
      await update.mutateAsync({ goals, onboardingStep: 'budget' });
      setStep('budget');
    } else if (step === 'budget') {
      if (budget < 1) return setError('Budget must be at least $1');
      await update.mutateAsync({
        monthlyBudgetCeilingCents: Math.round(budget * 100),
        onboardingStep: 'connect',
      });
      setStep('connect');
    } else {
      await complete.mutateAsync({});
    }
  }

  const stepIndex = STEPS.indexOf(step);
  const busy = update.isPending || complete.isPending;

  if (isLoading) {
    return <div className="liquid-shell flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="liquid-shell flex min-h-screen items-center justify-center p-4">
      <div className="animate-fade-up w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <BrandMark size="md" href="/" ariaLabel="GrowthCrew home" />
        </div>
        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                'h-1.5 w-16 rounded-full transition-colors duration-300',
                i <= stepIndex ? 'vox-gradient' : 'bg-muted',
              )}
            />
          ))}
        </div>
        <Card className="glass-panel rounded-[var(--glass-radius-lg)]">
          {step === 'business' && (
            <>
              <CardHeader>
                <Globe className="mb-1 h-5 w-5 text-primary" />
                <CardTitle>Tell us about your business</CardTitle>
                <CardDescription>
                  We&apos;ll use your website to run a quick health check — no jargon, promise.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="biz-name">Business name</Label>
                  <Input id="biz-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="biz-url">Website (optional)</Label>
                  <Input
                    id="biz-url"
                    placeholder="https://example.com"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                  />
                </div>
              </CardContent>
            </>
          )}

          {step === 'goals' && (
            <>
              <CardHeader>
                <Target className="mb-1 h-5 w-5 text-primary" />
                <CardTitle>What do you want to achieve?</CardTitle>
                <CardDescription>Pick everything that applies — you can change this later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {GOALS.map((g) => {
                  const active = goals.includes(g.key);
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() =>
                        setGoals((prev) =>
                          active ? prev.filter((x) => x !== g.key) : [...prev, g.key],
                        )
                      }
                      className={cn(
                        'glass-tile flex w-full items-center justify-between p-3 text-left transition-all duration-300',
                        active ? 'border-primary/50 bg-primary/10' : 'hover:bg-[color:var(--glass-row-hover)]',
                      )}
                    >
                      <span>
                        <span className="block font-medium">{g.label}</span>
                        <span className="block text-sm text-muted-foreground">{g.hint}</span>
                      </span>
                      {active && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })}
              </CardContent>
            </>
          )}

          {step === 'budget' && (
            <>
              <CardHeader>
                <Wallet className="mb-1 h-5 w-5 text-primary" />
                <CardTitle>Monthly budget ceiling</CardTitle>
                <CardDescription>
                  A hard cap. Nothing is ever spent without your explicit approval, and the Budget
                  Guardian pauses everything if spend gets close.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="budget">Maximum per month (USD)</Label>
                <Input
                  id="budget"
                  type="number"
                  min={1}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </CardContent>
            </>
          )}

          {step === 'connect' && (
            <>
              <CardHeader>
                <BrandMarkIcon size={20} className="mb-1" />
                <CardTitle>Connect ad accounts</CardTitle>
                <CardDescription>
                  Optional — everything starts in a safe sandbox either way. You can connect real
                  accounts any time in Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLATFORMS.map((p) => {
                  const isConnected = connected.includes(p.key);
                  return (
                    <div key={p.key} className="glass-tile flex items-center justify-between p-3">
                      <span className="text-sm font-medium">{p.label}</span>
                      {isConnected ? (
                        <span className="flex items-center gap-1 text-sm text-emerald-500">
                          <Check className="h-4 w-4" /> Sandbox connected
                        </span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={connect.isPending}
                          onClick={() => connect.mutate({ platform: p.key })}
                        >
                          Connect sandbox
                        </Button>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </>
          )}

          <CardContent className="glass-divider-t flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              disabled={stepIndex === 0 || busy}
              onClick={() => setStep(STEPS[stepIndex - 1]!)}
            >
              Back
            </Button>
            {error && <p className="px-2 text-sm text-destructive">{error}</p>}
            <Button onClick={next} disabled={busy} data-testid="onboarding-next">
              {busy ? 'Saving…' : step === 'connect' ? 'Finish' : 'Continue'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
