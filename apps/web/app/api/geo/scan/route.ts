// Manual GEO scan trigger (GROWTHCREW_GEO_VISIBILITY.md §3). Runs a REAL scan
// against the configured engines. Rate-limited to 1 manual run / 6h / org;
// `?force=1` bypasses the limit (operator pattern mirroring the weekly-report
// cron) but never bypasses the budget guardrail or the honesty rail.

import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { geoRuns } from '@growthcrew/db';
import { services, type AgentContext } from '@growthcrew/agents';
import { rateLimit } from '@/lib/rate-limit';
import { requireGeoContext, jsonSafe } from '@/server/geo';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

async function hasInFlightRun(ctx: AgentContext, orgId: string): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: geoRuns.id })
    .from(geoRuns)
    .where(and(eq(geoRuns.orgId, orgId), inArray(geoRuns.status, ['pending', 'running'])))
    .limit(1);
  return Boolean(row);
}

export async function POST(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;
  const { ctx, orgId } = auth;

  const force = new URL(req.url).searchParams.get('force') === '1';

  // One in-flight run per org — a scan is expensive and metered.
  if (await hasInFlightRun(ctx, orgId)) {
    return NextResponse.json({ error: 'a scan is already running' }, { status: 409 });
  }

  if (!force && !rateLimit(`geo-scan:${orgId}`, 1, SIX_HOURS_MS).ok) {
    return NextResponse.json({ error: 'rate_limited', retryAfterHours: 6 }, { status: 429 });
  }

  const outcome = await services.geo.runGeoScan(ctx, { trigger: 'manual' });

  if (outcome.status === 'skipped') {
    const error =
      outcome.reason === 'no-prompts'
        ? 'Add at least one prompt before running a scan.'
        : 'No engines are configured. Set OPENROUTER_API_KEY and/or GEMINI_API_KEY.';
    return NextResponse.json({ error, reason: outcome.reason }, { status: 400 });
  }
  if (outcome.status === 'budget_exceeded') {
    return NextResponse.json(
      { error: 'Monthly AI budget reached — scans resume next month.' },
      { status: 402 },
    );
  }

  const summary = await services.geo.summarizeRun(ctx, outcome.run);
  return NextResponse.json({ run: jsonSafe(summary) }, { status: 201 });
}
