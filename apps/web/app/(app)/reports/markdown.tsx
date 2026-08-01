'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// Minimal, dependency-free Markdown renderer for the weekly report brief.
// Parses the subset the report engine emits (headings, bold, ordered and
// unordered lists, paragraphs) straight into React elements — no raw HTML is
// ever injected, so LLM output cannot smuggle markup into the page.

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Split on **bold** spans; captured groups land on odd indices.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  parts.forEach((part, i) => {
    if (part === '') return;
    if (i % 2 === 1) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`} className="font-semibold text-foreground">
          {part}
        </strong>,
      );
    } else {
      nodes.push(<React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>);
    }
  });
  return nodes;
}

const HEADING_STYLES: Record<number, string> = {
  1: 'font-display text-2xl font-semibold tracking-tight text-foreground',
  2: 'font-display text-lg font-semibold tracking-tight text-foreground mt-2',
  3: 'font-display text-base font-semibold tracking-tight text-foreground',
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isBullet = (s: string) => /^[-*]\s+/.test(s);
  const isOrdered = (s: string) => /^\d+\.\s+/.test(s);
  const isHeading = (s: string) => /^#{1,3}\s+/.test(s);
  const lineAt = (n: number): string => lines[n] ?? '';

  while (i < lines.length) {
    const trimmed = lineAt(i).trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const text = heading[2] ?? '';
      const Tag = (`h${level + 1}` as unknown) as keyof React.JSX.IntrinsicElements;
      blocks.push(
        <Tag key={key++} className={cn(HEADING_STYLES[level], blocks.length === 0 && 'mt-0')}>
          {renderInline(text, `h-${key}`)}
        </Tag>,
      );
      i++;
      continue;
    }

    if (isBullet(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lineAt(i).trim())) {
        items.push(lineAt(i).trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      const listKey = key++;
      blocks.push(
        <ul key={listKey} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
              <span>{renderInline(item, `ul-${listKey}-${idx}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (isOrdered(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isOrdered(lineAt(i).trim())) {
        items.push(lineAt(i).trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      const listKey = key++;
      blocks.push(
        <ol key={listKey} className="my-2 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
              <span className="mt-[0.15em] flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[0.65rem] font-semibold text-primary">
                {idx + 1}
              </span>
              <span>{renderInline(item, `ol-${listKey}-${idx}`)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph: gather consecutive plain lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lineAt(i).trim() !== '' &&
      !isHeading(lineAt(i).trim()) &&
      !isBullet(lineAt(i).trim()) &&
      !isOrdered(lineAt(i).trim())
    ) {
      para.push(lineAt(i).trim());
      i++;
    }
    const paraKey = key++;
    blocks.push(
      <p key={paraKey} className="my-2 text-sm leading-relaxed text-muted-foreground">
        {renderInline(para.join(' '), `p-${paraKey}`)}
      </p>,
    );
  }

  return <div className={cn('space-y-1', className)}>{blocks}</div>;
}
