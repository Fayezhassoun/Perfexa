import { z } from 'zod';
import { router, orgProcedure } from '../trpc';
import { detectCreativeFatigue, listFatigueSignals, recordCreativeSnapshot } from '@growthcrew/agents';

export const creativesRouter = router({
  detectFatigue: orgProcedure.mutation(({ ctx }) => detectCreativeFatigue(ctx.agentCtx)),

  fatigueSignals: orgProcedure.query(({ ctx }) => listFatigueSignals(ctx.agentCtx)),

  recordSnapshot: orgProcedure
    .input(
      z.object({
        creativeId: z.string().min(1),
        campaignId: z.string().uuid().optional(),
        platform: z.string().optional(),
        headline: z.string().optional(),
        imageUrl: z.string().url().optional(),
        impressions: z.number().int().min(0).optional(),
        clicks: z.number().int().min(0).optional(),
        spendCents: z.number().int().min(0).optional(),
        conversions: z.number().int().min(0).optional(),
        frequency: z.number().min(0).optional(),
        ctr: z.number().min(0).optional(),
      }),
    )
    .mutation(({ ctx, input }) => recordCreativeSnapshot(ctx.agentCtx, input)),
});
