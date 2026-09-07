import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/brand-mark';
import { PricingTiers } from '@/components/pricing-tiers';

const FAQS = [
  { question: 'What period does a report cover?', answer: 'Live reports currently review provider account snapshots, typically about 30 days. Each report shows its source window. They do not calculate seven-day changes or compare equivalent prior periods yet. Verify account currency and totals before sharing.' },
  {
    question: 'What can I connect?',
    answer:
      'Perfexa currently connects to Google Ads, Meta, TikTok, GA4, and Google Search Console. The Growth pilot focuses on the live ad-account connections; analytics connections add context to the weekly readout.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Connections use read-only OAuth permissions where supported, and tokens are encrypted. Perfexa watches and explains what is happening; it cannot change live ad accounts, even after approval. Approved recommendations remain decisions for your team to implement in the ad platform.',
  },
  {
    question: 'What is the catch with the design-partner pricing?',
    answer:
      'The listed rates are planned monthly tiers. early-access pilot access is free during beta for operators who are willing to share useful feedback as the product gets sharper. You get direct access to the founder, and we ask for a little time and candor in return.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. The early-access pilot is free during beta, with no card and no long-term contract. If you stop, access ends when you choose.',
  },
  {
    question: 'What happens after I sign up?',
    answer:
      'We start with your brand context and the reporting rhythm you want. Then you connect the accounts you choose, review the first signals, and shape the weekly report around what is actually useful to you.',
  },
];

export default function PricingPage() {
  return (
    <main className="public-shell min-h-screen overflow-x-hidden">
      <header className="public-nav sticky top-0 z-50">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <BrandMark href="/" size="md" ariaLabel="Perfexa home" />
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Main navigation">
            <Link
              href="/"
              className="rounded-full px-3 py-2 text-sm font-medium text-[hsl(var(--ink))] hover:bg-[hsl(var(--ink)/0.05)]"
            >
              Product
            </Link>
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

      <section className="mx-auto max-w-6xl px-5 pb-20 pt-16 text-center sm:px-8 lg:pb-24 lg:pt-24">
        <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-[hsl(var(--ink)/0.1)] bg-white px-3.5 py-2 text-xs font-medium text-[hsl(var(--ink-soft))]">
          <span className="public-dot bg-[hsl(var(--coral))]" />
          Design partner pricing · early-access pilot
        </div>
        <h1 className="animate-fade-up animation-delay-100 mx-auto mt-8 max-w-3xl text-balance font-display text-[clamp(2.75rem,5.5vw,4.25rem)] font-semibold leading-[1.06] tracking-normal">
          Weekly performance reports,
          <span className="block text-[hsl(var(--coral))]">with planned pricing shown upfront.</span>
        </h1>
        <p className="animate-fade-up animation-delay-200 mx-auto mt-7 max-w-2xl text-balance text-lg leading-relaxed text-[hsl(var(--ink-soft))]">
          Start small, connect read-only ad accounts, and get an approval-ready weekly readout under your brand.
          the beta access is free while the first report workflow is being shaped.
        </p>
        <p className="animate-fade-up animation-delay-300 mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[hsl(var(--ink-soft))]">
          Start with your first report: connect an ad account, then decide whether the weekly readout is useful.
        </p>

        <div className="mx-auto mt-12 max-w-5xl text-left">
          <PricingTiers />
          <p className="mt-5 text-center text-xs text-[hsl(var(--ink-soft))]">
            Planned monthly rates are shown for transparency. early-access pilot access is free during beta, with no card
            required.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="public-card relative overflow-hidden p-7 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-12">
          <div className="absolute inset-x-8 top-0 h-px bg-[hsl(var(--ink)/0.12)]" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
              <span className="h-px w-6 bg-[hsl(var(--coral))]" /> Design Partner Program
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-normal sm:text-3xl">
              Free beta access now, founding rates later.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-[hsl(var(--ink-soft))]">
              We are working with a small group so we can stay close to every team. During beta, the pilot is free
              with no card required. The listed monthly rates are the planned founding rates after the beta period.
            </p>
          </div>
          <div className="relative mt-7 shrink-0 lg:mt-0">
            <Link href="/register?plan=growth" className="btn-pill btn-pill-ink h-12 px-7 text-base">
              Start free beta <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-center text-xs text-[hsl(var(--ink-soft))] lg:text-right">
              Create your workspace, then complete a short setup.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8" id="faq">
        <div className="grid gap-12 lg:grid-cols-[0.8fr,1.2fr] lg:gap-20">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--coral))]">
              The useful details
            </p>
            <h2 className="font-display text-3xl font-semibold tracking-normal sm:text-4xl">Questions worth asking.</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-[hsl(var(--ink-soft))]">
              A clear pilot is better than a polished promise. Here is what the first version actually includes.
            </p>
            <div className="mt-8 space-y-3">
              <div className="public-tile flex items-start gap-3 p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--mint))]" strokeWidth={2.5} />
                <p className="text-sm leading-relaxed">Live ad-account changes stay blocked, even after approval.</p>
              </div>
              <div className="public-tile flex items-start gap-3 p-4">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--ink))]" strokeWidth={2.5} />
                <p className="text-sm leading-relaxed">Encrypted tokens, with your reporting under your brand.</p>
              </div>
              <div className="public-tile flex items-start gap-3 p-4">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--coral))]" strokeWidth={2.5} />
                <p className="text-sm leading-relaxed">Direct feedback loop while the pilot stays intentionally small.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => (
              <details
                key={faq.question}
                className="public-card group rounded-[20px] px-5 py-4 open:bg-[hsl(var(--cream))]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold tracking-normal [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="mr-3 text-xs font-semibold text-[hsl(var(--coral))]">0{index + 1}</span>
                    {faq.question}
                  </span>
                  <span
                    className="text-xl font-normal text-[hsl(var(--ink-soft))] transition-transform group-open:rotate-45"
                    aria-hidden="true"
                  >
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-1 pl-8 pt-3 text-sm leading-relaxed text-[hsl(var(--ink-soft))]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-28 text-center sm:px-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--ink))] text-[hsl(var(--mint))]">
          <Check className="h-6 w-6" strokeWidth={2.5} />
        </span>
        <h2 className="mt-5 font-display text-3xl font-semibold tracking-normal sm:text-4xl">
          Start with the signal, not the software.
        </h2>
        <p className="mx-auto mt-3 max-w-md text-[hsl(var(--ink-soft))]">
          Choose a plan, connect what you need, and let the first weekly report show you where Perfexa is useful.
        </p>
        <Link href="/register?plan=growth" className="btn-pill btn-pill-ink mx-auto mt-8 h-12 px-7 text-base">
          Start free beta <ArrowRight className="h-4 w-4" />
        </Link>
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

