import Link from 'next/link';
import { ArrowRight, Bell, CheckCircle2, FileText, Plug, Radar, ScanEye, ShieldCheck, Sparkles } from 'lucide-react';
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
    fact: 'Track how configured AI search engines cite your brand, with missing providers shown honestly.',
    quip: 'Provider state stays visible.',
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
    body: 'Connect available Google Ads, Meta, or TikTok integrations through OAuth. Live ad-account changes are blocked in Perfexa. Use a read-only account role where supported.',
    chip: 'Your account, your control',
  },
  {
    icon: ScanEye,
    step: '02',
    label: 'Watch',
    body: 'Review synced campaign snapshots and alerts. Check the source dates before interpreting changes.',
    chip: 'Weekly scan + alerts',
  },
  {
    icon: FileText,
    step: '03',
    label: 'Report',
    body: 'Generate a clear account review under your brand. Verify the reporting window and totals before sharing.',
    chip: 'Every week',
  },
];

const GEO_ENGINES = [
  { name: 'Perplexity', dot: 'bg-[hsl(var(--mint))]' },
  { name: 'Gemini', dot: 'bg-[hsl(var(--coral))]' },
  { name: 'ChatGPT', dot: 'bg-[hsl(var(--cream))]' },
];

const SAMPLE_REPORT_ROWS = [
  {
    label: 'Data source',
    value: 'Sample ad account rows, sandbox mode',
  },
  {
    label: 'Top signal',
    value: 'One campaign is spending without conversions',
  },
  {
    label: 'Decision',
    value: 'Draft a budget shift for human approval',
  },
];

export default function Home() {
  return (
    <main className="public-shell min-h-screen overflow-x-hidden">
      {/* Nav */}
      <header className="public-nav sticky top-0 z-50">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark href="/" size="md" ariaLabel="Perfexa home" />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
            <Link href="#product" className="hidden rounded-full px-3 py-2 text-sm font-medium sm:block">Product</Link>
            <Link href="/pricing" className="hidden rounded-full px-3 py-2 text-sm font-medium sm:block">Pricing</Link>
            <Link
              href="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-[hsl(var(--ink))] hover:bg-[hsl(var(--ink)/0.05)]"
            >
              Sign in
            </Link>
            <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-10 px-5 text-sm">
              Start free beta
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 lg:pb-24 lg:pt-14">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[hsl(var(--ink)/0.1)] bg-white px-3.5 py-2 text-xs font-medium text-[hsl(var(--ink-soft))]">
          <span className="public-dot bg-[hsl(var(--coral))]" />
          Early access · free during beta · no card
        </div>
        <h1 className="animate-fade-up animation-delay-100 mt-8 max-w-4xl text-balance font-display text-[clamp(2.5rem,5.2vw,4.4rem)] font-semibold leading-[1.06] tracking-normal">
          Know what needs your attention. Decide with confidence.
        </h1>
        <p className="animate-fade-up animation-delay-200 mt-7 max-w-xl text-balance text-lg leading-relaxed text-[hsl(var(--ink-soft))]">
          Bring account performance, priority signals, and reports into one workspace. Review the evidence, agree on the next move, and keep your team in control.
        </p>
        <div className="animate-fade-up animation-delay-300 mt-9 flex flex-col gap-4 sm:flex-row">
          <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-12 px-7 text-base">
            Start free beta <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="text-sm font-medium text-[hsl(var(--ink-soft))] underline-offset-4 hover:text-[hsl(var(--ink))] hover:underline"
          >
            See pricing
          </Link>
        </div>
        <p className="animate-fade-up animation-delay-300 mt-5 text-sm text-[hsl(var(--ink-soft))]">
          No card required during beta · live accounts stay read-only
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-[hsl(var(--ink-soft))]">Live reports review the provider’s account snapshot, typically about 30 days. The source window is shown in your report.</p>

        <div className="animate-fade-up animation-delay-300 mt-12 grid gap-4 text-left lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
          <article className="public-card p-5 sm:p-6" aria-label="Sample performance report">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--coral))]">
                  Sample performance report
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold tracking-normal">What changed, what to do next.</h2>
              </div>
              <span className="rounded-full border border-[hsl(var(--ink)/0.12)] bg-[hsl(var(--cream))] px-3 py-1 text-xs font-medium text-[hsl(var(--ink-soft))]">
                Sample data · not customer evidence
              </span>
            </div>
            <p className="mt-5 text-sm leading-relaxed text-[hsl(var(--ink-soft))]">
              An example report can highlight the strongest signal, the risky spend pattern, and the next move
              that needs approval for your team to review. Perfexa does not change live ad accounts.
            </p>
            <div className="mt-5 space-y-2">
              {SAMPLE_REPORT_ROWS.map((row) => (
                <div key={row.label} className="public-tile flex items-start gap-3 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mint))]" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--ink-soft))]">{row.label}</p>
                    <p className="mt-0.5 text-sm">{row.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="public-panel-ink p-5 sm:p-6" aria-label="Approval row example">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--mint))]">Approval row</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-normal">Diagnosis does not become action by itself.</h2>
            <div className="mt-6 rounded-[10px] border border-[hsl(var(--cream)/0.18)] bg-[hsl(var(--cream)/0.06)] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[hsl(var(--coral))] px-2.5 py-1 text-xs font-semibold text-white">Waiting for approval</span>
                <span className="text-xs text-[hsl(var(--cream)/0.66)]">Live accounts stay read-only</span>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--cream)/0.8)]">
                Draft: move budget from the weak campaign into the best-performing channel after a human review.
              </p>
              <Link href="/register?plan=growth" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--mint))]">
                Start with your first report <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        </div>
      </section>

      {/* Product card row */}
      <section id="product" className="mx-auto max-w-6xl scroll-mt-24 px-5 pb-24 sm:px-8 lg:pb-28">
        <div className="mb-10 max-w-2xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
            Built for the work you do
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

      {/* How Perfexa works */}
      <section className="border-y border-[hsl(var(--ink)/0.07)] bg-[hsl(var(--cream-deep))]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-28">
          <div className="mb-10 max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
              How Perfexa works
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
              The visibility dashboard tracks configured engines and labels missing providers clearly. It does not
              fill gaps with simulated results.
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
              Design Partner Program · Early access
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
                Start free beta <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <p className="mt-5 text-xs text-[hsl(var(--ink-soft))]">No card required during beta · read-only connections</p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[hsl(var(--ink-soft))]">
          Live reports currently summarize provider account snapshots, typically covering about 30 days. Each report identifies its source window; these are not seven-day performance comparisons.
        </p>
      </section>

      <footer className="border-t border-[hsl(var(--ink)/0.08)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-[hsl(var(--ink-soft))] sm:flex-row sm:px-8">
          <BrandMark size="sm" />
          <span>Built for people who would rather run their business than babysit their ads.</span>
        </div>
      </footer>
    </main>
  );
}

