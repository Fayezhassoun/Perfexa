'use client';

// Competitor intelligence: track rival sites, SEO snapshots, score trends,
// and the Competitor Analyst's counter-move suggestions.

import { useState } from 'react';
import { Lightbulb, Plus, Radar, RefreshCw, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageShell, PageHeader } from '@/components/page-shell';

const AD_REGIONS = [
  { code: 'SA', label: 'Saudi Arabia' },
  { code: 'AE', label: 'UAE' },
  { code: 'KW', label: 'Kuwait' },
  { code: 'MA', label: 'Morocco' },
  { code: 'DZ', label: 'Algeria' },
  { code: 'CA', label: 'Canada' },
  { code: 'US', label: 'United States' },
];

function intensityClass(count: number): string {
  if (count >= 4000) return 'bg-primary text-primary-foreground';
  if (count >= 1500) return 'bg-primary/70 text-primary-foreground';
  if (count >= 400) return 'bg-primary/40';
  if (count > 0) return 'bg-primary/15';
  return 'bg-muted text-muted-foreground';
}

interface Snapshot {
  analyzedAt?: string;
  score?: number;
  performanceScore?: number;
  missingMetaDescriptions?: number;
  hasLeadForm?: boolean;
  keywords?: string[];
}

export default function CompetitorsPage() {
  const utils = trpc.useUtils();
  const competitors = trpc.competitors.list.useQuery();
  const seo = trpc.dashboard.seoTracker.useQuery();
  const add = trpc.competitors.add.useMutation({ onSuccess: () => utils.competitors.invalidate() });
  const analyze = trpc.competitors.analyze.useMutation({ onSuccess: () => utils.competitors.invalidate() });
  const remove = trpc.competitors.remove.useMutation({ onSuccess: () => utils.competitors.invalidate() });

  const [url, setUrl] = useState('');
  const myScore = seo.data?.score ?? null;

  // Ad Intelligence state
  const [selectedId, setSelectedId] = useState<string>('');
  const [advertiserId, setAdvertiserId] = useState('');
  const [region, setRegion] = useState('SA');
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

  const adScan = trpc.competitors.adIntel.scan.useMutation({
    onSuccess: () => {
      utils.competitors.adIntel.scans.invalidate();
    },
  });
  const scans = trpc.competitors.adIntel.scans.useQuery(
    { competitorId: selectedId || undefined },
    { enabled: !!selectedId },
  );

  // Latest scan per region for the matrix view
  type ScanRow = NonNullable<typeof scans.data>[number];
  const latestByRegion = new Map<string, ScanRow>();
  for (const scan of scans.data ?? []) {
    const r = scan.region ?? 'unknown';
    if (!latestByRegion.has(r)) latestByRegion.set(r, scan);
  }
  const matrixRows = AD_REGIONS.map((r) => ({
    code: r.code,
    label: r.label,
    scan: latestByRegion.get(r.code) ?? null,
  }));

  return (
    <PageShell className="space-y-6" data-testid="competitors-page">
      <PageHeader
        eyebrow="Market"
        title="Competitors"
        description={
          <>
            Track who you&apos;re up against. Each analysis compares their SEO health to yours
            {myScore != null && (
              <>
                {' '}
                (you: <span className="font-medium text-foreground">{myScore}/100</span>)
              </>
            )}
            .
          </>
        }
      />

      <Card className="glass rounded-2xl">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Input
            placeholder="competitor-website.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="max-w-sm"
          />
          <Button
            disabled={add.isPending || url.trim().length < 4}
            onClick={() => add.mutate({ url: url.trim() }, { onSuccess: () => setUrl('') })}
          >
            <Plus /> {add.isPending ? 'Analyzing…' : 'Track competitor'}
          </Button>
          {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(competitors.data ?? []).map((competitor) => {
          const snapshot = (competitor.snapshot ?? {}) as Snapshot;
          const history = (competitor.history ?? []) as { analyzedAt?: string; score?: number }[];
          const delta = myScore != null && snapshot.score != null ? myScore - snapshot.score : null;
          return (
            <Card key={competitor.id} className="lift" data-testid="competitor-card">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{competitor.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{competitor.url}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Re-analyze"
                      disabled={analyze.isPending}
                      onClick={() => analyze.mutate({ id: competitor.id })}
                    >
                      <RefreshCw className={analyze.isPending ? 'animate-spin' : ''} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Stop tracking"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate({ id: competitor.id })}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-primary/60 font-display text-lg font-bold">
                    {snapshot.score ?? '—'}
                  </div>
                  <div className="text-sm">
                    {delta != null && (
                      <Badge variant={delta >= 0 ? 'success' : 'destructive'}>
                        {delta >= 0 ? `You lead by ${delta}` : `They lead by ${-delta}`}
                      </Badge>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Mobile speed {snapshot.performanceScore ?? '—'}/100 ·{' '}
                      {snapshot.hasLeadForm ? 'has a lead form' : 'no lead form'} ·{' '}
                      {snapshot.missingMetaDescriptions ?? '—'} missing meta descriptions
                    </p>
                  </div>
                </div>

                {!!snapshot.keywords?.length && (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Their keywords:</span>{' '}
                    {snapshot.keywords.slice(0, 6).join(', ')}
                  </p>
                )}

                {!!competitor.suggestions?.length && (
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
                      <Lightbulb className="h-3.5 w-3.5" /> Counter-moves
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-sm">
                      {competitor.suggestions.map((suggestion, i) => (
                        <li key={i}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {history.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    Score history: {history.map((h) => h.score ?? '—').join(' → ')}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      {competitors.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Not tracking anyone yet. Add a competitor above, or tell the Voice Console: “track
          competitor rivalplumbing.com”.
        </p>
      )}

      {/* ── Ad Intelligence ─────────────────────────────────────────── */}
      <div className="space-y-4 pt-4">
        <PageHeader
          eyebrow="Market"
          title="Ad intelligence"
          description="Scan a competitor's Google Ads presence across regions via the Ads Transparency Center. Mock mode is deterministic and offline; switch AD_INTEL_MODE=live for real fetches."
        />

        <Card className="glass rounded-2xl">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Competitor</span>
              <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-48">
                <option value="">Select…</option>
                {(competitors.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-56 flex-1 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Google advertiser ID (AR…)</span>
              <Input
                placeholder="AR15714032992319963137"
                value={advertiserId}
                onChange={(e) => setAdvertiserId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Region</span>
              <Select value={region} onChange={(e) => setRegion(e.target.value)} className="w-40">
                {AD_REGIONS.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              disabled={!selectedId || advertiserId.trim().length < 4 || adScan.isPending}
              onClick={() =>
                adScan.mutate({
                  competitorId: selectedId,
                  advertiserId: advertiserId.trim(),
                  regions: [region],
                })
              }
            >
              <Radar /> {adScan.isPending ? 'Scanning…' : 'Scan region'}
            </Button>
            {adScan.error && <p className="text-sm text-destructive">{adScan.error.message}</p>}
          </CardContent>
        </Card>

        {selectedId && (
          <Card className="glass rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Region × ad-count matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {matrixRows.map((row) => (
                  <button
                    key={row.code}
                    type="button"
                    onClick={() => setSelectedRegion(row.scan ? row.code : null)}
                    className={`flex flex-col items-center gap-1 rounded-xl p-3 text-center transition ${intensityClass(row.scan?.adCount ?? 0)} ${
                      selectedRegion === row.code ? 'ring-2 ring-ring' : ''
                    }`}
                  >
                    <span className="text-xs font-medium opacity-80">{row.code}</span>
                    <span className="font-display text-lg font-bold">
                      {row.scan ? (row.scan.adCount ?? 0).toLocaleString() : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedRegion && latestByRegion.get(selectedRegion) && (() => {
          const regionCreatives = (latestByRegion.get(selectedRegion)!.creatives ?? []) as {
            headline?: string;
            cta?: string;
            lang?: string;
            operator?: string;
            angle?: string;
          }[];
          return (
          <Card className="glass rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">
                Captured creatives — {AD_REGIONS.find((r) => r.code === selectedRegion)?.label ?? selectedRegion}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {regionCreatives.length > 0 ? (
                regionCreatives.map((c, i) => (
                  <div key={i} className="rounded-xl border p-3">
                    <p className="text-sm font-medium">{c.headline ?? '—'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {c.cta && <Badge variant="outline">CTA: {c.cta}</Badge>}
                      {c.lang && <Badge variant="secondary">{c.lang.toUpperCase()}</Badge>}
                      {c.operator && <Badge variant="secondary">{c.operator}</Badge>}
                      {c.angle && <Badge>{c.angle}</Badge>}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  No creatives captured for this region. Live deep-scraping is a future browser-based job.
                </p>
              )}
            </CardContent>
          </Card>
          );
        })()}
      </div>
    </PageShell>
  );
}
