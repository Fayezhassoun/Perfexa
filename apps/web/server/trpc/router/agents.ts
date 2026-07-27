import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const agentsRouter = router({
  list: orgProcedure.query(({ ctx }) => services.agents.listAgents(ctx.agentCtx)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.agents.getAgent(ctx.agentCtx, input.id)),

  setStatus: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['active', 'paused', 'archived']),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.agents.setAgentStatus(ctx.agentCtx, input.id, input.status)),
});
