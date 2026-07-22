'use client';

// Minimal button-based switch matching the shadcn look — no radix dependency.

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, className, ...props }, ref) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      ref={ref}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 shadow-sm transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'shadow-lg shadow-primary/30 vox-gradient' : 'glass-track',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-300',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  ),
);
Switch.displayName = 'Switch';

export { Switch };
