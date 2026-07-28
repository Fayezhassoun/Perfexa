import {
  ArrowRight,
  Check,
  Megaphone,
  Mic,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

const EQ_BARS = [0.45, 0.8, 0.6, 1, 0.72, 0.5, 0.9, 0.62];

const SPECIALISTS = [
  {
    icon: Search,
    name: 'SEO',
    action: 'Find technical blockers',
  },
  {
    icon: Megaphone,
    name: 'Google Ads',
    action: 'Draft a budgeted campaign',
  },
  {
    icon: Users,
    name: 'Lead Capture',
    action: 'Add a conversion path',
  },
];

function Waveform() {
  return (
    <div className="voice-wave flex h-7 items-center gap-[3px]" aria-hidden="true">
      {EQ_BARS.map((height, index) => (
        <span
          key={index}
          className="animate-eq w-[3px] rounded-full bg-current"
          style={{ height: `${height * 24}px`, animationDelay: `${index * 100}ms` }}
        />
      ))}
    </div>
  );
}

export function LandingCommandFlow() {
  return (
    <section
      aria-labelledby="landing-command-flow-title"
      className="glass-panel w-full max-w-5xl overflow-hidden rounded-3xl p-5 text-left sm:p-7"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Command flow preview
          </p>
          <h2 id="landing-command-flow-title" className="mt-1 text-lg font-semibold sm:text-xl">
            One clear brief. A plan you can review.
          </h2>
        </div>
          <span className="glass-chip inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          Preview only
        </span>
      </div>

      <ol className="mt-6 grid gap-3 md:grid-cols-3 md:gap-4" aria-label="Sayso command flow">
        <li aria-label="Voice brief: Brief captured" className="glass-tile rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <span className="voice-orb flex h-10 w-10 items-center justify-center rounded-xl text-[color:hsl(var(--voice))]">
              <Mic className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            <Waveform />
          </div>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            01 · Voice brief
          </p>
          <p className="mt-2 text-sm leading-relaxed sm:text-base">
            “I need more qualified leads from my website.”
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Brief captured
          </span>
        </li>

        <li aria-label="Plan formed: 3 specialists proposed" className="glass-tile rounded-2xl p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
              <ArrowRight className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                02 · Plan formed
              </p>
              <p className="mt-1 text-xs font-medium text-emerald-500">3 specialists proposed</p>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            {SPECIALISTS.map(({ icon: Icon, name, action }) => (
              <div key={name} className="glass-subtle flex items-center gap-3 rounded-xl p-3">
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{action}</p>
                </div>
              </div>
            ))}
          </div>
        </li>

        <li
          aria-label="Approval gate: Nothing runs until you approve the plan"
          className="glass-tile flex flex-col rounded-2xl p-4 sm:p-5"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/15 text-amber-500">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            03 · Approval gate
          </p>
          <p className="mt-2 text-sm font-medium leading-relaxed sm:text-base">
            Nothing runs until you approve the plan.
          </p>
          <button
            type="button"
            disabled
            aria-label="Review plan preview control"
            className="btn-glass mt-auto flex h-10 w-full cursor-default items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-foreground opacity-100 disabled:opacity-100"
          >
            Review plan
            <span className="text-xs font-normal text-muted-foreground">Preview</span>
          </button>
        </li>
      </ol>

      <p className="mt-5 border-t border-foreground/10 pt-4 text-xs leading-relaxed text-muted-foreground">
        Illustrative product preview — review and approval stay with you.
      </p>
    </section>
  );
}
