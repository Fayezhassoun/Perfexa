'use client';

// Competitor intelligence: track rival sites, SEO snapshots, score trends,
// and the Competitor Analyst's counter-move suggestions.

import { useState } from 'react';
import { Lightbulb, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageShell, PageHeader } from '@/components/page-shell';

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
    </PageShell>
  );
}
