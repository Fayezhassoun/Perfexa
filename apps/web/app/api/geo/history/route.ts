// GEO run history for the trend sparkline: last 12 runs, chronological, with
// combined + per-engine visibility. Runs with no results yield null (empty
// state), never fabricated numbers.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;
  const history = await services.geo.getHistory(auth.ctx, 12);
  return NextResponse.json({ history: jsonSafe(history) });
}
