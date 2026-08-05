import Link from 'next/link';
import { ArrowRight, Bell, Check, Fingerprint, Gauge, Globe, Radar, ShieldCheck, Sparkles, Swords, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { HowItWorks } from '@/components/how-it-works';
import { TrustSection } from '@/components/trust-section';

const SAFETY_POINTS = [
  'Approval before any spend or public action',
  'Every decision recorded in an audit log',
  'Sandbox mode on by default. Go live on your terms',
];

/* Hero: product preview */
function OpsConsole() {
  return (
    <div className="glass-panel w-full overflow-hidden rounded-3xl p-5 text-left shadow-2xl sm:p-6">
      {/* console header */}
      <div className="flex items-center justify-between border-b border-[color:var(--glass-border)] pb-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <p className="font-display text-sm font-semibold tracking-tight">GrowthCrew Ops</p>
        </div>
        <span className="text-[0.68rem] font-medium text-muted-foreground">Product preview</span>
      </div>

      {/* signal rows */}
      <div className="space-y-3 pt-4">
        {/* alert */}
        <div className="relative overflow-hidden rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
          <span className="absolute inset-y-0 left-0 w-1 bg-red-500" />
          <div className="flex items-center justify-between gap-3 pl-2">
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium leading-tight">Example alert</p>
                <p className="text-[0.68rem] text-muted-foreground">Performance needs review · Meta</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-red-500">critical</span>
          </div>
        </div>

        {/* fatigue */}
        <div className="relative overflow-hidden rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <span className="absolute inset-y-0 left-0 w-1 bg-amber-500" />
          <div className="flex items-center justify-between gap-3 pl-2">
            <div className="flex items-center gap-2.5">
              <Gauge className="h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="text-sm font-medium leading-tight">Example pattern</p>
                <p className="text-[0.68rem] text-muted-foreground">Frequency threshold reached</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-500">review</span>
          </div>
        </div>

        {/* counter-campaign */}
        <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-3">
          <span className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <div className="flex items-center justify-between gap-3 pl-2">
            <div className="flex items-center gap-2.5">
              <Swords className="h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium leading-tight">Draft counter-campaign</p>
                <p className="text-[0.68rem] text-muted-foreground">Suggested budget · awaiting approval</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[0.62rem] font-semibold text-primary">review</span>
          </div>
        </div>

        {/* portal */}
        <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Globe className="h-4 w-4 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-medium leading-tight">Report preview</p>
              <p className="text-[0.68rem] text-muted-foreground">your brand</p>
            </div>
          </div>
          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
        </div>
      </div>

      {/* console footer */}
      <div className="mt-4 flex items-center justify-between border-t border-[color:var(--glass-border)] pt-3.5">
        <span className="text-[0.68rem] text-muted-foreground">Sample scan state</span>
        <span className="flex items-center gap-1.5 text-[0.68rem] font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> 0 actions taken without approval
        </span>
      </div>
    </div>
  );
}

/* ── Five engines bento ──────────────────────────────────────── */
function EnginesBento() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
      {/* Counter-Campaign */}
      <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 md:col-span-4 md:row-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Swords className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">Engine 02 · Counter-Campaign</p>
        <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight">See their play. Ship your answer.</h3>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          GrowthCrew reads what competitors are running, then drafts a counter-campaign across Google, Meta, and TikTok. Budgets stay staged
          until you approve.
        </p>
        {/* mini brief mock */}
        <div className="mt-5 max-w-md rounded-xl border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Example competitor signal</p>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-red-500">review</span>
          </div>
          <div className="mt-3 space-y-1.5">
            {[
              { p: 'Google Ads', b: 'staged' },
              { p: 'Meta', b: 'staged' },
              { p: 'TikTok', b: 'staged' },
            ].map((row) => (
              <div key={row.p} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{row.p}</span>
                <span className="font-mono tabular-nums">{row.b}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[color:var(--glass-border)] pt-1.5 text-xs font-medium">
              <span>Budget held for review</span>
              <span className="text-primary">Review →</span>
            </div>
          </div>
        </div>
      </div>

      {/* Anomaly Alerts */}
      <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 md:col-span-2 md:row-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-500/12 text-red-500">
          <Radar className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-red-500">Engine 03 · Guardian</p>
        <h3 className="mt-2 font-display text-xl font-semibold tracking-tight">Catches the dip before your boss does.</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Spend, CTR, frequency, and conversions are checked around the clock. Each alert includes a suggested fix.
        </p>
        <div className="mt-5 space-y-2">
          {[
            { m: 'CTR', v: 'needs review', tone: 'text-red-500' },
            { m: 'CPC', v: 'watch', tone: 'text-amber-500' },
            { m: 'ROAS', v: 'check', tone: 'text-red-500' },
          ].map((row) => (
            <div
              key={row.m}
              className="flex items-center justify-between rounded-lg border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-3 py-2"
            >
              <span className="text-xs text-muted-foreground">{row.m}</span>
              <span className={`font-mono text-xs font-semibold tabular-nums ${row.tone}`}>{row.v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Brand DNA */}
      <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 md:col-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-500">
          <Fingerprint className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-500">Engine 01 · Brand DNA</p>
        <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">Writes like you, because it knows you.</h3>
        <p className="mt-2 text-sm text-muted-foreground">Voice, audience, and hard guardrails are remembered on every task.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {['plain-spoken', 'MENA-first', 'never salesy'].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[0.68rem] font-medium text-emerald-600 dark:text-emerald-400"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      {/* Creative Fatigue */}
      <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 md:col-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-500">
          <Gauge className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-amber-500">Engine 05 · Creative Health</p>
        <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">Knows when an ad is about to die.</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Frequency, CTR decay, and conversion drought are signals to review before fatigue spreads.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                className="text-[color:var(--glass-bg-subtle)]"
              />
              <circle
                cx="24"
                cy="24"
                r="19"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="119"
                strokeDashoffset="20"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[0.62rem] font-semibold text-amber-500">watch</span>
          </div>
          <span className="text-xs text-muted-foreground">
            frequency
            <br />
            signal
          </span>
        </div>
      </div>

      {/* Client Portal */}
      <div className="glass-panel group relative overflow-hidden p-6 transition-all duration-300 hover:-translate-y-1 md:col-span-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/12 text-sky-500">
          <Globe className="h-5 w-5" />
        </div>
        <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-sky-500">Engine 04 · Client Portal</p>
        <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">Report under your brand, not ours.</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Your name, colors, and logo on a report preview. Share a link when it is ready; revoke anytime.
        </p>
        <div className="mt-4 overflow-hidden rounded-lg border border-[color:var(--glass-border)]">
          <div className="flex items-center justify-between bg-gradient-to-r from-sky-500 to-indigo-500 px-3 py-2">
            <span className="text-[0.68rem] font-semibold text-white">Your Agency</span>
            <span className="text-[0.55rem] text-white/70">client view</span>
          </div>
          <div className="flex items-center justify-between bg-[color:var(--glass-bg-subtle)] px-3 py-2">
            <span className="text-[0.62rem] text-muted-foreground">Spend · Conv · ROAS</span>
            <span className="font-mono text-[0.62rem] tabular-nums text-emerald-500">preview</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="liquid-shell min-h-screen overflow-x-hidden">
      <header className="liquid-topbar sticky top-0 z-50 mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <BrandMark href="/" size="md" ariaLabel="GrowthCrew home" />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/pricing">Pricing</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[0.95fr,1.05fr] lg:gap-16 lg:px-12 lg:pb-32 lg:pt-24">
        <div className="max-w-xl">
          <div className="glass-chip animate-fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Now onboarding design partners
          </div>
          <h1 className="animate-fade-up animation-delay-100 mt-7 text-balance font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
            Your AI marketing team,
            <span className="mt-2 block text-primary">on watch when you are not.</span>
          </h1>
          <p className="animate-fade-up animation-delay-200 mt-7 max-w-lg text-balance text-lg leading-relaxed text-muted-foreground">
            GrowthCrew plugs into your ad accounts read-only, watches performance around the clock, and turns anomalies into approved next
            steps. It gives you a weekly report under your brand to review with clients.
          </p>
          <div className="animate-fade-up animation-delay-300 mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Button size="lg" className="h-12 px-7 text-base" asChild>
              <Link href="/register?plan=growth">
                Start your pilot <ArrowRight />
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">No card required to explore the pilot · read-only connections</span>
          </div>
          <p className="animate-fade-up animation-delay-300 mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Gate 1 is simple: connect an ad account, then look for the first useful signal in your first weekly report.
          </p>
          <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {['Learns your brand', 'Watches competitors', 'Flags anomalies', 'Reports as you'].map((item, index) => (
              <span key={item} className="flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                  {index + 1}
                </span>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="animate-fade-up animation-delay-200 lg:pl-2">
          <OpsConsole />
        </div>
      </section>

      {/* Five engines */}
      <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="page-header mb-10">
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">The operating system</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Five engines, one crew.</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">Each engine has a job. Together they move from signal to approved action.</p>
          </div>
          <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Zap className="h-4 w-4 text-primary" /> Approval in the loop, always
          </span>
        </div>
        <EnginesBento />
      </section>

      {/* How it works */}
      <HowItWorks />

      {/* Trust & design partners */}
      <TrustSection />

      {/* Control & safety */}
      <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="glass-panel grid gap-8 rounded-3xl p-7 sm:p-10 lg:grid-cols-[0.75fr,1.25fr] lg:items-center lg:p-12">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Autonomy with a kill switch.</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              The crew proposes and prepares. Anything that spends money or goes public waits for you. That&apos;s the product.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {SAFETY_POINTS.map((point) => (
              <div key={point} className="glass-tile rounded-2xl p-4">
                <Check className="h-4 w-4 text-emerald-500" />
                <p className="mt-4 text-sm font-medium leading-relaxed">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-4xl px-5 pb-28 sm:px-8">
        <div className="glass-panel relative overflow-hidden rounded-3xl px-7 py-12 text-center sm:px-12 sm:py-16">
          <div className="absolute -left-24 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div
            className="absolute -bottom-32 -right-24 h-64 w-64 rounded-full bg-[color:hsl(var(--voice)/0.12)] blur-3xl"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="glass-chip inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Design Partner Program · Gate 1 pilot
            </div>
            <h2 className="mx-auto mt-6 max-w-xl text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              The pilot is small. The work is real.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance leading-relaxed text-muted-foreground">
              Join the design-partner program for founding rates and a direct line to the founder. Connect an ad account, then use the first
              weekly report to decide what is useful.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-7 text-base" asChild>
                <Link href="/register?plan=growth">
                  Start the pilot <ArrowRight />
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">No card required during beta · read-only connections</p>
          </div>
        </div>
      </section>

      <footer className="glass-divider-t">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8 lg:px-12">
          <BrandMark size="sm" />
          <span>Built for people who&apos;d rather run their business than babysit their ads.</span>
        </div>
      </footer>
    </main>
  );
}
