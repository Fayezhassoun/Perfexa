'use client';

import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { ProposalCard, type PlanShape } from '@/components/console/proposal-card';
import { PageShell } from '@/components/page-shell';

export default function ProposalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const proposal = trpc.proposals.get.useQuery({ id: params.id });

  const done = async () => {
    await utils.invalidate();
    router.refresh();
  };
  const approve = trpc.proposals.approve.useMutation({ onSuccess: done });
  const reject = trpc.proposals.reject.useMutation({ onSuccess: done });
  const requestChanges = trpc.proposals.requestChanges.useMutation({ onSuccess: done });

  if (proposal.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  if (!proposal.data) return <p className="p-6 text-sm text-muted-foreground">Proposal not found.</p>;

  const p = proposal.data;
  return (
    <PageShell className="mx-auto max-w-3xl space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Proposal review</h1>
      <ProposalCard
        plan={p.plan as unknown as PlanShape}
        status={p.status ?? 'pending'}
        busy={approve.isPending || reject.isPending || requestChanges.isPending}
        onApprove={() => approve.mutate({ id: p.id, via: 'click' })}
        onReject={() => reject.mutate({ id: p.id, via: 'click' })}
        onRequestChanges={(comment) => requestChanges.mutate({ id: p.id, comment, via: 'click' })}
      />
      {(approve.error ?? reject.error ?? requestChanges.error) && (
        <p className="text-sm text-destructive">
          {(approve.error ?? reject.error ?? requestChanges.error)?.message}
        </p>
      )}
    </PageShell>
  );
}
