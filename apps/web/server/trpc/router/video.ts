import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

const style = z.enum(['ugc', 'product_demo', 'cinematic', 'slideshow']);
const aspectRatio = z.enum(['9:16', '1:1', '16:9']);
const httpsUrl = z.string().url().refine(
  (value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'Source video URL must use HTTPS' },
);

const generateInput = z.object({
  mode: z.literal('generate').optional(),
  prompt: z.string().trim().min(4).max(1000),
  ctaBrief: z.string().trim().max(500).optional(),
  style: style.optional(),
  aspectRatio: aspectRatio.optional(),
  durationSec: z.number().int().min(3).max(120).optional(),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

const editInput = z
  .object({
    mode: z.literal('edit'),
    sourceUrl: httpsUrl,
    editInstructions: z.string().trim().min(4).max(1000),
    aspectRatio: aspectRatio.optional(),
    trimStartSec: z.number().int().min(0).max(3600).optional(),
    trimEndSec: z.number().int().min(0).max(3600).optional(),
    overlayText: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
  })
  .refine(
    (value) =>
      value.trimStartSec === undefined ||
      value.trimEndSec === undefined ||
      value.trimEndSec > value.trimStartSec,
    {
      message: 'Trim end must be after trim start',
      path: ['trimEndSec'],
    },
  );

export const videoRouter = router({
  status: orgProcedure.query(() => services.video.getStudioStatus()),

  list: orgProcedure.query(({ ctx }) => services.video.listJobs(ctx.agentCtx)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.video.getJob(ctx.agentCtx, input.id)),

  create: orgProcedure
    .input(z.union([generateInput, editInput]))
    .mutation(({ ctx, input }) =>
      services.video.createJob(
        ctx.agentCtx,
        input.mode === 'edit'
          ? {
              mode: 'edit',
              sourceUrl: input.sourceUrl,
              editInstructions: input.editInstructions,
              aspectRatio: input.aspectRatio,
              trimStartSec: input.trimStartSec,
              trimEndSec: input.trimEndSec,
              overlayText: input.overlayText,
              idempotencyKey: input.idempotencyKey,
            }
          : {
              mode: 'generate',
              prompt: input.prompt,
              ctaBrief: input.ctaBrief,
              style: input.style,
              aspectRatio: input.aspectRatio,
              durationSec: input.durationSec,
              idempotencyKey: input.idempotencyKey,
            },
      ),
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
