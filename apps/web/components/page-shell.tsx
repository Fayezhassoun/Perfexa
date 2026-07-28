import * as React from 'react';
import { cn } from '@/lib/utils';

export function PageShell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('page-shell animate-page-in', className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('page-header', className)}>
      <div>
        {eyebrow && <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
        <h1 className="font-display font-semibold tracking-tight">{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SectionGrid({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('section-grid', className)} {...props} />;
}

export function MetricCard({
  label,
  value,
  detail,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('glass-panel metric-card p-4', className)}>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function DataPanel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('data-panel', className)} {...props} />;
}

export function StatusChip({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('status-chip', className)} {...props} />;
}
