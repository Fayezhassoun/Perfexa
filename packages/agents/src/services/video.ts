// Video generation service (CONTRACTS / Wave 2A).
// Handles job creation, mock vs live gating behind approvals, and dispatching approved jobs.

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { approvals, videoJobs, type VideoJob } from '@growthcrew/db';
import {
  getVideoAdapter,
  getVideoProviderStatus,
  type VideoJobResult,
  type VideoProviderStatus,
} from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';

const styleSchema = z.enum(['ugc', 'product_demo', 'cinematic', 'slideshow']);
const aspectRatioSchema = z.enum(['9:16', '1:1', '16:9']);
const trimSchema = z.number().int().min(0).max(3600);
const httpsUrlSchema = z.string().url().refine(
  (value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'Source video URL must use HTTPS' },
);

const generateInputSchema = z.object({
  mode: z.literal('generate').default('generate'),
  prompt: z.string().trim().min(4).max(1000),
  ctaBrief: z.string().trim().max(500).optional(),
  style: styleSchema.default('ugc'),
  aspectRatio: aspectRatioSchema.default('9:16'),
  durationSec: z.number().int().min(3).max(120).default(15),
  idempotencyKey: z.string().trim().min(1).max(120).optional(),
});

const editInputSchema = z
  .object({
    mode: z.literal('edit'),
    sourceUrl: httpsUrlSchema,
    editInstructions: z.string().trim().min(4).max(1000),
    aspectRatio: aspectRatioSchema.default('9:16'),
    trimStartSec: trimSchema.optional(),
    trimEndSec: trimSchema.optional(),
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

export type CreateGenerateJobInput = z.input<typeof generateInputSchema>;
export type CreateEditJobInput = z.input<typeof editInputSchema>;
export type CreateJobInput = CreateGenerateJobInput | CreateEditJobInput;

function normalizeCreateInput(input: CreateJobInput): z.output<typeof generateInputSchema> | z.output<typeof editInputSchema> {
  if ('mode' in input && input.mode === 'edit') {
    return editInputSchema.parse(input);
  }
  return generateInputSchema.parse({ ...input, mode: 'generate' });
}

async function findIdempotentJob(ctx: AgentContext, idempotencyKey?: string): Promise<VideoJob | undefined> {
  if (!idempotencyKey) return undefined;
  const [existing] = await ctx.db
    .select()
    .from(videoJobs)
    .where(and(eq(videoJobs.orgId, ctx.orgId), eq(videoJobs.idempotencyKey, idempotencyKey)))
    .limit(1);
  return existing;
}

async function logVideoEvent(
  ctx: AgentContext,
  action: string,
  job: VideoJob,
  payload: Record<string, unknown>,
): Promise<void> {
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action,
    entityType: 'video_job',
    entityId: job.id,
    payload,
  });
}

export async function listJobs(ctx: AgentContext): Promise<VideoJob[]> {
  return ctx.db
    .select()
    .from(videoJobs)
    .where(eq(videoJobs.orgId, ctx.orgId))
    .orderBy(desc(videoJobs.createdAt))
    .limit(50);
}

export async function getJob(ctx: AgentContext, id: string): Promise<VideoJob> {
  const [job] = await ctx.db
    .select()
    .from(videoJobs)
    .where(and(eq(videoJobs.id, id), eq(videoJobs.orgId, ctx.orgId)))
    .limit(1);
  if (!job) throw new Error('Video job not found');
  return job;
}

export function getStudioStatus(): VideoProviderStatus {
  return getVideoProviderStatus();
}

