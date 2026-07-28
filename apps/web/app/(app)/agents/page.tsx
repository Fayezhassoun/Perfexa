'use client';

import Link from 'next/link';
import { Bot } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageShell } from '@/components/page-shell';

const TYPE_LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  seo: 'SEO Agent',
  google_ads: 'Google Ads Agent',
  meta_ads: 'Meta Ads Agent',
  tiktok_ads: 'TikTok Ads Agent',
  lead_gen: 'Lead Gen Agent',
  analytics: 'Analytics Agent',
  budget_guardian: 'Budget Guardian',
};

export default function AgentsPage() {
  const agents = trpc.agents.list.useQuery();

  return (
    <PageShell className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Your agents</h1>
      <p className="text-sm text-muted-foreground">
        Specialists created from plans you approved. Each one only has the tools its job needs.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="agents-grid">
        {(agents.data ?? []).map((agent) => (
          <Link key={agent.id} href={`/agents/${agent.id}`}>
            <Card className="lift h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                    <Bot className="h-5 w-5 text-primary" />
                  </span>
                  <Badge variant={agent.status === 'active' ? 'success' : 'secondary'}>{agent.status}</Badge>
                </div>
                <p className="mt-2 font-medium">{agent.name ?? TYPE_LABELS[agent.type ?? ''] ?? agent.type}</p>
                <p className="text-xs text-muted-foreground">{TYPE_LABELS[agent.type ?? ''] ?? agent.type}</p>
                {agent.latestRun && (
                  <p className="mt-2 truncate text-xs text-muted-foreground">
                    Last run: {agent.latestRun.status} ·{' '}
                    {new Date(agent.latestRun.createdAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
        {agents.data?.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            No agents yet — approve a proposal and your team appears here.
          </p>
        )}
      </div>
    </PageShell>
  );
}
