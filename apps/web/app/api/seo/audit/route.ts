// Technical SEO audit trigger (GROWTHCREW_VISIBILITY_PHASE2.md Feature 1).
// Runs REAL deterministic checks (PageSpeed + robots/sitemap/crawl) against the
// org's site — never simulated. Rate-limited like the GEO scan: 1 manual audit
// per 6h per org; ?force=1 bypasses the limit only, never the checks.

import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { seoAudits, seoFindings } from '@growthcrew/db';
import { services, type AgentContext } from '@growthcrew/agents';
import { z } from 'zod';
import { rateLimit } from '@/lib/rate-limit';
import { requireGeoContext, jsonSafe } from '@/server/geo';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const bodySchema = z.object({
  siteUrl: z.string().trim().max(500).optional(),
});

async function hasInFlightAudit(ctx: AgentContext, orgId: string): Promise<boolean> {
  const [row] = await ctx.db
    .select({ id: seoAudits.id })
    .from(seoAudits)
    .where(and(eq(seoAudits.orgId, orgId), inArray(seoAudits.status, ['pending', 'running'])))
    .limit(1);
  return Boolean(row);
}

export async function POST(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;
  const { ctx, orgId } = auth;

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* body optional — defaults to the org's website URL */
  }
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'siteUrl must be a string' }, { status: 400 });
  }

  if (await hasInFlightAudit(ctx, orgId)) {
    return NextResponse.json({ error: 'an audit is already running' }, { status: 409 });
  }

  if (!force && !rateLimit(`seo-audit:${orgId}`, 1, SIX_HOURS_MS).ok) {
    return NextResponse.json({ error: 'rate_limited', retryAfterHours: 6 }, { status: 429 });
  }

  try {
    const outcome = await services.seoAudit.runSeoAudit(ctx, {
      siteUrl: parsed.data.siteUrl,
      trigger: 'manual',
    });
    if (outcome.status === 'skipped') {
      return NextResponse.json(
        { error: 'No site to audit — set your organization website URL or pass siteUrl.' },
        { status: 400 },
      );
    }
    const findings = await ctx.db
      .select()
      .from(seoFindings)
      .where(eq(seoFindings.auditId, outcome.audit.id));
    const summary = services.seoAudit.summarizeAudit(outcome.audit, findings);
    return NextResponse.json({ summary: jsonSafe(summary) }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'audit failed';
    // Invalid site URL (normalizeSiteUrl) → client error; anything else 502.
    if (/site url/i.test(message) || /invalid url/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
