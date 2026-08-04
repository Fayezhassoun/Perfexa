// Content-plan status transitions (GROWTHCREW_VISIBILITY_PHASE2.md Feature 3):
// idea → approved → drafted → published, forward-only.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { contentPlanStatusSchema } from '@growthcrew/db';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

const patchSchema = z.object({
  status: contentPlanStatusSchema,
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* handled by zod below */
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'status must be one of: idea, approved, drafted, published' },
      { status: 400 },
    );
  }

  try {
    const plan = await services.geoPlans.updateContentPlan(auth.ctx, params.id, {
      status: parsed.data.status,
    });
    return NextResponse.json({ plan: jsonSafe(plan) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to update plan';
    if (err instanceof services.geoPlans.ContentPlanTransitionError) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: message === 'Plan not found' ? 404 : 400 });
  }
}
