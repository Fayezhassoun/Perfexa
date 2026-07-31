import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

export const videoRouter = router({
  list: orgProcedure.query(({ ctx }) => services.video.listJobs(ctx.agentCtx)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.video.getJob(ctx.agentCtx, input.id)),

  create: orgProcedure
    .input(
      z.object({
        prompt: z.string().min(4).max(1000),
        style: z.enum(['ugc', 'product_demo', 'cinematic', 'slideshow']).optional(),
        aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional(),
        durationSec: z.number().int().min(3).max(120).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.video.createJob(ctx.agentCtx, {
        prompt: input.prompt,
        style: input.style,
        aspectRatio: input.aspectRatio,
        durationSec: input.durationSec,
      }),
    ),

  dispatch: orgProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        approvalId: z.string().uuid().optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.video.dispatchApproved(ctx.agentCtx, input.jobId, input.approvalId),
    ),
});
