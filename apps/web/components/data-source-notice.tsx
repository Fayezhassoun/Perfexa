import Link from 'next/link';
import { Activity, ArrowRight, FlaskConical, Radio, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DataSource = 'none' | 'live' | 'sandbox' | 'mixed';

const SOURCE_COPY: Record<
  DataSource,
  { label: string; description: string; className: string; icon: typeof Activity }
> = {
  none: {
    label: 'Setup needed',
    description:
      'No campaign data has been synced yet. Connect a read-only ad account, switch it to live, then use Sync now before treating this workspace as customer evidence.',
    className: 'border-slate-300/70 bg-slate-500/5 text-slate-700 dark:border-slate-700 dark:text-slate-300',
    icon: Activity,
  },
  live: {
    label: 'Live account data',
    description: 'These campaign metrics come from a stored sync of a connected live account.',
    className: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300',
    icon: Radio,
  },
  sandbox: {
    label: 'Sandbox data',
    description: 'This workspace contains simulated or sandbox campaign data. It is for testing only, not customer evidence.',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    icon: FlaskConical,
  },
  mixed: {
    label: 'Mixed data sources',
    description: 'This view combines live and sandbox campaign rows. Review each campaign mode before sharing results.',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    icon: RefreshCw,
  },
};

export function DataSourceNotice({
  source,
  className,
  actionHref,
  actionLabel,
}: {
  source: DataSource;
  className?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const copy = SOURCE_COPY[source];
  const Icon = copy.icon;

  return (
    <div
      role="note"
      data-testid={`data-source-${source}`}
      className={cn('flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between', copy.className, className)}
    >
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{copy.label}</p>
          <p className="mt-0.5 text-xs leading-5 opacity-90">{copy.description}</p>
        </div>
      </div>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline sm:mt-1">
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
