// Content calendar (GROWTHCREW_VISIBILITY_PHASE2.md Feature 3): list the
// org's 30/60/90 plans (horizon-first) with the gap prompt each one closes.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const plans = await services.geoPlans.listContentPlans(auth.ctx);
  return NextResponse.json({ plans: jsonSafe(plans) });
}
