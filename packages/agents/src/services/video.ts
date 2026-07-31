// Video generation service (CONTRACTS / Wave 2A).
// Handles job creation, mock vs live gating behind approvals, and dispatching approved jobs.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, videoJobs, type VideoJob } from '@growthcrew/db';
import { getVideoAdapter } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';

export interface CreateJobInput {
  prompt: string;
  style?: string; // ugc|product_demo|cinematic|slideshow
  aspectRatio?: string; // 9:16|1:1|16:9
  durationSec?: number;
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

export async function createJob(ctx: AgentContext, input: CreateJobInput): Promise<VideoJob> {
  const style = input.style ?? 'ugc';
  const aspectRatio = input.aspectRatio ?? '9:16';
  const durationSec = input.durationSec ?? 15;

  const adapter = getVideoAdapter();

  if (adapter.provider === 'mock') {
    // In mock mode: create job as queued, run mock adapter, mark completed
    const [inserted] = await ctx.db
      .insert(videoJobs)
      .values({
        orgId: ctx.orgId,
        prompt: input.prompt,
        style,
        aspectRatio,
        durationSec,
        status: 'queued',
        provider: 'mock',
        createdByAgentId: null,
      })
      .returning();

    const res = await adapter.generate({ prompt: input.prompt, style, aspectRatio, durationSec });

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

    await ctx.audit.log({
      actorType: 'user',
      actorId: ctx.userId ?? 'unknown',
      action: 'video.generated',
      entityType: 'video_job',
      entityId: updated!.id,
      payload: {
        prompt: input.prompt,
        style,
        aspectRatio,
        durationSec,
        provider: 'mock',
        costCents: res.costCents,
      },
    });

    return updated!;
  }

  // In live mode (e.g. fal): set status:'needs_approval' and create a PENDING approval
  const [inserted] = await ctx.db
    .insert(videoJobs)
    .values({
      orgId: ctx.orgId,
      prompt: input.prompt,
      style,
      aspectRatio,
      durationSec,
      status: 'needs_approval',
      provider: adapter.provider,
      createdByAgentId: null,
    })
    .returning();

  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      orgId: ctx.orgId,
      action: {
        type: 'tool',
        toolName: 'video.generate',
        args: {
          prompt: input.prompt,
          style,
          aspectRatio,
          durationSec,
        },
        summary: `Generate video: "${input.prompt.slice(0, 40)}"`,
      },
      status: 'pending',
    })
    .returning();

  const [updated] = await ctx.db
    .update(videoJobs)
    .set({ approvalId: approval!.id })
    .where(eq(videoJobs.id, inserted!.id))
    .returning();

  return updated!;
}

export async function dispatchApproved(ctx: AgentContext, jobId: string, approvalId?: string): Promise<VideoJob> {
  const [job] = await ctx.db
    .select()
    .from(videoJobs)
    .where(and(eq(videoJobs.id, jobId), eq(videoJobs.orgId, ctx.orgId)))
    .limit(1);

  if (!job) throw new Error('Video job not found');

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

  const adapter = getVideoAdapter();
  const res = await adapter.generate({
    prompt: job.prompt,
    style: job.style ?? undefined,
    aspectRatio: job.aspectRatio ?? undefined,
    durationSec: job.durationSec ?? undefined,
  });

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

  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'video.generated',
    entityType: 'video_job',
    entityId: job.id,
    payload: {
      prompt: job.prompt,
      provider: adapter.provider,
      costCents: res.costCents,
    },
  });

  return updated!;
}
