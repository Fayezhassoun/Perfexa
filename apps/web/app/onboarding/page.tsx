'use client';

// Guided first-run wizard (CONTRACTS §10): business → goals → connect →
// brand voice → first insight → done → /dashboard. Each step persists via
// onboarding.update so a refresh resumes at the furthest step reached.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Check,
  Globe,
  Loader2,
  Mic,
  PartyPopper,
  Plug,
  Sparkles,
  Target,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { BrandMark, BrandMarkIcon } from '@/components/brand-mark';

type Goal = 'visibility' | 'leads' | 'sales';
type Tone = 'friendly' | 'expert' | 'premium' | 'direct';
type Formality = 'casual' | 'balanced' | 'formal';
type Personality = 'approachable' | 'authoritative' | 'playful' | 'bold';
type Icon = React.ComponentType<{ className?: string }>;

const GOALS: { key: Goal; label: string; hint: string }[] = [
  { key: 'leads', label: 'More leads', hint: 'Collect contacts of interested people' },
  { key: 'visibility', label: 'Brand awareness', hint: 'Be more visible when people search' },
  { key: 'sales', label: 'Lower CPA & more sales', hint: 'Turn visitors into customers efficiently' },
];

const PLATFORMS = [
  { key: 'google_ads' as const, label: 'Google Ads' },
  { key: 'meta' as const, label: 'Meta (Facebook & Instagram)' },
  { key: 'tiktok' as const, label: 'TikTok' },
];

const TONES: { value: Tone; label: string }[] = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'expert', label: 'Expert' },
  { value: 'premium', label: 'Premium' },
  { value: 'direct', label: 'Direct' },
];

const FORMALITIES: { value: Formality; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'formal', label: 'Formal' },
];

const PERSONALITIES: { value: Personality; label: string }[] = [
  { value: 'approachable', label: 'Approachable' },
  { value: 'authoritative', label: 'Authoritative' },
  { value: 'playful', label: 'Playful' },
  { value: 'bold', label: 'Bold' },
];

type StepKey = 'business' | 'goals' | 'connect' | 'voice' | 'insight';
const STEPS: { key: StepKey; label: string; icon: Icon }[] = [
  { key: 'business', label: 'Business', icon: Globe },
  { key: 'goals', label: 'Goals', icon: Target },
  { key: 'connect', label: 'Connect', icon: Plug },
  { key: 'voice', label: 'Brand voice', icon: Mic },
  { key: 'insight', label: 'First insight', icon: Activity },
];

// Maps the persisted onboardingStep to the wizard index so a refresh resumes.
function stepIndexFromStep(value: string | null | undefined): number {
  switch (value) {
    case 'goals':
      return 1;
    case 'budget': // legacy mid-flow value — resume at the connect step
    case 'connect':
      return 2;
    case 'voice':
      return 3;
    case 'insight':
      return 4;
    default:
      return 0; // welcome, business, or unknown
  }
}

function severityVariant(severity: string | null): 'destructive' | 'warning' | 'secondary' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  return 'secondary';
}

