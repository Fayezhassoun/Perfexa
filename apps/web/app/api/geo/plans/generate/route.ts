// Content-plan generation (GROWTHCREW_VISIBILITY_PHASE2.md Feature 3).
// One DeepSeek brief per GEO visibility gap (brand absent in the latest run),
// stored as `idea` rows over 30/60/90 horizons. Idempotent: re-running adds
// nothing for a prompt+horizon that already has a plan.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function POST() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  try {
    const result = await services.geoPlans.generateContentPlans(auth.ctx);
    return NextResponse.json(
      jsonSafe({
        runId: result.runId,
        gaps: result.gaps,
        created: result.created,
        skippedExisting: result.skippedExisting,
      }),
      { status: result.created.length > 0 ? 201 : 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'plan generation failed';
    if (/no geo run|not found/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (/budget/i.test(message) || /DEEPSEEK_API_KEY/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
