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
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#06B6D4" />
        </linearGradient>
        <linearGradient id={waveGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#E0F2FE" />
        </linearGradient>
      </defs>

      {/* Voice Orb Base Container */}
      <rect x="2" y="2" width="28" height="28" rx="8.5" fill={`url(#${bgGradId})`} />

      {/* Glass Inner Rim */}
      <rect
        x="2.5"
        y="2.5"
        width="27"
        height="27"
        rx="8"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.28"
        strokeWidth="1"
      />

      {/* Conversational Waveform Aperture Arc Top */}
      <path
        d="M 8 12.5 C 12 9.5, 20 9.5, 24 12.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Conversational Waveform Aperture Arc Bottom */}
      <path
        d="M 8 19.5 C 12 22.5, 20 22.5, 24 19.5"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />

      {/* Team Orbit Nodes */}
      <circle cx="6.5" cy="16" r="1.25" fill="#FFFFFF" fillOpacity="0.9" />
      <circle cx="25.5" cy="16" r="1.25" fill="#FFFFFF" fillOpacity="0.9" />

      {/* Soundwave Bars */}
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
  wordmark = 'GrowthCrew',
  descriptor,
  showDescriptor = false,
  href,
  ariaLabel,
  className,
  markClassName,
  textClassName,
}: BrandMarkProps) {
  let iconSize = 32;
  let wordmarkClass = 'text-lg font-semibold tracking-tight';
  let descriptorClass = 'text-xs text-muted-foreground';

  if (typeof size === 'number') {
    iconSize = size;
    if (size <= 24) {
      wordmarkClass = 'text-sm font-semibold tracking-tight';
      descriptorClass = 'text-[10px] text-muted-foreground';
    } else if (size >= 40) {
      wordmarkClass = 'text-xl font-bold tracking-tight';
      descriptorClass = 'text-xs text-muted-foreground';
    }
  } else {
    switch (size) {
      case 'sm':
        iconSize = 24;
        wordmarkClass = 'text-sm font-semibold tracking-tight';
        descriptorClass = 'text-[10px] text-muted-foreground';
        break;
      case 'lg':
        iconSize = 40;
        wordmarkClass = 'text-xl font-bold tracking-tight';
        descriptorClass = 'text-xs text-muted-foreground';
        break;
      case 'md':
      default:
        iconSize = 32;
        wordmarkClass = 'text-lg font-semibold tracking-tight';
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
