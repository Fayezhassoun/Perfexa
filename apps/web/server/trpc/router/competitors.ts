import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const competitorsRouter = router({
  list: orgProcedure.query(({ ctx }) => services.competitors.listCompetitors(ctx.agentCtx)),

  add: orgProcedure
    .input(
      z.object({
        url: z.string().min(4).max(300),
        name: z.string().max(120).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.competitors.addCompetitor(ctx.agentCtx, input.url, input.name)),

  analyze: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.competitors.analyzeCompetitor(ctx.agentCtx, input.id)),

  remove: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.competitors.removeCompetitor(ctx.agentCtx, input.id)),
});
