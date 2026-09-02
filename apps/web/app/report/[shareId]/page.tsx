import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { appRouter } from '@/server/trpc/router/_app';
import { db } from '@growthcrew/db';
import { Markdown } from '@/app/(app)/reports/markdown';
import { DemoDataBanner } from '@/components/demo-data-banner';
import { DataSourceNotice } from '@/components/data-source-notice';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Client performance report | Perfexa',
    robots: { index: false, follow: false },
  };
}

function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeAccent(value: string | null): string {
  return value && /^#[\da-f]{6}$/i.test(value) ? value : '#D6401F';
}

function metricLabel(value: number): string {
  return value.toLocaleString('en-US');
}

export default async function PublicReportPage({ params }: { params: { shareId: string } }) {
  let sharedReport;
  try {
    const caller = appRouter.createCaller({
      db,
      session: null,
      userId: null,
      orgId: null,
      memberships: [],
    });
    sharedReport = await caller.share.getPublic({ shareId: params.shareId });
  } catch {
    notFound();
  }

  if (!sharedReport) notFound();

  const { report, branding } = sharedReport;
  const content = report.content;
  const accent = safeAccent(branding.brandColor);
  const accentStyle = { color: accent } satisfies CSSProperties;
  const accentBackgroundStyle = { backgroundColor: accent } satisfies CSSProperties;
  const accentBorderStyle = { borderTopColor: accent } satisfies CSSProperties;
  const platformRows = Object.entries(content.byPlatform ?? {});

  return (
    <main className="min-h-screen bg-[hsl(var(--cream))] px-4 py-8 text-[hsl(var(--ink))] print:bg-white print:px-0 print:py-0">
      <div className="mx-auto max-w-5xl">
        <header
          className="overflow-hidden rounded-2xl border border-[hsl(var(--ink)/0.1)] bg-white shadow-sm print:rounded-none print:border-0 print:shadow-none"
          style={accentBorderStyle}
        >
          <div className="h-1.5" style={accentBackgroundStyle} />
          <div className="flex flex-col gap-8 px-6 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-10 sm:py-10">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={accentStyle}>
                Performance report
              </p>
              <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-normal sm:text-5xl">
                {branding.brandName}
              </h1>
              <p className="mt-3 text-sm text-[hsl(var(--ink-soft))] sm:text-base">
                Weekly marketing performance · {content.periodLabel}
              </p>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[hsl(var(--ink-soft)/0.7)]">Prepared for you</p>
              <p className="mt-2 text-sm font-medium text-[hsl(var(--ink-soft))]">
                Week of{' '}
                {new Date(report.weekStart).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>
        </header>

        {/* Demo-data mode: simulated numbers must always carry the label */}
        {content.demoData && <DemoDataBanner className="mt-6" />}
        {!content.demoData && content.dataSource && (
          <DataSourceNotice
            source={content.dataSource === 'demo' ? 'none' : content.dataSource}
            className="mt-6"
          />
        )}

        <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          {[
            ['Spend', usd(content.totals.spendCents)],
            ['Impressions', metricLabel(content.totals.impressions)],
            ['Clicks', metricLabel(content.totals.clicks)],
            ['Conversions', metricLabel(content.totals.conversions)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[hsl(var(--ink)/0.1)] bg-white p-4 shadow-sm sm:p-5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[hsl(var(--ink-soft)/0.7)]">{label}</p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-normal sm:text-3xl">{value}</p>
            </div>
          ))}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <article className="rounded-2xl border border-[hsl(var(--ink)/0.1)] bg-white p-6 shadow-sm sm:p-10">
            <div className="mb-8 flex items-center gap-3">
              <span className="h-8 w-1 rounded-full" style={accentBackgroundStyle} />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={accentStyle}>
                  The week in review
                </p>
                <h2 className="mt-1 font-display text-2xl font-semibold tracking-normal">What happened</h2>
              </div>
            </div>
            <Markdown content={content.markdown} />
          </article>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-[hsl(var(--ink)/0.1)] bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold tracking-normal">Account health</h2>
              <div className="mt-5 space-y-4">
                <div className="flex items-center justify-between border-b border-[hsl(var(--ink)/0.08)] pb-4">
                  <span className="text-sm text-[hsl(var(--ink-soft))]">Alerts</span>
                  <span className="font-semibold">{content.alertCount}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[hsl(var(--ink-soft))]">Fatigued creatives</span>
                  <span className="font-semibold">{content.fatiguedCreatives}</span>
                </div>
              </div>
            </div>

            {platformRows.length > 0 && (
              <div className="rounded-2xl border border-[hsl(var(--ink)/0.1)] bg-white p-6 shadow-sm">
                <h2 className="font-display text-lg font-semibold tracking-normal">By channel</h2>
                <div className="mt-5 space-y-4">
                  {platformRows.map(([platform, totals]) => (
                    <div key={platform} className="border-b border-[hsl(var(--ink)/0.08)] pb-4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium capitalize text-[hsl(var(--ink-soft))]">{platform}</span>
                        <span className="text-sm font-semibold">{usd(totals.spendCents)}</span>
                      </div>
                      <p className="mt-1 text-xs text-[hsl(var(--ink-soft)/0.72)]">
                        {metricLabel(totals.conversions)} conversions · {metricLabel(totals.clicks)} clicks
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        <footer className="flex flex-col gap-2 px-2 py-8 text-xs text-[hsl(var(--ink-soft)/0.72)] sm:flex-row sm:items-center sm:justify-between print:py-5">
          <span>Shared privately by {branding.brandName}</span>
          <span>
            Powered by{' '}
            <a className="font-semibold text-[hsl(var(--ink))] underline underline-offset-2" href="/register">
              Perfexa
            </a>
          </span>
        </footer>
      </div>
    </main>
  );
}
