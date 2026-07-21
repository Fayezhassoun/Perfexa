import { z } from 'zod';
import { services } from '@voxmarketer/agents';
import { router, orgProcedure } from '../trpc';

const platform = z.enum(['facebook', 'instagram', 'x', 'linkedin', 'tiktok']);
const via = z.enum(['voice', 'click']).default('click');

export const socialRouter = router({
  list: orgProcedure
    .input(z.object({ status: z.enum(['draft', 'scheduled', 'published', 'failed']).optional() }).optional())
    .query(({ ctx, input }) => services.social.listPosts(ctx.agentCtx, input?.status)),

  calendar: orgProcedure.query(({ ctx }) => services.social.calendar(ctx.agentCtx)),

  summary: orgProcedure.query(({ ctx }) => services.social.summary(ctx.agentCtx)),

  create: orgProcedure
    .input(
      z
        .object({
          platform,
          content: z.string().max(2000).optional(),
          topic: z.string().max(300).optional(),
          scheduledAt: z.string().optional(),
          idempotencyKey: z.string().optional(),
        })
        .refine((v) => v.content || v.topic, { message: 'Provide content or a topic' }),
    )
    .mutation(({ ctx, input }) => {
      const { idempotencyKey: _key, ...rest } = input;
      return services.social.createPost(ctx.agentCtx, rest);
    }),

  update: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().max(2000).optional(),
        scheduledAt: z.string().nullable().optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.social.updatePost(ctx.agentCtx, input.id, {
        content: input.content,
        scheduledAt: input.scheduledAt,
      }),
    ),

  delete: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.social.deletePost(ctx.agentCtx, input.id)),

  // Publishing is a gated action — recorded approval, then the tool runs.
  publish: orgProcedure
    .input(z.object({ id: z.string().uuid(), via, idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.social.publishPost(ctx.agentCtx, input.id, input.via)),

  refreshEngagement: orgProcedure
    .input(z.object({ idempotencyKey: z.string().optional() }).optional())
    .mutation(({ ctx }) => services.social.refreshEngagement(ctx.agentCtx)),
});
