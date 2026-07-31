// Competitor ad-intelligence service (CONTRACTS / Wave 2B).
// Scans a competitor's Google Ads presence across regions via the Transparency
// adapter, stores org-scoped scan rows, and builds an ad-count matrix.

import { and, desc, eq } from 'drizzle-orm';
import { competitorAdScans, type CompetitorAdScan } from '@growthcrew/db';
import { getAdIntelAdapter, REGIONS, type AdCreative } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';

export interface ScanCompetitorInput {
  competitorId?: string;
  advertiserId: string;
  advertiserName?: string;
  regions?: string[];
}

export interface MatrixRow {
  region: string;
  adCount: number;
  scannedAt: Date;
}

export async function scanCompetitor(
  ctx: AgentContext,
  input: ScanCompetitorInput,
): Promise<CompetitorAdScan[]> {
  const adapter = getAdIntelAdapter();
  const regions = input.regions?.length ? input.regions : REGIONS.map((r) => r.code);
  const rows: CompetitorAdScan[] = [];

  for (const region of regions) {
    const result = await adapter.scanRegion({ advertiserId: input.advertiserId, region });

    const [row] = await ctx.db
      .insert(competitorAdScans)
      .values({
        orgId: ctx.orgId,
        competitorId: input.competitorId ?? null,
        advertiserId: input.advertiserId,
        advertiserName: result.advertiserName ?? input.advertiserName ?? null,
        region,
        adCount: result.adCount,
        creatives: result.creatives as Record<string, unknown>[],
        raw: result.raw ?? null,
      })
      .returning();

    await ctx.audit.log({
      actorType: 'user',
      actorId: ctx.userId ?? 'unknown',
      action: 'adintel.scanned',
      entityType: 'competitor_ad_scan',
      entityId: row!.id,
      payload: {
        advertiserId: input.advertiserId,
        region,
        adCount: result.adCount,
        creatives: result.creatives.length,
      },
    });

    rows.push(row!);
  }

  return rows;
}

export async function matrix(
  ctx: AgentContext,
  competitorId: string,
): Promise<{ regions: string[]; rows: MatrixRow[] }> {
  const scans = await ctx.db
    .select()
    .from(competitorAdScans)
    .where(and(eq(competitorAdScans.orgId, ctx.orgId), eq(competitorAdScans.competitorId, competitorId)))
    .orderBy(desc(competitorAdScans.scannedAt));

  // Latest scan per region
  const latestByRegion = new Map<string, CompetitorAdScan>();
  for (const scan of scans) {
    const region = scan.region ?? 'unknown';
    if (!latestByRegion.has(region)) latestByRegion.set(region, scan);
  }

  const rows: MatrixRow[] = [...latestByRegion.values()].map((s) => ({
    region: s.region ?? 'unknown',
    adCount: s.adCount ?? 0,
    scannedAt: s.scannedAt,
  }));

  return { regions: REGIONS.map((r) => r.code), rows };
}

export async function listScans(
  ctx: AgentContext,
  opts?: { competitorId?: string },
): Promise<CompetitorAdScan[]> {
  const conditions = [eq(competitorAdScans.orgId, ctx.orgId)];
  if (opts?.competitorId) conditions.push(eq(competitorAdScans.competitorId, opts.competitorId));

  return ctx.db
    .select()
    .from(competitorAdScans)
    .where(and(...conditions))
    .orderBy(desc(competitorAdScans.scannedAt))
    .limit(100);
}

export async function creatives(ctx: AgentContext, scanId: string): Promise<AdCreative[]> {
  const [scan] = await ctx.db
    .select()
    .from(competitorAdScans)
    .where(and(eq(competitorAdScans.id, scanId), eq(competitorAdScans.orgId, ctx.orgId)))
    .limit(1);
  if (!scan) throw new Error('Scan not found');
  return (scan.creatives ?? []) as AdCreative[];
}
