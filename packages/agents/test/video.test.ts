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
    delete process.env.FAL_KEY;
    delete process.env.FAL_API_KEY;
  });

  it('mock mode: createJob completes instantly with a result + audit log', async () => {
    process.env.VIDEO_PROVIDER = 'mock';
    const { ctx, orgId } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'unboxing a skincare set, vertical UGC' });

    expect(job.status).toBe('completed');
    expect(job.mode).toBe('generate');
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
    process.env.FAL_KEY = 'test-fal-key';
    const { ctx, orgId } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'cinematic product hero shot', ctaBrief: 'Book a demo' });

    expect(job.status).toBe('needs_approval');
    expect(job.mode).toBe('generate');
    expect(job.provider).toBe('fal');
    expect(job.approvalId).toBeTruthy();
    expect(job.ctaBrief).toBe('Book a demo');

    const [approval] = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.orgId, orgId), eq(approvals.id, job.approvalId!)));
    expect(approval?.status).toBe('pending');
    expect((approval?.action as { toolName?: string }).toolName).toBe('video.dispatch');
  });

  it('live mode without provider key records provider_not_configured and does not create approval', async () => {
    process.env.VIDEO_PROVIDER = 'fal';
    const { ctx, orgId } = await freshOrg();

    const job = await createJob(ctx, { prompt: 'cinematic product hero shot' });

    expect(job.status).toBe('provider_not_configured');
    expect(job.provider).toBe('fal');
    expect(job.approvalId).toBeNull();
    expect(job.error).toContain('FAL_KEY');

    const rows = await db.select().from(approvals).where(eq(approvals.orgId, orgId));
    expect(rows).toHaveLength(0);
  });

  it('edit mode records source URL and unavailable provider state without fake output', async () => {
    process.env.VIDEO_PROVIDER = 'mock';
    const { ctx } = await freshOrg();

    const job = await createJob(ctx, {
      mode: 'edit',
      sourceUrl: 'https://cdn.example.com/source.mp4',
      editInstructions: 'Cut to the hook and add captions',
      aspectRatio: '1:1',
      trimStartSec: 2,
      trimEndSec: 12,
      overlayText: 'Book today',
    });

    expect(job.mode).toBe('edit');
    expect(job.status).toBe('provider_not_configured');
    expect(job.sourceUrl).toBe('https://cdn.example.com/source.mp4');
    expect(job.editInstructions).toBe('Cut to the hook and add captions');
    expect(job.durationSec).toBe(10);
    expect(job.resultUrl).toBeNull();
    expect(job.costCents).toBe(0);
  });

  it('rejects non-HTTPS edit source URLs and invalid trim bounds', async () => {
    const { ctx } = await freshOrg();

    await expect(
      createJob(ctx, {
        mode: 'edit',
        sourceUrl: 'http://cdn.example.com/source.mp4',
        editInstructions: 'Cut to the hook',
      }),
    ).rejects.toThrow();

    await expect(
      createJob(ctx, {
        mode: 'edit',
        sourceUrl: 'https://cdn.example.com/source.mp4',
        editInstructions: 'Cut to the hook',
        trimStartSec: 20,
        trimEndSec: 10,
      }),
    ).rejects.toThrow();
  });

  it('createJob replays an existing org-scoped idempotency key', async () => {
    process.env.VIDEO_PROVIDER = 'mock';
    const { ctx } = await freshOrg();

    const first = await createJob(ctx, { prompt: 'org replay video', idempotencyKey: 'same-key' });
    const second = await createJob(ctx, { prompt: 'different prompt ignored on replay', idempotencyKey: 'same-key' });

    expect(second.id).toBe(first.id);
    expect(second.prompt).toBe('org replay video');
  });

  it('dispatchApproved refuses to render without an approved approval', async () => {
    process.env.VIDEO_PROVIDER = 'fal';
    process.env.FAL_KEY = 'test-fal-key';
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
