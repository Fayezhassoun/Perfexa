// Campaign services (CONTRACTS §5): mirror reads + sandbox pause/resume.
// The connected-account mode is authoritative so stale mirror rows cannot
// expose controls that are impossible during the read-only live pilot.

import { and, desc, eq } from 'drizzle-orm';
import { approvals, campaignsMirror, connectedAccounts, type CampaignMirror } from '@growthcrew/db';
import type { AdPlatform } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';

async function applyEffectiveModes(ctx: AgentContext, rows: CampaignMirror[]): Promise<CampaignMirror[]> {
  const accounts = await ctx.db
    .select({ platform: connectedAccounts.platform, mode: connectedAccounts.mode })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.orgId, ctx.orgId));
  const modeByPlatform = new Map(
    accounts.map((account) => [account.platform, account.mode === 'live' ? 'live' : 'sandbox'] as const),
  );
  return rows.map((row) => {
    const effectiveMode = modeByPlatform.get(row.platform ?? '');
    return effectiveMode ? { ...row, mode: effectiveMode } : row;
  });
}

export async function listCampaigns(ctx: AgentContext, platform?: string): Promise<CampaignMirror[]> {
  const where = platform
    ? and(eq(campaignsMirror.orgId, ctx.orgId), eq(campaignsMirror.platform, platform))
    : eq(campaignsMirror.orgId, ctx.orgId);
  const rows = await ctx.db.select().from(campaignsMirror).where(where).orderBy(desc(campaignsMirror.updatedAt));
  return applyEffectiveModes(ctx, rows);
}

export async function getCampaign(ctx: AgentContext, id: string): Promise<CampaignMirror> {
  const [row] = await ctx.db
    .select()
    .from(campaignsMirror)
    .where(and(eq(campaignsMirror.id, id), eq(campaignsMirror.orgId, ctx.orgId)))
    .limit(1);
  if (!row) throw new Error('Campaign not found');
  const [campaign] = await applyEffectiveModes(ctx, [row]);
  return campaign!;
}

export async function pauseCampaign(ctx: AgentContext, id: string): Promise<{ ok: true }> {
  const row = await getCampaign(ctx, id);
  if (!row.externalId) throw new Error('Campaign has no external id');
  if (row.mode === 'live') throw new Error('Live campaign changes are disabled during the read-only pilot.');
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
  if (row.mode === 'live') throw new Error('Live campaign changes are disabled during the read-only pilot.');
  const args = { platform: row.platform as AdPlatform, externalId: row.externalId };
  const action = { type: 'tool', toolName: 'ads.resume_campaign', args, summary: `Resume "${row.name}"` };

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
