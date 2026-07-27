import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const dashboardRouter = router({
  overview: orgProcedure
    .input(
      z
        .object({
          from: z.string().optional(), // ISO date
          to: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => services.dashboard.overview(ctx.agentCtx, input ?? undefined)),

  activityFeed: orgProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .query(({ ctx, input }) => services.dashboard.activityFeed(ctx.agentCtx, input?.limit)),

  seoTracker: orgProcedure.query(({ ctx }) => services.dashboard.seoTracker(ctx.agentCtx)),

  // Dev "simulate" fallback (CONTRACTS §11): polls mock metrics + guardian tick.
  simulateTick: orgProcedure
    .input(z.object({ idempotencyKey: z.string().optional() }).optional())
    .mutation(({ ctx }) => services.dashboard.simulateTick(ctx.agentCtx)),
});
