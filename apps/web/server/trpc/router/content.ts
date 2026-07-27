import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const contentRouter = router({
  list: orgProcedure
    .input(z.object({ type: z.enum(['blog', 'ad_copy', 'social_caption']).optional() }).optional())
    .query(({ ctx, input }) => services.content.listPieces(ctx.agentCtx, input?.type)),

  draft: orgProcedure
    .input(
      z.object({
        type: z.enum(['blog', 'ad_copy', 'social_caption']),
        topic: z.string().min(3).max(300),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.content.draftPiece(ctx.agentCtx, { type: input.type, topic: input.topic }),
    ),

  update: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        body: z.string().max(20_000).optional(),
        status: z.enum(['draft', 'approved', 'rejected']).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, idempotencyKey: _key, ...patch } = input;
      return services.content.updatePiece(ctx.agentCtx, id, patch);
    }),
});
