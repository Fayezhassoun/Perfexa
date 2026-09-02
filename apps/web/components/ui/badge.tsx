import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'badge-glass inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-300',
  {
    variants: {
      variant: {
        default: 'border-primary/30 bg-primary/90 text-primary-foreground',
        secondary: 'border-[color:var(--glass-border)] bg-[color:var(--glass-bg-subtle)] text-secondary-foreground',
        destructive: 'border-destructive/30 bg-destructive/85 text-destructive-foreground',
        outline: 'border-[color:var(--glass-border-strong)] bg-transparent text-foreground',
        success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        warning: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
