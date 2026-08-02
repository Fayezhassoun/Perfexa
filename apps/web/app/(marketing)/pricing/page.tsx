import Link from 'next/link';
import { ArrowRight, Check, LockKeyhole, MessageCircle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/brand-mark';
import { PricingTiers } from '@/components/pricing-tiers';

const FAQS = [
  {
    question: 'What can I connect?',
    answer:
      'GrowthCrew currently connects to Google Ads, Meta, TikTok, GA4, and Google Search Console. The Growth pilot focuses on the live ad-account connections; analytics connections add context to the weekly readout.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Connections use read-only OAuth permissions where supported, and tokens are encrypted. GrowthCrew watches and explains what is happening; it does not change live ads or spend money without your approval.',
  },
  {
    question: 'What is the catch with the design-partner pricing?',
    answer:
      'The pilot is priced for a small group of operators who are willing to share useful feedback as the product gets sharper. You get direct access to the founder, and we ask for a little time and candor in return.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. There is no long-term contract. Cancel before your next billing cycle and you will keep access through the period you already paid for.',
  },
  {
    question: 'What happens after I sign up?',
    answer:
      'We start with your brand context and the reporting rhythm you want. Then you connect the accounts you choose, review the first signals, and shape the weekly report around what is actually useful to you.',
  },
];

export default function PricingPage() {
  return (
    <main className="liquid-shell min-h-screen overflow-x-hidden">
      <header className="liquid-topbar sticky top-0 z-50 mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <BrandMark href="/" size="md" ariaLabel="GrowthCrew home" />
        <nav className="flex items-center gap-2" aria-label="Main navigation">
          <Button variant="ghost" asChild>
            <Link href="/">Product</Link>
          </Button>
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

      <section className="mx-auto max-w-[1440px] px-5 pb-20 pt-16 sm:px-8 lg:px-12 lg:pb-24 lg:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="glass-chip animate-fade-up inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Design partner pricing · live product
          </div>
          <h1 className="animate-fade-up animation-delay-100 mt-7 text-balance font-display text-5xl font-semibold leading-[1.02] tracking-tight sm:text-6xl lg:text-[4.25rem]">
            A sharper marketing week,
            <span className="mt-2 block text-primary">without another dashboard to babysit.</span>
          </h1>
          <p className="animate-fade-up animation-delay-200 mx-auto mt-7 max-w-2xl text-balance text-lg leading-relaxed text-muted-foreground">
            Start small, connect the accounts that matter, and get a useful weekly readout under your brand. Pick the
            level of operator support that fits how you work.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-6xl">
          <PricingTiers />
          <p className="mt-5 text-center text-xs text-muted-foreground">All plans are month-to-month. No card required to explore the pilot.</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
        <div className="glass-panel relative overflow-hidden rounded-3xl p-7 sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-12 lg:p-12">
          <div className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-2xl">
            <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">
              <span className="h-px w-6 bg-primary" /> Design Partner Program
            </div>
            <h2 className="mt-4 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              Founding pricing, direct founder access.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              We are keeping the pilot small enough to work closely with every team. In exchange for honest feedback,
              design partners get the founding rates while the product earns its sharp edges.
            </p>
          </div>
          <div className="relative mt-7 shrink-0 lg:mt-0">
            <Button size="lg" className="h-12 w-full px-7 text-base sm:w-auto" asChild>
              <Link href="/register?plan=growth">
                Start the conversation <ArrowRight />
              </Link>
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground lg:text-right">No hard sell. Just a fit check.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pb-24 sm:px-8 lg:px-12" id="faq">
        <div className="grid gap-12 lg:grid-cols-[0.8fr,1.2fr] lg:gap-20">
          <div>
            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">The useful details</p>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Questions worth asking.</h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              A clear pilot is better than a polished promise. Here is what the first version actually includes.
            </p>
            <div className="mt-8 space-y-3">
              <div className="glass-tile flex items-start gap-3 rounded-2xl p-4">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <p className="text-sm leading-relaxed">Read-only connections and approval before action.</p>
              </div>
              <div className="glass-tile flex items-start gap-3 rounded-2xl p-4">
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed">Encrypted tokens, with your reporting under your brand.</p>
              </div>
              <div className="glass-tile flex items-start gap-3 rounded-2xl p-4">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <p className="text-sm leading-relaxed">Direct feedback loop while the pilot stays intentionally small.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {FAQS.map((faq, index) => (
              <details key={faq.question} className="glass-panel group rounded-2xl px-5 py-4 open:bg-[color:var(--glass-bg-strong)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="mr-3 font-mono text-xs font-medium text-primary">0{index + 1}</span>
                    {faq.question}
                  </span>
                  <span className="text-xl font-normal text-muted-foreground transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="max-w-2xl pb-1 pl-8 pt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-28 text-center sm:px-8">
        <Check className="mx-auto h-6 w-6 text-emerald-500" />
        <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Start with the signal, not the software.</h2>
        <p className="mx-auto mt-3 max-w-md text-muted-foreground">
          Choose a plan, connect what you need, and let the first weekly report show you where GrowthCrew earns its keep.
        </p>
        <Button size="lg" className="mt-8 h-12 px-7 text-base" asChild>
          <Link href="/register?plan=growth">
            Start the pilot <ArrowRight />
          </Link>
        </Button>
      </section>

      <footer className="glass-divider-t">
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:px-8 lg:px-12">
          <BrandMark size="sm" />
          <span>Built for people who would rather run their business than babysit their ads.</span>
        </div>
      </footer>
    </main>
  );
}