export async function createJob(ctx: AgentContext, input: CreateJobInput): Promise<VideoJob> {
  const parsed = normalizeCreateInput(input);
  const replay = await findIdempotentJob(ctx, parsed.idempotencyKey);
  if (replay) return replay;

  const providerStatus = getVideoProviderStatus();
  const adapter = getVideoAdapter();

  if (parsed.mode === 'edit') {
    const error = providerStatus.editing.reason;
    const [inserted] = await ctx.db
      .insert(videoJobs)
      .values({
        orgId: ctx.orgId,
        mode: 'edit',
        prompt: parsed.editInstructions,
        aspectRatio: parsed.aspectRatio,
        durationSec:
          parsed.trimStartSec !== undefined && parsed.trimEndSec !== undefined
            ? parsed.trimEndSec - parsed.trimStartSec
            : null,
        sourceUrl: parsed.sourceUrl,
        editInstructions: parsed.editInstructions,
        trimStartSec: parsed.trimStartSec ?? null,
        trimEndSec: parsed.trimEndSec ?? null,
        overlayText: parsed.overlayText,
        status: 'provider_not_configured',
        provider: providerStatus.provider,
        costCents: 0,
        error,
        idempotencyKey: parsed.idempotencyKey,
        createdByAgentId: null,
      })
      .returning();

    await logVideoEvent(ctx, 'video.job_created', inserted!, {
      mode: 'edit',
      sourceUrl: parsed.sourceUrl,
      aspectRatio: parsed.aspectRatio,
      provider: providerStatus.provider,
      idempotencyKey: parsed.idempotencyKey,
    });
    await logVideoEvent(ctx, 'video.failed', inserted!, {
      mode: 'edit',
      provider: providerStatus.provider,
      reason: error,
    });

    return inserted!;
  }

  const { prompt, style, aspectRatio, durationSec, ctaBrief, idempotencyKey } = parsed;

  if (providerStatus.state === 'provider_not_configured') {
    const error = 'Live video generation provider is not configured. Add a server-side FAL_KEY or FAL_API_KEY before requesting a paid render.';
    const [inserted] = await ctx.db
      .insert(videoJobs)
      .values({
        orgId: ctx.orgId,
        mode: 'generate',
        prompt,
        ctaBrief,
        style,
        aspectRatio,
        durationSec,
        status: 'provider_not_configured',
        provider: providerStatus.provider,
        costCents: 0,
        error,
        idempotencyKey,
        createdByAgentId: null,
      })
      .returning();

    await logVideoEvent(ctx, 'video.job_created', inserted!, {
      mode: 'generate',
      prompt,
      style,
      aspectRatio,
      durationSec,
      provider: providerStatus.provider,
      idempotencyKey,
    });
    await logVideoEvent(ctx, 'video.failed', inserted!, {
      mode: 'generate',
      provider: providerStatus.provider,
      reason: error,
    });

    return inserted!;
  }

  if (adapter.provider === 'mock') {
    // In mock mode: create job as queued, run mock adapter, mark completed
    const [inserted] = await ctx.db
      .insert(videoJobs)
      .values({
        orgId: ctx.orgId,
        mode: 'generate',
        prompt,
        ctaBrief,
        style,
        aspectRatio,
        durationSec,
        status: 'queued',
        provider: 'mock',
        idempotencyKey,
        createdByAgentId: null,
      })
      .returning();

    await logVideoEvent(ctx, 'video.job_created', inserted!, {
      mode: 'generate',
      prompt,
      style,
      aspectRatio,
      durationSec,
      provider: 'mock',
      idempotencyKey,
    });

    const promptWithCta = ctaBrief ? `${prompt}\nCTA brief: ${ctaBrief}` : prompt;
    const res = await adapter.generate({ prompt: promptWithCta, style, aspectRatio, durationSec });

    const [updated] = await ctx.db
      .update(videoJobs)
      .set({
        status: res.status,
        resultUrl: res.resultUrl,
        thumbnailUrl: res.thumbnailUrl,
        costCents: res.costCents,
        error: res.error,
        updatedAt: ctx.now ?? new Date(),
      })
      .where(eq(videoJobs.id, inserted!.id))
      .returning();

    await logVideoEvent(ctx, res.status === 'completed' ? 'video.generated' : 'video.failed', updated!, {
      mode: 'generate',
      prompt,
      style,
      aspectRatio,
      durationSec,
      provider: 'mock',
      costCents: res.costCents,
      error: res.error,
    });

    return updated!;
  }

  // In live mode (e.g. fal): set status:'needs_approval' and create a PENDING approval
  const [inserted] = await ctx.db
    .insert(videoJobs)
    .values({
      orgId: ctx.orgId,
      mode: 'generate',
      prompt,
      ctaBrief,
      style,
      aspectRatio,
      durationSec,
      status: 'needs_approval',
      provider: adapter.provider,
      idempotencyKey,
      createdByAgentId: null,
    })
    .returning();

  await logVideoEvent(ctx, 'video.job_created', inserted!, {
    mode: 'generate',
    prompt,
    style,
    aspectRatio,
    durationSec,
    provider: adapter.provider,
    idempotencyKey,
  });

  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      orgId: ctx.orgId,
      action: {
        type: 'tool',
        toolName: 'video.dispatch',
        args: {
          jobId: inserted!.id,
        },
        summary: `Generate video: "${prompt.slice(0, 40)}"`,
      },
      status: 'pending',
    })
    .returning();

  const [updated] = await ctx.db
    .update(videoJobs)
    .set({ approvalId: approval!.id })
    .where(eq(videoJobs.id, inserted!.id))
    .returning();

  await logVideoEvent(ctx, 'video.approval_requested', updated!, {
    mode: 'generate',
    approvalId: approval!.id,
    provider: adapter.provider,
  });

  return updated!;
}

