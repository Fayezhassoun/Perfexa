// Latest technical SEO audit (GROWTHCREW_VISIBILITY_PHASE2.md Feature 1).
// Everything traces to stored seo_findings rows; an org with no audit gets
// `{ summary: null }` so the UI renders an empty state — never invented scores.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const [summary, psiConfigured] = await Promise.all([
    services.seoAudit.getLatestAuditSummary(auth.ctx),
    Promise.resolve(Boolean((process.env.PAGESPEED_API_KEY ?? '').trim())),
  ]);

  if (!summary) {
    return NextResponse.json({ summary: null, psiConfigured });
  }
  return NextResponse.json({ summary: jsonSafe(summary), psiConfigured });
}
