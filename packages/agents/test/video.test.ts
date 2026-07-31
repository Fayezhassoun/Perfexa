import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { approvals, auditLogs, videoJobs } from '@growthcrew/db';
import { createJob, dispatchApproved, listJobs } from '../src/services/video.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('video generation service', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  afterEach(() => {
    delete process.env.VIDEO_PROVIDER;
  });

  it('mock mode: createJob completes instantly with a result + audit log', async () => {
    process.env.VIDEO_PROVIDER = 'mock';
    const { ctx, orgId } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'unboxing a skincare set, vertical UGC' });

    expect(job.status).toBe('completed');
    expect(job.provider).toBe('mock');
    expect(job.resultUrl).toBeTruthy();
    expect(job.orgId).toBe(orgId);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, 'video.generated')));
    expect(logs.length).toBe(1);
  });

  it('live mode: createJob parks the job as needs_approval with a pending approval', async () => {
    process.env.VIDEO_PROVIDER = 'fal';
    const { ctx, orgId } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'cinematic product hero shot' });

    expect(job.status).toBe('needs_approval');
    expect(job.provider).toBe('fal');
    expect(job.approvalId).toBeTruthy();

    const [approval] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.id, job.approvalId!)));
    expect(approval?.status).toBe('pending');
  });

  it('dispatchApproved refuses to render without an approved approval', async () => {
    process.env.VIDEO_PROVIDER = 'fal';
    const { ctx } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'a demo that should not render yet' });
    await expect(dispatchApproved(ctx, job.id)).rejects.toThrow();
  });

  it('listJobs is org-scoped', async () => {
    process.env.VIDEO_PROVIDER = 'mock';
    const a = await freshOrg();
    const b = await freshOrg();

    await createJob(a.ctx, { prompt: 'org A video' });
    await createJob(b.ctx, { prompt: 'org B video' });

    const aJobs = await listJobs(a.ctx);
    expect(aJobs.length).toBe(1);
    expect(aJobs[0]!.prompt).toBe('org A video');
    expect(aJobs.every((j) => j.orgId === a.orgId)).toBe(true);
  });
});
