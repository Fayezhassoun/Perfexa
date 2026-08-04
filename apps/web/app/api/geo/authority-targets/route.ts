// Authority targets (GROWTHCREW_VISIBILITY_PHASE2.md Feature 2): domains that
// cite competitors in AI answers but never the brand — computed ONLY from
// stored geo_results citations ($0, deterministic). No run yet → empty list.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const runId = new URL(req.url).searchParams.get('run_id');
  if (runId && runId !== 'latest' && !UUID_RE.test(runId)) {
    return NextResponse.json({ error: 'run_id must be "latest" or a run uuid' }, { status: 400 });
  }

  const result = await services.geo.getAuthorityTargets(auth.ctx, {
    ...(runId && runId !== 'latest' ? { runId } : {}),
  });
  return NextResponse.json(jsonSafe(result));
}
