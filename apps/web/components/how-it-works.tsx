import { ArrowRight, FileText, Plug, ScanEye, ShieldCheck } from 'lucide-react';

const STEPS = [
  {
    icon: Plug,
    tone: 'bg-primary/12 text-primary',
    step: '01',
    label: 'Connect',
    title: 'Connect your ad accounts',
    body: 'Read-only OAuth for Google, Meta, TikTok, and GA4. No passwords shared, no write access granted.',
    chip: '~5 minutes',
  },
  {
    icon: ScanEye,
    tone: 'bg-amber-500/12 text-amber-500',
    step: '02',
    label: 'Watch',
    title: 'The crew watches and drafts',
    body: 'Anomalies, creative fatigue, and competitor moves surface with a suggested fix attached — around the clock.',
    chip: '24/7',
  },
  {
    icon: FileText,
    tone: 'bg-emerald-500/12 text-emerald-500',
    step: '03',
    label: 'Prove',
    title: 'Prove value weekly',
    body: "A white-label report goes out under your brand — spend, wins, and what's next, in plain language.",
    chip: 'Every week',
  },
];

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-[1440px] px-5 pb-24 sm:px-8 lg:px-12">
      <div className="page-header mb-10">
        <div>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">How it works</p>
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Live in minutes. Watching from day one.
          </h2>
          <p className="mt-3 max-w-xl text-muted-foreground">
            Three steps between you and a marketing week that runs itself — with your name on the report.
          </p>
        </div>
        <span className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <ShieldCheck className="h-4 w-4 text-emerald-500" /> Nothing acts without you
        </span>
      </div>

      <ol className="grid gap-4 md:grid-cols-3" aria-label="How Perfexa works">
        {STEPS.map(({ icon: Icon, tone, step, label, title, body, chip }, index) => (
          <li
            key={step}
            className="glass-panel relative rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1"
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <span className="font-mono text-primary">{step}</span> · {label}
            </p>
            <h3 className="mt-2 font-display text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            <span className="mt-4 inline-flex items-center rounded-full border border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] px-2.5 py-1 text-[0.68rem] font-medium text-muted-foreground">
              {chip}
            </span>
            {index < STEPS.length - 1 && (
              <ArrowRight
                className="absolute -right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/50 md:block"
                aria-hidden="true"
              />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
