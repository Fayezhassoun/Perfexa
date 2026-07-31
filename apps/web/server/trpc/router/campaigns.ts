import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

export const campaignsRouter = router({
  list: orgProcedure
    .input(z.object({ platform: z.enum(['google_ads', 'meta', 'tiktok']).optional() }).optional())
    .query(({ ctx, input }) => services.campaigns.listCampaigns(ctx.agentCtx, input?.platform)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.campaigns.getCampaign(ctx.agentCtx, input.id)),

  pause: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.campaigns.pauseCampaign(ctx.agentCtx, input.id)),

  resume: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        via: z.enum(['voice', 'click']).default('click'),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.campaigns.resumeCampaign(ctx.agentCtx, input.id, input.via)),
});
