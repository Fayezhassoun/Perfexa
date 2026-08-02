// First-party product analytics: track() writes a product event keyed by
// org+user+event+timestamp; getOrgActivity() rolls up distinct active days,
// events by type, and last-active over a window (Fox Biz Phase 2 retention).

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { productEvents } from '@growthcrew/db';
import {
  ANALYTICS_EVENTS,
  getOrgActivity,
  isAnalyticsEvent,
  track,
} from '../src/services/analytics.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const NOW = new Date('2026-08-01T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 86_400_000);
}

beforeEach(async () => {
  await truncateAll(db);
});

describe('isAnalyticsEvent', () => {
  it('accepts only the closed vocabulary', () => {
    for (const event of ANALYTICS_EVENTS) expect(isAnalyticsEvent(event)).toBe(true);
    expect(isAnalyticsEvent('not_a_real_event')).toBe(false);
    expect(isAnalyticsEvent('')).toBe(false);
  });
});

describe('track', () => {
  it('writes a product event keyed by org + user + event with props', async () => {
    const { ctx, orgId, userId } = await freshOrg({ now: NOW });

    await track(ctx, 'sync_run', { platform: 'meta', synced: 3 });

    const rows = await db.select().from(productEvents).where(eq(productEvents.orgId, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orgId,
      userId,
      event: 'sync_run',
      props: { platform: 'meta', synced: 3 },
    });
  });

  it('stores null props and a null user when none is present', async () => {
    const { ctx, orgId } = await freshOrg({ now: NOW });
    const anonymous = { ...ctx, userId: undefined };

    await track(anonymous, 'report_generated');

    const [row] = await db.select().from(productEvents).where(eq(productEvents.orgId, orgId));
    expect(row!.event).toBe('report_generated');
    expect(row!.props).toBeNull();
    expect(row!.userId).toBeNull();
  });
});

describe('getOrgActivity', () => {
  async function seedEvent(orgId: string, event: string, createdAt: Date, userId?: string) {
    await db.insert(productEvents).values({ orgId, userId: userId ?? null, event, createdAt });
  }

  it('rolls up distinct active days, events by type, and last-active', async () => {
    const { ctx, orgId } = await freshOrg({ now: NOW });
    await seedEvent(orgId, 'sync_run', daysAgo(0));
    await seedEvent(orgId, 'report_generated', daysAgo(1));
    await seedEvent(orgId, 'report_generated', daysAgo(1));
    await seedEvent(orgId, 'sync_run', daysAgo(5));
    await seedEvent(orgId, 'sync_run', daysAgo(40)); // outside the 30-day window

    const activity = await getOrgActivity(ctx, 30);

    expect(activity.orgId).toBe(orgId);
    expect(activity.windowDays).toBe(30);
    expect(activity.totalEvents).toBe(4);
    expect(activity.activeDays).toBe(3); // day 0, -1, -5
    expect(activity.eventsByType).toEqual({ sync_run: 2, report_generated: 2 });
    expect(activity.lastActiveAt?.getTime()).toBe(daysAgo(0).getTime());
  });

  it('returns an empty shape for an org with no events', async () => {
    const { ctx, orgId } = await freshOrg({ now: NOW });

    const activity = await getOrgActivity(ctx);

    expect(activity).toEqual({
      orgId,
      windowDays: 30,
      totalEvents: 0,
      activeDays: 0,
      lastActiveAt: null,
      eventsByType: {},
    });
  });

  it('scopes activity to the org (no cross-org leakage)', async () => {
    const a = await freshOrg({ now: NOW });
    const b = await freshOrg({ now: NOW });
    await seedEvent(a.orgId, 'sync_run', daysAgo(0));
    await seedEvent(a.orgId, 'report_shared', daysAgo(2));
    await seedEvent(b.orgId, 'alert_viewed', daysAgo(1));

    const activityA = await getOrgActivity(a.ctx, 30);
    const activityB = await getOrgActivity(b.ctx, 30);

    expect(activityA.totalEvents).toBe(2);
    expect(activityA.eventsByType).toEqual({ sync_run: 1, report_shared: 1 });
    expect(activityB.totalEvents).toBe(1);
    expect(activityB.eventsByType).toEqual({ alert_viewed: 1 });
  });
});
