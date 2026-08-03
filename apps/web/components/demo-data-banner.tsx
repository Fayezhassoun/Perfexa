import { cn } from '@/lib/utils';

// Shown on every surface that renders simulated numbers (demo-data mode).
// Simulated data must never be presented as real — keep this label visible.
export const DEMO_DATA_LABEL = 'Demo data — connect your account for live numbers.';

export function DemoDataBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      data-testid="demo-data-banner"
      className={cn(
        'flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-800 dark:text-amber-200',
        className,
      )}
    >
      <span aria-hidden="true">⚠️</span>
      <span>{DEMO_DATA_LABEL}</span>
    </div>
  );
}
