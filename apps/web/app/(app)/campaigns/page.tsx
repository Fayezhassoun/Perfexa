'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { PageShell, PageHeader } from '@/components/page-shell';

const PLATFORM_LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
};

function dollars(cents: number | null): string {
  return cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export default function CampaignsPage() {
  const [platform, setPlatform] = useState<string>('');
  const utils = trpc.useUtils();
  const campaigns = trpc.campaigns.list.useQuery(platform ? { platform: platform as never } : undefined);
  const pause = trpc.campaigns.pause.useMutation({
    onSuccess: () => utils.campaigns.invalidate(),
  });
  const resume = trpc.campaigns.resume.useMutation({
    onSuccess: () => {
      void utils.campaigns.invalidate();
      void utils.approvals.invalidate();
    },
  });
  const controlError = pause.error ?? resume.error;

  const grouped = new Map<string, NonNullable<typeof campaigns.data>>();
  for (const c of campaigns.data ?? []) {
    const key = c.platform ?? 'unknown';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c);
  }

  return (
    <PageShell className="space-y-4" data-testid="campaigns-page">
      <PageHeader
        eyebrow="Growth"
        title="Campaigns"
        description="Monitor campaigns across platforms. Connected live accounts remain read-only during the pilot."
        actions={
          <Select value={platform} onChange={(e) => setPlatform(e.target.value)} className="w-44">
            <option value="">All platforms</option>
            <option value="google_ads">Google Ads</option>
            <option value="meta">Meta</option>
            <option value="tiktok">TikTok</option>
          </Select>
        }
      />
      {controlError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {controlError.message}
        </p>
      )}
      {resume.data && (
        <p
          className={
            resume.data.pending
              ? 'rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-500'
              : 'rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-500'
          }
        >
          {resume.data.message}
        </p>
      )}
      {[...grouped.entries()].map(([p, rows]) => (
        <Card key={p}>
          <CardHeader>
            <CardTitle className="text-base">{PLATFORM_LABELS[p] ?? p}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((c) => {
              const metrics = c.metrics as {
                impressions?: number;
                clicks?: number;
                spendCents?: number;
                conversions?: number;
              } | null;
              const liveReadOnly = c.accountMode === 'live';
              return (
                <div key={c.id} className="glass-tile flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {c.name}
                      <Badge variant={c.status === 'active' ? 'success' : 'secondary'}>{c.status}</Badge>
                      <Badge variant="outline">{c.mode}</Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {dollars(c.budgetDailyCents)}/day · {metrics?.impressions?.toLocaleString() ?? 0}{' '}
                      impressions · {metrics?.clicks ?? 0} clicks · {dollars(metrics?.spendCents ?? 0)} spent ·{' '}
                      {metrics?.conversions ?? 0} conversions
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {c.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pause.isPending || liveReadOnly}
                        title={liveReadOnly ? 'Live campaign changes are disabled during the read-only pilot.' : undefined}
                        onClick={() => pause.mutate({ id: c.id })}
                      >
                        {liveReadOnly ? 'Read-only' : 'Pause'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resume.isPending || liveReadOnly}
                        title={liveReadOnly ? 'Live campaign changes are disabled during the read-only pilot.' : undefined}
                        onClick={() => resume.mutate({ id: c.id })}
                      >
                        {liveReadOnly ? 'Read-only' : 'Resume'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
      {campaigns.data?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No campaigns yet — approve a plan in the Voice Console to launch your first one (safely, in
          sandbox mode).
        </p>
      )}
    </PageShell>
  );
}
