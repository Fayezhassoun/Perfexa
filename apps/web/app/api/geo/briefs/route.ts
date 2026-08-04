// Content-brief generation for a visibility gap (GROWTHCREW_GEO_VISIBILITY.md
// §3). Stateless in Phase 1: generates via DeepSeek and returns JSON — nothing
// is stored.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { requireGeoContext } from '@/server/geo';

const bodySchema = z.object({ promptId: z.string().uuid() });

export async function POST(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* handled by zod below */
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'promptId (uuid) is required' }, { status: 400 });
  }

  try {
    const brief = await services.geo.generateGeoBrief(auth.ctx, { promptId: parsed.data.promptId });
    return NextResponse.json({ brief });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'brief generation failed';
    if (/not found/i.test(message)) return NextResponse.json({ error: message }, { status: 404 });
    if (/budget/i.test(message) || /DEEPSEEK_API_KEY/.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
