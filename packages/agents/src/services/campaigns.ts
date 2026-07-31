// Campaign services (CONTRACTS §5): mirror reads + pause/resume.
// Pause is always safe (non-gated). Resume spends → sandbox executes behind an
// auto-recorded approval; live mode creates a pending approval instead.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, campaignsMirror, type CampaignMirror } from '@growthcrew/db';
import type { AdPlatform } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';

export async function listCampaigns(ctx: AgentContext, platform?: string): Promise<CampaignMirror[]> {
  const where = platform
    ? and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.platform, platform))
    : eq(campaignsMirror.orgId, ctx.orgId);
  return ctx.db.select().from(campaignsMirror).where(where).orderBy(desc(campaignsMirror.updatedAt));
}

export async function getCampaign(ctx: AgentContext, id: string): Promise<CampaignMirror> {
  const [row] = await ctx.db
    .select()
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.id, id), eq(campaignsMirror.orgId, ctx.orgId)))
    .limit(1);
  if (!row) throw new Error('Campaign not found');
  return row;
}

export async function pauseCampaign(ctx: AgentContext, id: string): Promise<{ ok: true }> {
  const row = await getCampaign(ctx, id);
  if (!row.externalId) throw new Error('Campaign has no external id');
  await executeTool(ctx, 'ads.pause_campaign', { platform: row.platform as AdPlatform, externalId: row.externalId });
  return { ok: true };
}

export interface ResumeResult {
  pending: boolean;
  approvalId?: string;
  message: string;
}

export async function resumeCampaign(ctx: AgentContext, id: string, via: 'voice' | 'click'): Promise<ResumeResult> {
  const row = await getCampaign(ctx, id);
  if (!row.externalId) throw new Error('Campaign has no external id');
  const args = { platform: row.platform as AdPlatform, externalId: row.externalId };
  const action = { type: 'tool', toolName: 'ads.resume_campaign', args, summary: `Resume "${row.name}"` };

  if (row.mode === 'live') {
    const [approval] = await ctx.db
      .insert(approvals)
      .values({ orgId: ctx.orgId, action, status: 'pending' })
      .returning();
    await ctx.audit.log({
      actorType: 'system',
      actorId: 'approval-gate',
      action: 'approval.requested',
      entityType: 'campaign',
      entityId: id,
      payload: { toolName: 'ads.resume_campaign', mode: 'live' },
    });
    return {
      pending: true,
      approvalId: approval!.id,
      message: `"${row.name}" is on a live account — resuming spends real money, so it needs your explicit approval.`,
    };
  }

  // Sandbox: execute immediately, but still behind a recorded approval (CONTRACTS §5).
  const [approval] = await ctx.db
    .insert(approvals)
    .values({
      orgId: ctx.orgId,
      action,
      status: 'approved',
      decidedBy: ctx.userId ?? null,
      decidedVia: via,
      decidedAt: ctx.now ?? new Date(),
    })
    .returning();
  await executeTool(ctx, 'ads.resume_campaign', { ...args, __approvalId: approval!.id });
  return { pending: false, message: `"${row.name}" is running again (sandbox — no real spend).` };
}
