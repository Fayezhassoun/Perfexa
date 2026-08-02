// First-party product analytics (Fox Biz Phase 2): a lightweight, privacy-safe
// usage-telemetry pipeline written to product_events — deliberately NOT the
// immutable audit_logs, which is a user-facing audit trail. Pure, cheap, no LLM.
// Powers the "50%+ weekly active / 30%+ connect a live account" retention metrics.

import { and, eq, gte } from 'drizzle-orm';
import { productEvents } from '@growthcrew/db';
import type { AgentContext } from '../types.js';

/**
 * Closed event vocabulary — the only events that may be recorded. Internal
 * callers are typed to it; the client-facing trackEvent router validates
 * against the same tuple, so this is the single source of truth.
 */
export const ANALYTICS_EVENTS = [
  'report_generated',
  'report_emailed',
  'report_shared',
  'sync_run',
  'integration_connected',
  'alert_viewed',
  'proof_flow_opened',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const EVENT_SET = new Set<string>(ANALYTICS_EVENTS);

export function isAnalyticsEvent(event: string): event is AnalyticsEvent {
  return EVENT_SET.has(event);
}

/** Record one product event for the org (and acting user, when known). */
export async function track(
  ctx: AgentContext,
  event: AnalyticsEvent,
  props?: Record<string, unknown>,
): Promise<void> {
  await ctx.db.insert(productEvents).values({
    orgId: ctx.orgId,
    userId: ctx.userId ?? null,
    event,
    props: props ?? null,
  });
}

export interface OrgActivity {
  orgId: string;
  windowDays: number;
  totalEvents: number;
  /** Distinct calendar days (UTC) on which the org emitted at least one event. */
  activeDays: number;
  lastActiveAt: Date | null;
  eventsByType: Record<string, number>;
}

/**
 * Per-org engagement over the last `days` days: distinct active days, event
 * counts by type, and the last-active timestamp. Aggregated in-memory over the
 * window (same style as the weekly-report aggregation) — cheap at org scale.
 */
export async function getOrgActivity(ctx: AgentContext, days = 30): Promise<OrgActivity> {
  const since = new Date((ctx.now ?? new Date()).getTime() - days * 86_400_000);
  const rows = await ctx.db
    .select({ event: productEvents.event, createdAt: productEvents.createdAt })
    .from(productEvents)
    .where(and(eq(productEvents.orgId, ctx.orgId), gte(productEvents.createdAt, since)));

  const eventsByType: Record<string, number> = {};
  const activeDays = new Set<string>();
  let lastActiveAt: Date | null = null;
  for (const row of rows) {
    eventsByType[row.event] = (eventsByType[row.event] ?? 0) + 1;
    activeDays.add(row.createdAt.toISOString().slice(0, 10));
    if (!lastActiveAt || row.createdAt > lastActiveAt) lastActiveAt = row.createdAt;
  }

  return {
    orgId: ctx.orgId,
    windowDays: days,
    totalEvents: rows.length,
    activeDays: activeDays.size,
    lastActiveAt,
    eventsByType,
  };
}
