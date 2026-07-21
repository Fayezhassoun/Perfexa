// Platform lead-ads webhook receiver (CONTRACTS §6). Mock-verified in phase 1:
// payload must carry the form id; sourceCampaignId is attached when resolvable.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { campaignsMirror, db } from '@voxmarketer/db';
import { services } from '@voxmarketer/agents';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const PLATFORMS = ['google_ads', 'meta', 'tiktok'] as const;

const bodySchema = z.object({
  formId: z.string().uuid(),
  campaignExternalId: z.string().optional(),
  lead: z.record(z.unknown()),
});

export async function POST(req: Request, { params }: { params: { platform: string } }) {
  if (!rateLimit(`webhook:${clientIp(req.headers)}`, 60, 60_000).ok) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }
  const platform = params.platform as (typeof PLATFORMS)[number];
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: 'unknown_platform' }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.flatten() }, { status: 400 });
  }
  const { formId, campaignExternalId, lead } = parsed.data;

  let sourceCampaignId: string | null = null;
  if (campaignExternalId) {
    const [campaign] = await db
      .select({ id: campaignsMirror.id })
      .from(campaignsMirror)
      .where(and(eq(campaignsMirror.platform, platform), eq(campaignsMirror.externalId, campaignExternalId)))
      .limit(1);
    sourceCampaignId = campaign?.id ?? null;
  }

  const result = await services.leads.captureLead(db, formId, lead as Record<string, unknown>, sourceCampaignId);
  if ('error' in result) {
    const status = result.error === 'Form not found' ? 404 : 400;
    return NextResponse.json(result, { status });
  }
  return NextResponse.json({ ok: true, leadId: result.lead.id });
}
