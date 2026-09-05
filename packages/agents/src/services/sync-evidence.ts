import { and, desc, eq } from 'drizzle-orm';
import { auditLogs, campaignsMirror, connectedAccounts } from '@growthcrew/db';
import type { AgentContext } from '../types.js';

export interface SyncEvidence {
  platform: string;
  externalAccountId: string;
  synced: number;
  syncedAt: string;
}

/** Successful provider reads only. Connection edits and token refreshes are not syncs. */
export async function getSyncEvidence(ctx: AgentContext): Promise<SyncEvidence[]> {
  const accounts = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.orgId, ctx.orgId));
  const events = await ctx.db.selectDistinctOn([auditLogs.entityId]).from(auditLogs)
    .where(and(eq(auditLogs.orgId, ctx.orgId), eq(auditLogs.action, 'sync.platform')))
    .orderBy(auditLogs.entityId, desc(auditLogs.createdAt));
  return events.flatMap((event) => {
    const m = event.metadata;
    const account = accounts.find((a) => a.id === event.entityId && a.externalAccountId === m?.externalAccountId);
    if (!account || !account.accessTokenEnc || !m || typeof m.platform !== 'string' ||
      typeof m.externalAccountId !== 'string' || typeof m.synced !== 'number' ||
      typeof m.syncedAt !== 'string') return [];
    return [{ platform: m.platform, externalAccountId: m.externalAccountId, synced: m.synced, syncedAt: m.syncedAt }];
  });
}

/** Exclude superseded live snapshots, including when the latest read was empty. */
export async function getCampaignSnapshot(ctx: AgentContext) {
  const rows = await ctx.db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, ctx.orgId));
  const syncs = await getSyncEvidence(ctx);
  const accounts = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.orgId, ctx.orgId));
  return rows.filter((row) => {
    if (row.mode !== 'live') return true;
    const metrics = row.metrics as { externalAccountId?: string; syncedAt?: string } | null;
    const account = accounts.find((a) => a.platform === row.platform);
    if (metrics?.externalAccountId && metrics.externalAccountId !== account?.externalAccountId) return false;
    const latest = syncs.find((s) => s.platform === row.platform);
    return !latest || metrics?.syncedAt === latest.syncedAt;
  });
}
