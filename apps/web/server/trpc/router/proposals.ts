import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

const via = z.enum(['voice', 'click']).default('click');

export const proposalsRouter = router({
  list: orgProcedure
    .input(
      z
        .object({ status: z.enum(['pending', 'approved', 'rejected', 'changes_requested']).optional() })
        .optional(),
    )
    .query(({ ctx, input }) => services.proposals.listProposals(ctx.agentCtx, input?.status)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.proposals.getProposal(ctx.agentCtx, input.id)),

  approve: orgProcedure
    .input(z.object({ id: z.string().uuid(), via, idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.proposals.approveProposalById(ctx.agentCtx, input.id, input.via)),

  reject: orgProcedure
    .input(z.object({ id: z.string().uuid(), via, idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.proposals.rejectProposal(ctx.agentCtx, input.id, input.via)),

  requestChanges: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        comment: z.string().min(1).max(2000),
        via,
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.proposals.requestChanges(ctx.agentCtx, input.id, input.comment, input.via),
    ),
});
