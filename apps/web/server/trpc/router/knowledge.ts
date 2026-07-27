import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const knowledgeRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          source: z.enum(['google_ads_help', 'meta_help', 'tiktok_help', 'seo_guide', 'policy']).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => services.knowledge.listKnowledge(ctx.agentCtx, input?.source)),

  search: orgProcedure
    .input(z.object({ q: z.string().min(1).max(500) }))
    .query(({ ctx, input }) => services.knowledge.searchKnowledge(ctx.agentCtx, input.q)),
});
