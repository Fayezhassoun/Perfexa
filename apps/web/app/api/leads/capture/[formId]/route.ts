// PUBLIC lead capture (CONTRACTS §6): no auth, CORS *, validated against the
// form's own field definitions, scored, audit-logged.

import { NextResponse } from 'next/server';
import { db } from '@voxmarketer/db';
import { services } from '@voxmarketer/agents';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}

export async function POST(req: Request, { params }: { params: { formId: string } }) {
  if (!rateLimit(`capture:${clientIp(req.headers)}`, 10, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: cors });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400, headers: cors });
  }

  const result = await services.leads.captureLead(db, params.formId, body);
  if ('error' in result) {
    const status = result.error === 'Form not found' ? 404 : 400;
    return NextResponse.json(result, { status, headers: cors });
  }
  return NextResponse.json({ ok: true, leadId: result.lead.id }, { headers: cors });
}
