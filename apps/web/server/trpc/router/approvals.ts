import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

export const approvalsRouter = router({
  list: orgProcedure
    .input(z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() }).optional())
    .query(({ ctx, input }) => services.approvals.listApprovals(ctx.agentCtx, input?.status)),

  decide: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        approve: z.boolean(),
        via: z.enum(['voice', 'click']).default('click'),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.approvals.decideApproval(ctx.agentCtx, input.id, input.approve, input.via),
    ),
});
