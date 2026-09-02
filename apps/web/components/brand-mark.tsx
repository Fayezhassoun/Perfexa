import React, { useId } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export interface BrandMarkIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  className?: string;
  gradientId?: string;
}

export function BrandMarkIcon({
  size = 32,
  className = '',
  gradientId,
  ...props
}: BrandMarkIconProps) {
  const generatedId = useId();
  const id = gradientId || `growthcrew-orb-${generatedId.replace(/:/g, '')}`;
  const bgGradId = `${id}-bg`;
  const waveGradId = `${id}-wave`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0 select-none transition-transform duration-200 group-hover:scale-105', className)}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient id={bgGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#243F34" />
          <stop offset="52%" stopColor="#18342B" />
          <stop offset="100%" stopColor="#0F2E26" />
        </linearGradient>
        <linearGradient id={waveGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F2664A" />
          <stop offset="100%" stopColor="#A2A969" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="28" height="28" rx="7.5" fill={`url(#${bgGradId})`} />

      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="7"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.24"
        strokeWidth="1"
      />

      <path
        d="M 8 12.6 C 12.2 9.7, 19.8 9.7, 24 12.6"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.62"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <path
        d="M 8 19.4 C 12.2 22.3, 19.8 22.3, 24 19.4"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.62"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      <circle cx="6.5" cy="16" r="1.25" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="25.5" cy="16" r="1.25" fill="#FFFFFF" fillOpacity="0.9" />

      <rect x="10.5" y="11.5" width="2.25" height="9" rx="1.125" fill={`url(#${waveGradId})`} />
      <rect x="14.875" y="8.5" width="2.25" height="15" rx="1.125" fill={`url(#${waveGradId})`} />
      <rect x="19.25" y="11.5" width="2.25" height="9" rx="1.125" fill={`url(#${waveGradId})`} />
    </svg>
  );
}

export interface BrandMarkProps {
  layout?: 'full' | 'mark' | 'compact';
  size?: 'sm' | 'md' | 'lg' | number;
  wordmark?: string;
  descriptor?: string;
  showDescriptor?: boolean;
  href?: string;
  ariaLabel?: string;
  className?: string;
  markClassName?: string;
  textClassName?: string;
}

export function BrandMark({
  layout = 'full',
  size = 'md',
  wordmark = 'Perfexa',
  descriptor,
  showDescriptor = false,
  href,
  ariaLabel,
  className,
  markClassName,
  textClassName,
}: BrandMarkProps) {
  let iconSize = 32;
  let wordmarkClass = 'text-lg font-semibold tracking-normal';
  let descriptorClass = 'text-xs text-muted-foreground';

  if (typeof size === 'number') {
    iconSize = size;
    if (size <= 24) {
      wordmarkClass = 'text-sm font-semibold tracking-normal';
      descriptorClass = 'text-[10px] text-muted-foreground';
    } else if (size >= 40) {
      wordmarkClass = 'text-xl font-bold tracking-normal';
      descriptorClass = 'text-xs text-muted-foreground';
    }
  } else {
    switch (size) {
      case 'sm':
        iconSize = 24;
        wordmarkClass = 'text-sm font-semibold tracking-normal';
        descriptorClass = 'text-[10px] text-muted-foreground';
        break;
      case 'lg':
        iconSize = 40;
        wordmarkClass = 'text-xl font-bold tracking-normal';
        descriptorClass = 'text-xs text-muted-foreground';
        break;
      case 'md':
      default:
        iconSize = 32;
        wordmarkClass = 'text-lg font-semibold tracking-normal';
        descriptorClass = 'text-xs text-muted-foreground';
        break;
    }
  }

  const labelText = ariaLabel || (layout === 'mark' ? wordmark : `${wordmark}${descriptor ? ` - ${descriptor}` : ''}`);

  const content = (
    <span
      className={cn(
        'group inline-flex items-center gap-2.5 select-none',
        layout === 'compact' && 'gap-2',
        className,
      )}
    >
      <BrandMarkIcon size={iconSize} className={markClassName} />
      {layout !== 'mark' && (
        <span className={cn('flex flex-col justify-center leading-none', textClassName)}>
          <span className={cn('font-display growthcrew-wordmark', wordmarkClass)}>{wordmark}</span>
          {(showDescriptor || descriptor) && (
            <span className={cn('mt-0.5 growthcrew-descriptor', descriptorClass)}>
              {descriptor || 'AI Marketing Team'}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label={labelText} className="inline-flex items-center no-underline">
        {content}
      </Link>
    );
  }

  return content;
}
