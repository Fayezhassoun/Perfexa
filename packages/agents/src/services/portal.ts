import { randomBytes } from 'node:crypto';
import { eq, and, or, isNull, gt, desc } from 'drizzle-orm';
import { db, portalConfigs, portalShareLinks, organizations, campaignsMirror, alerts } from '@growthcrew/db';
import type { PortalConfig } from '@growthcrew/db';

export interface PortalSummary {
  orgName: string;
  portalName: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  footerText?: string;
  showGrowthCrewBranding: boolean;
  campaigns: Array<{
    name: string;
    platform: string;
    status: string;
    spendCents: number;
    conversions: number;
    ctr: number;
  }>;
  alerts: Array<{
    severity: string;
    title: string;
    createdAt: Date;
  }>;
  totals: {
    spendCents: number;
    conversions: number;
    activeCampaigns: number;
  };
}

/** Get or create portal config for an org. */
export async function getPortalConfig(orgId: string) {
  const [existing] = await db.select().from(portalConfigs).where(eq(portalConfigs.orgId, orgId));
  if (existing) return existing;
  const [created] = await db.insert(portalConfigs).values({ orgId }).returning();
  return created;
}

/** Update portal config. */
export async function updatePortalConfig(orgId: string, config: Partial<PortalConfig>, enabled?: boolean) {
  await getPortalConfig(orgId);
  const [updated] = await db
    .update(portalConfigs)
    .set({
      config: config as PortalConfig,
      ...(enabled !== undefined ? { enabled } : {}),
      updatedAt: new Date(),
    })
    .where(eq(portalConfigs.orgId, orgId))
    .returning();
  return updated;
}

/** Create a share link with scopes and optional expiry. */
export async function createShareLink(orgId: string, label: string, scopes: string[], expiresInDays?: number) {
  const token = randomBytes(24).toString('base64url');
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400000) : null;
  const [link] = await db
    .insert(portalShareLinks)
    .values({ orgId, token, label, scopes, expiresAt })
    .returning();
  return { ...link, url: `/portal/${token}` };
}

/** List share links for an org. */
export async function listShareLinks(orgId: string) {
  return db.select().from(portalShareLinks).where(eq(portalShareLinks.orgId, orgId));
}

/** Revoke a share link. */
export async function revokeShareLink(orgId: string, linkId: string) {
  await db.delete(portalShareLinks).where(and(eq(portalShareLinks.id, linkId), eq(portalShareLinks.orgId, orgId)));
}

/** Resolve a share token to a public portal summary (no auth required). */
export async function resolvePortal(token: string): Promise<PortalSummary | null> {
  const [link] = await db
    .select()
    .from(portalShareLinks)
    .where(
      and(
        eq(portalShareLinks.token, token),
        or(isNull(portalShareLinks.expiresAt), gt(portalShareLinks.expiresAt, new Date())),
      ),
    );

  if (!link) return null;

  const [portal] = await db.select().from(portalConfigs).where(eq(portalConfigs.orgId, link.orgId));
  if (!portal?.enabled) return null;

  const [org] = await db.select().from(organizations).where(eq(organizations.id, link.orgId));
  if (!org) return null;

  const cfg = portal.config ?? {};

  // Gather campaign data
  const campaigns = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, link.orgId));
  const activeCampaigns = campaigns.filter((c) => c.status === 'active');

  const campaignSummaries = activeCampaigns.map((c) => {
    const m = (c.metrics ?? {}) as Record<string, number>;
    const impressions = m.impressions ?? 0;
    const clicks = m.clicks ?? 0;
    return {
      name: c.name ?? 'Unnamed',
      platform: c.platform ?? 'unknown',
      status: c.status ?? 'unknown',
      spendCents: m.spendCents ?? 0,
      conversions: m.conversions ?? 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0,
    };
  });

  const totals = {
    spendCents: campaignSummaries.reduce((s, c) => s + c.spendCents, 0),
    conversions: campaignSummaries.reduce((s, c) => s + c.conversions, 0),
    activeCampaigns: activeCampaigns.length,
  };

  // Recent alerts
  const recentAlerts = await db
    .select()
    .from(alerts)
    .where(eq(alerts.orgId, link.orgId))
    .orderBy(alerts.createdAt)
    .limit(5);

  return {
    orgName: org.name,
    portalName: cfg.portalName ?? org.name,
    logoUrl: cfg.logoUrl,
    primaryColor: cfg.primaryColor ?? '#2563eb',
    accentColor: cfg.accentColor ?? '#7c3aed',
    footerText: cfg.footerText ?? `Powered by ${cfg.showGrowthCrewBranding === false ? '' : 'GrowthCrew'}`,
    showGrowthCrewBranding: cfg.showGrowthCrewBranding ?? true,
    campaigns: campaignSummaries,
    alerts: recentAlerts.map((a) => ({ severity: a.severity ?? 'info', title: a.title ?? '', createdAt: a.createdAt })),
    totals,
  };
}
