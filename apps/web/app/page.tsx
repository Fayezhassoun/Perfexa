import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Check,
  LineChart,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { LandingCommandFlow } from '@/components/landing-command-flow';

const SPECIALISTS = [
  { icon: Search, name: 'SEO', detail: 'Visibility, technical health, and search opportunities.' },
  { icon: Sparkles, name: 'Paid growth', detail: 'Campaign plans with budgets that wait for approval.' },
  { icon: Users, name: 'Lead capture', detail: 'Forms, qualification, and a cleaner follow-up path.' },
  { icon: LineChart, name: 'Analytics', detail: 'A plain-language weekly read on what changed.' },
];

const SAFETY_POINTS = [
  'Approval before spend or public action',
  'Every decision recorded in an audit log',
  'Sandbox mode on by default',
];

export default function Home() {
  return (
    <main className="liquid-shell min-h-screen overflow-x-hidden">
      <header className="liquid-topbar sticky top-0 z-50 mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <BrandMark href="/" size="md" ariaLabel="Sayso home" />
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

      <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[0.9fr,1.1fr] lg:gap-20 lg:px-12 lg:pb-32 lg:pt-24">
        <div className="max-w-xl">
          <div className="glass-chip animate-fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Voice-first marketing operations
          </div>
          <h1 className="animate-fade-up animation-delay-100 mt-7 text-balance font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.5rem]">
            Your AI marketing team,
            <span className="mt-2 block text-primary">one sentence away.</span>
          </h1>
          <p className="animate-fade-up animation-delay-200 mt-7 max-w-lg text-balance text-lg leading-relaxed text-muted-foreground">
            Speak naturally about the business problem in front of you. Sayso turns it into a plan,
            a team, and a measured next step — with your approval in the loop.
          </p>
          <div className="animate-fade-up animation-delay-300 mt-9 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <Button size="lg" className="h-12 px-7 text-base" asChild>
              <Link href="/register">
                Start talking — it&apos;s free <ArrowRight />
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">No card · no jargon · sandbox by default</span>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {['Speak', 'Review', 'Approve', 'Execute safely'].map((item, index) => (
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
          <LandingCommandFlow />
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="page-header mb-8">
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">The team bench</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Specialists with clear jobs.</h2>
            <p className="mt-3 max-w-xl text-muted-foreground">One operating system for the work you already know needs doing.</p>
          </div>
          <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex"><Bot className="h-4 w-4 text-primary" /> Built for small teams</span>
        </div>
        <div className="glass-panel overflow-hidden rounded-2xl">
          {SPECIALISTS.map(({ icon: Icon, name, detail }, index) => (
            <div key={name} className="glass-row flex items-center gap-4 px-5 py-4 sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
              </div>
              <span className="hidden text-xs font-medium text-muted-foreground sm:block">0{index + 1}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="glass-panel grid gap-8 rounded-3xl p-7 sm:p-10 lg:grid-cols-[0.75fr,1.25fr] lg:items-center lg:p-12">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight sm:text-3xl">Clear actions. Deliberate control.</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Sayso helps your team move faster without hiding the consequential moments.
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

      <section className="mx-auto max-w-3xl px-5 pb-28 text-center sm:px-8">
        <p className="text-sm font-medium text-primary">Start with the problem, not the platform.</p>
        <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">From one clear brief to a plan you control.</h2>
        <Button size="lg" className="mt-8 h-12 px-7 text-base" asChild>
          <Link href="/register">Create your team <ArrowRight /></Link>
        </Button>
      </section>

      <footer className="glass-divider-t">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8 lg:px-12">
          <BrandMark size="sm" />
          <span>Built for people who&apos;d rather run their business than learn ad platforms.</span>
        </div>
      </footer>
    </main>
  );
}