export async function dispatchApproved(
  ctx: AgentContext,
  jobId: string,
  approvalId?: string,
): Promise<VideoJob> {
  const [job] = await ctx.db
    .select()
    .from(videoJobs)
    .where(and(eq(videoJobs.id, jobId), eq(videoJobs.orgId, ctx.orgId)))
    .limit(1);

  if (!job) throw new Error('Video job not found');

  if (job.status === 'completed' || job.status === 'processing') return job;
  if (job.mode === 'edit') {
    const error = 'Video editing dispatch is unavailable because no verified provider edit API is configured.';
    const [updated] = await ctx.db
      .update(videoJobs)
      .set({
        status: 'provider_not_configured',
        error,
        updatedAt: ctx.now ?? new Date(),
      })
      .where(eq(videoJobs.id, job.id))
      .returning();
    await logVideoEvent(ctx, 'video.failed', updated!, {
      mode: 'edit',
      provider: job.provider,
      reason: error,
    });
    return updated!;
  }

  const targetApprovalId = job.approvalId ?? approvalId;
  if (!targetApprovalId) throw new Error('Approval is not approved');

  const [approval] = await ctx.db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, targetApprovalId), eq(approvals.orgId, ctx.orgId)))
    .limit(1);

  if (!approval || approval.status !== 'approved') {
    throw new Error('Approval is not approved');
  }

  const providerStatus = getVideoProviderStatus();
  if (providerStatus.state === 'provider_not_configured') {
    const error = 'Live video generation provider is not configured. Add a server-side FAL_KEY or FAL_API_KEY before dispatching.';
    const [updated] = await ctx.db
      .update(videoJobs)
      .set({
        status: 'provider_not_configured',
        provider: providerStatus.provider,
        error,
        updatedAt: ctx.now ?? new Date(),
      })
      .where(eq(videoJobs.id, job.id))
      .returning();
    await logVideoEvent(ctx, 'video.failed', updated!, {
      mode: 'generate',
      provider: providerStatus.provider,
      reason: error,
    });
    return updated!;
  }

  await logVideoEvent(ctx, 'video.dispatch_started', job, {
    mode: 'generate',
    provider: providerStatus.provider,
    approvalId: targetApprovalId,
  });

  const adapter = getVideoAdapter();
  const res: VideoJobResult = await adapter
    .generate({
      prompt: job.ctaBrief ? `${job.prompt}\nCTA brief: ${job.ctaBrief}` : job.prompt,
      style: job.style ?? undefined,
      aspectRatio: job.aspectRatio ?? undefined,
      durationSec: job.durationSec ?? undefined,
    })
    .catch((err: unknown) => ({
      jobId: job.id,
      status: 'failed' as const,
      resultUrl: undefined,
      thumbnailUrl: undefined,
      costCents: 0,
      provider: adapter.provider,
      error: err instanceof Error ? err.message : String(err),
    }));

  const [updated] = await ctx.db
    .update(videoJobs)
    .set({
      status: res.status,
      resultUrl: res.resultUrl,
      thumbnailUrl: res.thumbnailUrl,
      costCents: res.costCents,
      error: res.error,
      updatedAt: ctx.now ?? new Date(),
    })
    .where(eq(videoJobs.id, job.id))
    .returning();

  await logVideoEvent(ctx, res.status === 'completed' ? 'video.generated' : 'video.failed', updated!, {
    mode: 'generate',
    prompt: job.prompt,
    provider: adapter.provider,
    costCents: res.costCents,
    error: res.error,
  });

  return updated!;
}
