// SEO audit history (GROWTHCREW_VISIBILITY_PHASE2.md Feature 1): last 12
// audits with severity counts, newest first.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const history = await services.seoAudit.getAuditHistory(auth.ctx, 12);
  return NextResponse.json({ history: jsonSafe(history) });
}
