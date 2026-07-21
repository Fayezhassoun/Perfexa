'use client';

import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { dollars, type PlanShape } from '@/components/console/proposal-card';

export default function ProposalsPage() {
  const proposals = trpc.proposals.list.useQuery();

  return (
    <div className="space-y-4 p-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Proposals</h1>
      <p className="text-sm text-muted-foreground">
        Every plan your team suggests lands here. Nothing runs until you approve it.
      </p>
      <div className="space-y-3">
        {(proposals.data ?? []).map((p) => {
          const plan = p.plan as unknown as PlanShape;
          return (
            <Link key={p.id} href={`/proposals/${p.id}`} className="block">
              <Card className="transition-colors hover:bg-accent/50">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{plan.title}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {dollars(plan.monthlyBudgetCents)}/mo · {plan.agents.length} agents ·{' '}
                      {new Date(p.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge
                    variant={
                      p.status === 'approved' ? 'success' : p.status === 'rejected' ? 'destructive' : 'warning'
                    }
                  >
                    {p.status}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          );
        })}
        {proposals.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No proposals yet — describe what you need in the Voice Console and your team will draft a
            plan.
          </p>
        )}
      </div>
    </div>
  );
}
