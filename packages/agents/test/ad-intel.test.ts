import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { auditLogs, competitorAdScans, competitors } from '@sayso/db';
import { scanCompetitor, matrix, listScans, creatives } from '../src/services/ad-intel.js';
import { db, freshOrg, truncateAll } from './helpers.js';

describe('ad-intel service', () => {
  beforeEach(async () => {
    await truncateAll(db);
    process.env.AD_INTEL_MODE = 'mock';
  });

  afterEach(() => {
    delete process.env.AD_INTEL_MODE;
  });

  it('scanCompetitor writes org-scoped rows + audit log', async () => {
    const { ctx, orgId } = await freshOrg();

    const rows = await scanCompetitor(ctx, {
      advertiserId: 'AR15714032992319963137',
      regions: ['SA', 'AE'],
    });

    expect(rows.length).toBe(2);
    expect(rows[0]!.orgId).toBe(orgId);
    expect(rows[0]!.region).toBe('SA');
    expect(rows[1]!.region).toBe('AE');
    expect(rows[0]!.adCount).toBeGreaterThanOrEqual(0);
    expect((rows[0]!.creatives as unknown[]).length).toBeGreaterThan(0);

    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, 'adintel.scanned')));
    expect(logs.length).toBe(2);
  });

  it('matrix returns one row per scanned region', async () => {
    const { ctx } = await freshOrg();
    const [competitor] = await db
      .insert(competitors)
      .values({ orgId: ctx.orgId, url: 'https://rival.com', name: 'Rival' })
      .returning();

    await scanCompetitor(ctx, {
      competitorId: competitor!.id,
      advertiserId: 'AR123',
      regions: ['SA', 'KW', 'MA'],
    });

    const result = await matrix(ctx, competitor!.id);
    expect(result.regions).toEqual(['SA', 'AE', 'KW', 'MA', 'DZ', 'CA', 'US']);
    expect(result.rows.length).toBe(3);
    const scannedRegions = result.rows.map((r) => r.region).sort();
    expect(scannedRegions).toEqual(['KW', 'MA', 'SA']);
  });

  it('scans never leak across orgs', async () => {
    const a = await freshOrg();
    const b = await freshOrg();

    await scanCompetitor(a.ctx, { advertiserId: 'AR-A', regions: ['SA'] });
    await scanCompetitor(b.ctx, { advertiserId: 'AR-B', regions: ['AE'] });

    const aScans = await listScans(a.ctx);
    const bScans = await listScans(b.ctx);

    expect(aScans.length).toBe(1);
    expect(aScans[0]!.advertiserId).toBe('AR-A');
    expect(bScans.length).toBe(1);
    expect(bScans[0]!.advertiserId).toBe('AR-B');
  });

  it('creatives returns captured creatives for a scan (org-scoped)', async () => {
    const { ctx } = await freshOrg();
    const [row] = await scanCompetitor(ctx, { advertiserId: 'AR-X', regions: ['SA'] });

    const result = await creatives(ctx, row!.id);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('headline');
  });

  it('creatives throws for another org\'s scan', async () => {
    const a = await freshOrg();
    const b = await freshOrg();

    const [row] = await scanCompetitor(a.ctx, { advertiserId: 'AR-X', regions: ['SA'] });
    await expect(creatives(b.ctx, row!.id)).rejects.toThrow('Scan not found');
  });
});
