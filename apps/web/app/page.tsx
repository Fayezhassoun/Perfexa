// Landing page — the product's first impression. Minimalist-luxury dark,
// the mic as hero object, jargon-free reassurance throughout.

import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  LineChart,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const EQ_BARS = [0.5, 0.9, 0.6, 1, 0.7, 0.45, 0.85, 0.55];

function EqMark({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-end gap-[3px] ${className}`} aria-hidden>
      {EQ_BARS.map((h, i) => (
        <span
          key={i}
          className="animate-eq w-[3px] rounded-full vox-gradient"
          style={{ height: `${h * 22}px`, animationDelay: `${i * 110}ms` }}
        />
      ))}
    </div>
  );
}

const SPECIALISTS = [
  {
    icon: Search,
    name: 'SEO Specialist',
    blurb: 'Audits your site, fixes what search engines dislike, tracks your rankings.',
  },
  {
    icon: Sparkles,
    name: 'Ads Specialists',
    blurb: 'Google, Meta, and TikTok campaigns — drafted for you, launched only when you approve.',
  },
  {
    icon: Users,
    name: 'Lead Gen Specialist',
    blurb: 'Adds contact forms, captures every enquiry, and scores them so you call the right ones first.',
  },
  {
    icon: LineChart,
    name: 'Analytics Specialist',
    blurb: 'Answers “how did we do this week?” in plain language, not spreadsheets.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Say what you need',
    body: '“I need my website to be top visible. I need to get leads.” That’s the whole brief.',
  },
  {
    n: '02',
    title: 'Review one clear plan',
    body: 'Your team checks your site, then proposes agents, budgets, and a timeline — as simple cards.',
  },
  {
    n: '03',
    title: 'Say “approve”',
    body: 'Nothing spends a cent until you do. A Budget Guardian watches every dollar after that.',
  },
];

export default function Home() {
  return (
    <main className="vox-backdrop min-h-screen overflow-x-hidden">
      {/* Nav — floating glass pill */}
      <header className="glass-strong sticky top-4 z-50 mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-full py-3 pl-6 pr-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl shadow-lg shadow-primary/30 vox-gradient">
            <Mic className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">Sayso</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link href="/register">
              Get started <ArrowRight />
            </Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex max-w-4xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <div className="glass animate-fade-up flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-muted-foreground">
          <EqMark />
          <span>Marketing that listens</span>
        </div>

        <h1 className="animate-fade-up animation-delay-100 mt-8 text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-7xl">
          Your marketing team,
          <br />
          <span className="vox-gradient-text">one sentence away.</span>
        </h1>

        <p className="animate-fade-up animation-delay-200 mt-6 max-w-xl text-balance text-lg text-muted-foreground">
          Press the mic and say what you need. AI specialists audit your site, plan your
          campaigns, and capture your leads — and never spend a cent without your approval.
        </p>

        <div className="animate-fade-up animation-delay-300 mt-10 flex flex-col items-center gap-4 sm:flex-row">
          <Button size="lg" className="h-12 px-7 text-base" asChild>
            <Link href="/register">
              Start talking — it&apos;s free <ArrowRight />
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            No card. No jargon. Sandbox by default.
          </span>
        </div>

        {/* Mock console snippet */}
        <div className="glass animate-fade-up animation-delay-300 mt-16 w-full max-w-2xl rounded-2xl p-6 text-left shadow-2xl">
          <div className="flex items-center gap-3">
            <span className="animate-pulse-glow flex h-11 w-11 shrink-0 items-center justify-center rounded-full vox-gradient">
              <Mic className="h-5 w-5 text-white" />
            </span>
            <p className="text-sm sm:text-base">
              “I need an SEO specialist. I need my website to be top visible. I need to get leads.”
            </p>
          </div>
          <div className="glass-tile mt-5 p-4 text-sm text-muted-foreground">
            <span className="text-foreground">Your team:</span> I checked your site — mobile speed
            58/100, no lead form. I&apos;ll set up an SEO agent, a Google Ads agent, and a contact
            form. Suggested budget $500/mo. <span className="vox-gradient-text font-medium">Say “approve” to launch.</span>
          </div>
        </div>
      </section>

      {/* Specialists */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          A full team, <span className="vox-gradient-text">no hiring</span>
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
          Each specialist has one job, its own tools, and a strict permission scope.
        </p>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SPECIALISTS.map(({ icon: Icon, name, blurb }) => (
            <div key={name} className="glass lift rounded-2xl p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <Icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="mt-4 font-medium">{name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-10 lg:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="relative">
              <span className="font-display text-6xl font-semibold text-foreground/10">{step.n}</span>
              <h3 className="mt-2 text-xl font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Safety band */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="glass relative overflow-hidden rounded-3xl p-8 sm:p-12">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" aria-hidden />
          <div className="relative grid items-center gap-8 lg:grid-cols-[auto,1fr]">
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl vox-gradient">
              <ShieldCheck className="h-8 w-8 text-white" />
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Your money is guarded, not just budgeted.
              </h2>
              <p className="mt-3 max-w-2xl text-muted-foreground">
                Every spend needs your explicit “approve” — by voice or click. A Budget Guardian
                enforces hard caps, pauses runaway campaigns automatically, and writes every single
                action to an audit log you can read. New accounts run entirely in a safe sandbox.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-28 text-center">
        <Bot className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Five minutes from hello to <span className="vox-gradient-text">campaigns live</span>.
        </h2>
        <Button size="lg" className="mt-8 h-12 px-7 text-base" asChild>
          <Link href="/register">
            Create your team <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="glass-divider-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" /> Sayso
          </span>
          <span>Built for people who&apos;d rather run their business than learn ad platforms.</span>
        </div>
      </footer>
    </main>
  );
}
