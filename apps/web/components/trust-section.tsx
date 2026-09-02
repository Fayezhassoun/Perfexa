import Link from 'next/link';
import { ArrowRight, BadgePercent, FileText, Handshake, KeyRound, MessageCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PARTNER_PERKS = [
  {
    icon: BadgePercent,
    tone: 'bg-primary/12 text-primary',
    title: 'Founding rates, locked',
    body: 'The pilot price stays yours for as long as you stay on the pilot.',
  },
  {
    icon: MessageCircle,
    tone: 'bg-sky-500/12 text-sky-500',
    title: 'A direct line to the founder',
    body: 'Feedback goes straight to the person building it — and ships in days, not quarters.',
  },
  {
    icon: Handshake,
    tone: 'bg-emerald-500/12 text-emerald-500',
    title: 'First in line',
    body: 'New engines and report formats land in your account before anywhere else.',
  },
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    tone: 'bg-emerald-500/12 text-emerald-500',
    title: 'Read-only by design',
    body: "OAuth connections can't change live ads or move spend. The crew watches and drafts — you decide.",
  },
  {
    icon: KeyRound,
    tone: 'bg-primary/12 text-primary',
    title: 'Encrypted, revocable',
    body: 'Access tokens are encrypted at rest. Disconnect any account, any time.',
  },
  {
    icon: UserCheck,
    tone: 'bg-amber-500/12 text-amber-500',
    title: 'Approval on every dollar',
    body: 'Anything that spends money or goes public waits for your yes — then lands in an audit log.',
  },
  {
    icon: FileText,
    tone: 'bg-sky-500/12 text-sky-500',
    title: 'Your brand on the report',
    body: 'Client dashboards and weekly reports carry your name and colors — never ours.',
  },
];

export function TrustSection() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
      <div className="page-header mb-10">
        <div>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">The trust layer</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            No black box. No write access. No fine print.
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Perfexa is built to be handed the keys to your ad accounts — and to never be able to turn them.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Design Partner Program — featured */}
        <div className="glass-panel relative overflow-hidden rounded-3xl p-7 sm:p-10 lg:col-span-5">
          <div className="absolute -right-24 -top-28 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <div className="glass-chip inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-muted-foreground">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              Design Partner Program
            </div>
            <h3 className="mt-5 font-display text-2xl font-semibold tracking-tight">
              Founding pricing and direct founder access — a pilot kept small on purpose.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              We&apos;re onboarding a small group of agencies and operators to shape the product while it earns its
              sharp edges. In exchange for honest feedback, design partners get:
            </p>
            <div className="mt-6 space-y-3">
              {PARTNER_PERKS.map(({ icon: Icon, tone, title, body }) => (
                <div key={title} className="glass-tile flex items-start gap-3.5 rounded-2xl p-4">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-7" asChild>
              <Link href="/pricing">
                See partner pricing <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        {/* Trust points */}
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {TRUST_POINTS.map(({ icon: Icon, tone, title, body }) => (
            <div key={title} className="glass-panel rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        No logo wall yet — we&apos;re earning it. Everything on this page is a product fact, not a projection.
      </p>
    </section>
  );
}
