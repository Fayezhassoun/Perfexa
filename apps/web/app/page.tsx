import Link from 'next/link';
import { ArrowRight, Bell, FileText, Plug, Radar, ScanEye, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';

const PRODUCT_CARDS = [
  {
    icon: FileText,
    tile: 'bg-[linear-gradient(135deg,hsl(88_25%_60%),hsl(var(--mint))_52%,hsl(96_24%_34%))]',
    name: 'Weekly Report',
    fact: 'A client-ready weekly readout of your ad accounts, under your brand.',
    quip: 'Your name on it. Not ours.',
  },
  {
    icon: Radar,
    tile: 'bg-[linear-gradient(135deg,hsl(18_92%_64%),hsl(var(--coral))_55%,hsl(2_74%_54%))]',
    name: 'AI Visibility',
    fact: 'Track how Perplexity, Gemini, and ChatGPT cite your brand. Real engines, live.',
    quip: 'Three engines, zero guessing.',
  },
  {
    icon: Bell,
    tile: 'bg-[linear-gradient(135deg,hsl(163_40%_26%),hsl(var(--ink)))]',
    name: 'Alerts & Guardian',
    fact: 'Read-only watching. Anything that becomes an action waits for your approval.',
    quip: 'All eyes. No hands.',
  },
];

const STEPS = [
  {
    icon: Plug,
    step: '01',
    label: 'Connect',
    body: 'Read-only OAuth for Google Ads, Meta, TikTok, and GA4. No passwords shared, no write access granted.',
    chip: '~5 minutes',
  },
  {
    icon: ScanEye,
    step: '02',
    label: 'Watch',
    body: 'A weekly scan of your accounts, plus alerts when something needs your eyes.',
    chip: 'Weekly scan + alerts',
  },
  {
    icon: FileText,
    step: '03',
    label: 'Report',
    body: 'A client-ready readout under your brand, in plain language. Review it, send it.',
    chip: 'Every week',
  },
];

const GEO_ENGINES = [
  { name: 'Perplexity', dot: 'bg-[hsl(var(--mint))]' },
  { name: 'Gemini', dot: 'bg-[hsl(var(--coral))]' },
  { name: 'ChatGPT', dot: 'bg-[hsl(var(--cream))]' },
];

export default function Home() {
  return (
    <main className="public-shell min-h-screen overflow-x-hidden">
      {/* Nav */}
      <header className="public-nav sticky top-0 z-50">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark href="/" size="md" ariaLabel="Perfexa home" />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
            <Link
              href="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-[hsl(var(--ink))] hover:bg-[hsl(var(--ink)/0.05)]"
            >
              Sign in
            </Link>
            <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-10 px-5 text-sm">
              Start the pilot
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-16 text-center sm:px-8 lg:pb-32 lg:pt-24">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[hsl(var(--ink)/0.1)] bg-white px-3.5 py-2 text-xs font-medium text-[hsl(var(--ink-soft))]">
          <span className="public-dot bg-[hsl(var(--coral))]" />
          Gate-1 pilot · free during beta · no card
        </div>
        <h1 className="animate-fade-up animation-delay-100 mx-auto mt-8 max-w-4xl text-balance font-display text-[clamp(2.8rem,6vw,5.25rem)] font-semibold leading-[1.06] tracking-normal">
          AI operating support for
          <span className="headline-chip headline-chip-coral" aria-hidden="true">
            <Zap strokeWidth={2.5} />
          </span>
          performance marketers
          <span className="headline-chip headline-chip-mint" aria-hidden="true">
            <Sparkles strokeWidth={2.5} />
          </span>
          with approval built in.
        </h1>
        <p className="animate-fade-up animation-delay-200 mx-auto mt-7 max-w-xl text-balance text-lg leading-relaxed text-[hsl(var(--ink-soft))]">
          Perfexa plugs into your ad accounts read-only, watches performance, and writes a client-ready weekly
          report under your brand.
        </p>
        <div className="animate-fade-up animation-delay-300 mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-12 px-7 text-base">
            Start the pilot <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-[hsl(var(--ink-soft))] underline-offset-4 hover:text-[hsl(var(--ink))] hover:underline"
          >
            See pricing
          </Link>
        </div>
        <p className="animate-fade-up animation-delay-300 mt-5 text-sm text-[hsl(var(--ink-soft))]">
          No card required during beta · read-only connections
        </p>
      </section>

      {/* Product card row */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 lg:pb-28">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
            What the crew ships
          </p>
          <h2 className="font-display text-3xl font-semibold tracking-normal sm:text-4xl">Work, not another dashboard.</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {PRODUCT_CARDS.map(({ icon: Icon, tile, name, fact, quip }) => (
            <Link
              key={name}
              href="/register?plan=growth"
              className="public-card public-lift group flex flex-col overflow-hidden rounded-[var(--public-radius)]"
            >
              <div className={`relative flex h-32 items-center justify-center ${tile}`} aria-hidden="true">
                <span className="absolute inset-x-8 top-0 h-px bg-white/35" />
                <span className="absolute inset-x-10 bottom-0 h-px bg-black/10" />
                <Icon className="relative h-9 w-9 text-white transition-transform duration-300 group-hover:scale-110" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <h3 className="font-display text-lg font-semibold tracking-normal">{name}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-[hsl(var(--ink-soft))]">{fact}</p>
                <p className="mt-5 text-xs font-medium text-[hsl(var(--ink-soft))]">{quip}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How the crew works */}
      <section className="border-y border-[hsl(var(--ink)/0.07)] bg-[hsl(var(--cream-deep))]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
          <div className="mb-10 max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
              How the crew works
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-normal sm:text-4xl">Connect. Watch. Report.</h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3" aria-label="How Perfexa works">
            {STEPS.map(({ icon: Icon, step, label, body, chip }, index) => (
              <li key={step} className="public-card relative rounded-[var(--public-radius)] p-6">
                <div className="flex items-center justify-between">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--ink))] text-[hsl(var(--cream))]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-sans text-sm font-semibold text-[hsl(var(--ink)/0.35)]">{step}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold tracking-normal">{label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--ink-soft))]">{body}</p>
                <span className="mt-5 inline-flex rounded-full border border-[hsl(var(--ink)/0.12)] bg-[hsl(var(--cream))] px-2.5 py-1 text-[0.68rem] font-medium text-[hsl(var(--ink-soft))]">
                  {chip}
                </span>
                {index < STEPS.length - 1 && (
                  <ArrowRight
                    className="absolute -right-5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-[hsl(var(--ink)/0.3)] md:block"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* AI visibility */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
        <div className="public-panel-ink relative overflow-hidden p-7 sm:p-10 lg:p-14">
          <div className="absolute inset-x-0 top-0 h-px bg-[hsl(var(--cream)/0.3)]" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--mint))]">
              AI visibility
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-normal sm:text-4xl">
              Your buyers ask AI about you. Know what it says.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-[hsl(var(--cream)/0.75)]">
              The visibility dashboard tracks how three real engines mention your brand. Live today, with no simulated
              results.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {GEO_ENGINES.map(({ name, dot }) => (
                <span key={name} className="engine-pill">
                  <span className={`public-dot ${dot}`} />
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Design partner pilot + final CTA */}
      <section className="mx-auto max-w-4xl px-5 pb-28 sm:px-8">
        <div className="public-card relative overflow-hidden px-7 py-12 text-center sm:px-12 sm:py-16">
          <div className="absolute inset-x-8 top-0 h-px bg-[hsl(var(--ink)/0.12)]" aria-hidden="true" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--ink)/0.1)] bg-[hsl(var(--cream))] px-3.5 py-2 text-xs font-medium text-[hsl(var(--ink-soft))]">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--coral))]" />
              Design Partner Program · Gate-1 pilot
            </div>
            <h2 className="mx-auto mt-6 max-w-xl text-balance font-display text-3xl font-semibold tracking-normal sm:text-4xl">
              The pilot is small. The work is real.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-balance leading-relaxed text-[hsl(var(--ink-soft))]">
              We are onboarding a small group of agencies and operators to shape the product. In exchange for honest
              feedback: founding rates, a direct line to the founder, and first look at new engines.
            </p>
            <div className="mt-8 flex justify-center">
              <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-12 px-7 text-base">
                Start the pilot <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-[hsl(var(--ink-soft))]">No card required during beta · read-only connections</p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[hsl(var(--ink-soft))]">
          No logo wall yet. We are earning it. Everything on this page is a product fact, not a projection.
        </p>
      </section>

      <footer className="border-t border-[hsl(var(--ink)/0.08)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-[hsl(var(--ink-soft))] sm:flex-row sm:px-8">
          <BrandMark size="sm" />
          <span>Built for people who&apos;d rather run their business than babysit their ads.</span>
        </div>
      </footer>
    </main>
  );
}
