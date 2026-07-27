import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

const via = z.enum(['voice', 'click']).default('click');

export const reviewsRouter = router({
  list: orgProcedure
    .input(z.object({ sentiment: z.enum(['positive', 'neutral', 'negative']).optional() }).optional())
    .query(({ ctx, input }) => services.reviews.listReviews(ctx.agentCtx, input?.sentiment)),

  stats: orgProcedure.query(({ ctx }) => services.reviews.stats(ctx.agentCtx)),

  sync: orgProcedure
    .input(z.object({ idempotencyKey: z.string().optional() }).optional())
    .mutation(({ ctx }) => services.reviews.syncReviews(ctx.agentCtx)),

  draftReply: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.reviews.draftReply(ctx.agentCtx, input.id)),

  updateReplyDraft: orgProcedure
    .input(z.object({ id: z.string().uuid(), replyDraft: z.string().min(1).max(2000), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.reviews.updateReplyDraft(ctx.agentCtx, input.id, input.replyDraft)),

  // Posting a reply is a gated publish action.
  postReply: orgProcedure
    .input(z.object({ id: z.string().uuid(), via, idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.reviews.postReply(ctx.agentCtx, input.id, input.via)),
});