export default function OnboardingPage() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: org, isLoading } = trpc.onboarding.get.useQuery();

  const [stepIndex, setStepIndex] = useState(0);
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [tone, setTone] = useState<Tone>('friendly');
  const [formality, setFormality] = useState<Formality>('balanced');
  const [personality, setPersonality] = useState<Personality>('approachable');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const ranDetection = useRef(false);

  useEffect(() => {
    if (!org || hydrated) return;
    setHydrated(true);
    if (org.onboardingStep === 'done') {
      router.replace('/dashboard');
      return;
    }
    setName(org.name ?? '');
    setWebsiteUrl(org.websiteUrl ?? '');
    setGoals((org.goals as Goal[] | null) ?? []);
    const brain = ((org.settings as Record<string, unknown> | null)?.businessBrain ?? {}) as Record<
      string,
      unknown
    >;
    if (brain.tone) setTone(brain.tone as Tone);
    if (brain.formality) setFormality(brain.formality as Formality);
    if (brain.personality) setPersonality(brain.personality as Personality);
    setStepIndex(stepIndexFromStep(org.onboardingStep));
  }, [org, hydrated, router]);

  const update = trpc.onboarding.update.useMutation({ onError: (e) => setError(e.message) });
  const complete = trpc.onboarding.complete.useMutation({
    onError: (e) => setError(e.message),
    onSuccess: async () => {
      setWelcomed(true);
      await utils.invalidate();
      setTimeout(() => {
        router.push('/dashboard');
        router.refresh();
      }, 1600);
    },
  });
  const connect = trpc.settings.connect.useMutation({
    onSuccess: (_d, vars) => setConnected((c) => (c.includes(vars.platform) ? c : [...c, vars.platform])),
    onError: (e) => setError(e.message),
  });

  const alertsList = trpc.alerts.list.useQuery({ limit: 1 }, { enabled: stepIndex === 4 });
  const runDetection = trpc.alerts.runDetection.useMutation({
    onError: () => undefined, // a failed scan shouldn't block onboarding
    onSuccess: () => utils.alerts.list.invalidate(),
  });

  useEffect(() => {
    if (stepIndex === 4 && !ranDetection.current) {
      ranDetection.current = true;
      runDetection.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function goStep(index: number) {
    setError(null);
    setStepIndex(index);
  }

  async function next() {
    setError(null);
    const step = STEPS[stepIndex]!.key;
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
      goStep(1);
    } else if (step === 'goals') {
      if (!goals.length) return setError('Pick at least one goal');
      await update.mutateAsync({ goals, onboardingStep: 'connect' });
      goStep(2);
    } else if (step === 'connect') {
      await update.mutateAsync({ onboardingStep: 'voice' });
      goStep(3);
    } else if (step === 'voice') {
      await update.mutateAsync({
        businessBrain: { tone, formality, personality },
        onboardingStep: 'insight',
      });
      goStep(4);
    } else {
      await complete.mutateAsync({});
    }
  }

  const step = STEPS[stepIndex]!;
  const StepIcon = step.icon;
  const busy = update.isPending || complete.isPending;
  const isLast = stepIndex === STEPS.length - 1;
  const topAlert = alertsList.data?.[0];
  const scanning = stepIndex === 4 && (runDetection.isPending || alertsList.isLoading);

  if (isLoading) {
    return (
      <div className="liquid-shell flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="liquid-shell flex min-h-screen items-center justify-center p-4">
      <div className="animate-fade-up w-full max-w-lg">
        <div className="mb-6 flex justify-center">
          <BrandMark size="md" href="/" ariaLabel="Perfexa home" />
        </div>

        {/* Progress: "Step X of 5" + a fluid bar that never overflows on mobile */}
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <span>{step.label}</span>
        </div>
        <div className="mb-6 flex gap-1.5" role="progressbar" aria-valuenow={stepIndex + 1} aria-valuemin={1} aria-valuemax={STEPS.length}>
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                i <= stepIndex ? 'vox-gradient' : 'bg-muted',
              )}
            />
          ))}
        </div>

        <Card className="glass-panel rounded-[var(--glass-radius-lg)]">
          {step.key === 'business' && (
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

          {step.key === 'goals' && (
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
                        'glass-tile flex w-full items-center justify-between gap-3 p-3 text-left transition-all duration-300',
                        active
                          ? 'border-primary/50 bg-primary/10'
                          : 'hover:bg-[color:var(--glass-row-hover)]',
                      )}
                    >
                      <span>
                        <span className="block font-medium">{g.label}</span>
                        <span className="block text-sm text-muted-foreground">{g.hint}</span>
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </CardContent>
            </>
          )}

          {step.key === 'connect' && (
            <>
              <CardHeader>
                <BrandMarkIcon size={20} className="mb-1" />
                <CardTitle>Connect your first ad platform</CardTitle>
                <CardDescription>
                  Optional — everything starts in a safe sandbox either way. You can connect real
                  accounts any time in Settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {PLATFORMS.map((p) => {
                  const isConnected = connected.includes(p.key);
                  return (
                    <div key={p.key} className="glass-tile flex items-center justify-between gap-3 p-3">
                      <span className="text-sm font-medium">{p.label}</span>
                      {isConnected ? (
                        <span className="flex shrink-0 items-center gap-1 text-sm text-emerald-500">
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

          {step.key === 'voice' && (
            <>
              <CardHeader>
                <Mic className="mb-1 h-5 w-5 text-primary" />
                <CardTitle>Set your brand voice</CardTitle>
                <CardDescription>
                  Perfexa writes in your voice. Pick a starting point — refine it any time in
                  Brand DNA.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voice-tone">Tone</Label>
                  <Select id="voice-tone" value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-formality">Formality</Label>
                  <Select
                    id="voice-formality"
                    value={formality}
                    onChange={(e) => setFormality(e.target.value as Formality)}
                  >
                    {FORMALITIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-personality">Personality</Label>
                  <Select
                    id="voice-personality"
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value as Personality)}
                  >
                    {PERSONALITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </CardContent>
            </>
          )}

          {step.key === 'insight' && (
            <>
              <CardHeader>
                <Sparkles className="mb-1 h-5 w-5 text-primary" />
                <CardTitle>Your first insight</CardTitle>
                <CardDescription>
                  Perfexa just scanned your campaigns for anomalies. Here&apos;s what it found.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scanning ? (
                  <div className="glass-tile flex items-center gap-3 p-4 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning your campaigns…
                  </div>
                ) : topAlert ? (
                  <div className="glass-tile space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{topAlert.title}</p>
                      <Badge variant={severityVariant(topAlert.severity)} className="shrink-0 capitalize">
                        {topAlert.severity ?? 'info'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{topAlert.message}</p>
                    {topAlert.suggestedAction && (
                      <p className="text-sm">
                        <span className="font-medium text-foreground">Try this: </span>
                        {topAlert.suggestedAction}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="glass-tile flex items-start gap-3 p-4">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="text-sm">
                      <p className="font-medium">All clear</p>
                      <p className="text-muted-foreground">
                        No anomalies detected yet. We&apos;ll keep watching and alert you the moment
                        something needs attention.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          )}

          <CardContent className="glass-divider-t flex items-center justify-between gap-3 pt-4">
            <Button
              variant="ghost"
              disabled={stepIndex === 0 || busy}
              onClick={() => goStep(stepIndex - 1)}
            >
              Back
            </Button>
            {error && <p className="px-1 text-sm text-destructive">{error}</p>}
            <Button onClick={next} disabled={busy || scanning} data-testid="onboarding-next">
              {busy ? 'Saving…' : isLast ? 'Go to dashboard' : 'Continue'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {welcomed && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="glass-panel animate-fade-up flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium shadow-lg">
            <PartyPopper className="h-4 w-4 text-primary" />
            Welcome to Perfexa!
          </div>
        </div>
      )}
    </div>
  );
}
