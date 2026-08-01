import { z } from 'zod';
import { services, generateCounterCampaign } from '@growthcrew/agents';
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

  adIntel: router({
    scan: orgProcedure
      .input(
        z.object({
          competitorId: z.string().uuid().optional(),
          advertiserId: z.string().min(4).max(120),
          advertiserName: z.string().max(200).optional(),
          regions: z.array(z.string().length(2)).optional(),
          idempotencyKey: z.string().optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        services.adIntel.scanCompetitor(ctx.agentCtx, {
          competitorId: input.competitorId,
          advertiserId: input.advertiserId,
          advertiserName: input.advertiserName,
          regions: input.regions,
        }),
      ),

    matrix: orgProcedure
      .input(z.object({ competitorId: z.string().uuid() }))
      .query(({ ctx, input }) => services.adIntel.matrix(ctx.agentCtx, input.competitorId)),

    scans: orgProcedure
      .input(z.object({ competitorId: z.string().uuid().optional() }).optional())
      .query(({ ctx, input }) => services.adIntel.listScans(ctx.agentCtx, input)),

    creatives: orgProcedure
      .input(z.object({ scanId: z.string().uuid() }))
      .query(({ ctx, input }) => services.adIntel.creatives(ctx.agentCtx, input.scanId)),
  }),

  // Counter-Campaign Agent: analyze scans → propose counter-campaign
  counterCampaign: orgProcedure
    .input(
      z.object({
        competitorId: z.string().uuid().optional(),
        monthlyBudgetCents: z.number().int().positive().max(10000000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      generateCounterCampaign(ctx.agentCtx, {
        competitorId: input.competitorId,
        monthlyBudgetCents: input.monthlyBudgetCents,
      }),
    ),
});
