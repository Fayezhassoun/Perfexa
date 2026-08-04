// GEO prompt-set CRUD (GROWTHCREW_GEO_VISIBILITY.md §3). Org-scoped; the
// 60-active-prompt cost ceiling is enforced in the service layer.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;
  const prompts = await services.geo.listPrompts(auth.ctx);
  return NextResponse.json({ prompts: jsonSafe(prompts), max: services.geo.GEO_MAX_ACTIVE_PROMPTS });
}

const createSchema = z.object({
  text: z.string().trim().min(1).max(500),
  category: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* handled by zod below */
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'text is required (max 500 chars)' }, { status: 400 });
  }

  try {
    const prompt = await services.geo.addPrompt(auth.ctx, parsed.data);
    return NextResponse.json({ prompt: jsonSafe(prompt) }, { status: 201 });
  } catch (err) {
    if (err instanceof services.geo.GeoPromptLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'failed to add prompt' },
      { status: 400 },
    );
  }
}

const updateSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(500).optional(),
  category: z.string().trim().max(80).nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* handled by zod below */
  }
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'id (uuid) is required' }, { status: 400 });
  }
  const { id, ...patch } = parsed.data;

  try {
    const prompt = await services.geo.updatePrompt(auth.ctx, id, patch);
    return NextResponse.json({ prompt: jsonSafe(prompt) });
  } catch (err) {
    if (err instanceof services.geo.GeoPromptLimitError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : 'failed to update prompt';
    return NextResponse.json({ error: message }, { status: message === 'Prompt not found' ? 404 : 400 });
  }
}

// DELETE deactivates (soft delete) so historical runs keep valid references.
export async function DELETE(req: Request) {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id query param is required' }, { status: 400 });

  try {
    await services.geo.removePrompt(auth.ctx, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to remove prompt';
    return NextResponse.json({ error: message }, { status: message === 'Prompt not found' ? 404 : 400 });
  }
}
