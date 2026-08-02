import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type PricingTier = {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  popular?: boolean;
};

const TIERS: PricingTier[] = [
  {
    name: 'Starter',
    price: '$19',
    description: 'A low-friction way to put an AI strategist on your weekly rhythm.',
    features: ['AI strategist', 'Weekly reports', 'Alerts', '1 brand'],
    cta: 'Start pilot',
    href: '/register?plan=starter',
  },
  {
    name: 'Growth',
    price: '$49',
    description: 'The pilot fit: live ad signals and a client-ready report under your brand.',
    features: [
      'Everything in Starter',
      'Live Google Ads, Meta, and TikTok connections',
      'White-label client report portal',
    ],
    cta: 'Start pilot',
    href: '/register?plan=growth',
    popular: true,
  },
  {
    name: 'Agency',
    price: '$99',
    description: 'For small teams managing several brands and wanting room to grow.',
    features: ['Everything in Growth', 'Team seats', 'Multi-brand workspace', 'Priority support'],
    cta: 'Book a call',
    href: '/register?plan=agency',
  },
];

function PricingTierCard({ tier }: { tier: PricingTier }) {
  return (
    <article
      className={`glass-panel flex h-full flex-col rounded-3xl p-6 sm:p-7 ${
        tier.popular
          ? 'border-primary/50 bg-primary/[0.07] shadow-[0_0_42px_-18px_hsl(var(--primary)/0.72)]'
          : ''
      }`}
    >
      {tier.popular ? (
        <div className="mb-6 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary">
          <Sparkles className="h-3.5 w-3.5" /> Most popular
        </div>
      ) : (
        <div className="mb-6 h-7" aria-hidden="true" />
      )}

      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">{tier.name}</p>
        <div className="mt-4 flex items-end gap-2">
          <span className="font-display text-5xl font-semibold tracking-[-0.06em]">{tier.price}</span>
          <span className="mb-2 text-sm text-muted-foreground">/ month</span>
        </div>
        <p className="mt-4 min-h-[3.5rem] text-sm leading-relaxed text-muted-foreground">{tier.description}</p>
      </div>

      <div className="my-7 h-px bg-[color:var(--glass-divider)]" />

      <ul className="space-y-3.5 text-sm">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-500">
              <Check className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <span className="leading-relaxed">{feature}</span>
          </li>
        ))}
      </ul>

      <Button className="mt-8 h-11 w-full" variant={tier.popular ? 'default' : 'outline'} asChild>
        <Link href={tier.href}>
          {tier.cta} <ArrowRight />
        </Link>
      </Button>
    </article>
  );
}

export function PricingTiers() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {TIERS.map((tier) => (
        <PricingTierCard key={tier.name} tier={tier} />
      ))}
    </div>
  );
}
