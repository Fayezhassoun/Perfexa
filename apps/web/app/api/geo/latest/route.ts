// Latest GEO run summary (GROWTHCREW_GEO_VISIBILITY.md §3): per-engine
// visibility, share of voice, and the per-prompt table. Everything is computed
// from stored geo_results rows — an org with no data gets `{ run: null }` so the
// UI renders an empty state instead of invented metrics.

import { NextResponse } from 'next/server';
import { services } from '@growthcrew/agents';
import { requireGeoContext, jsonSafe } from '@/server/geo';

export async function GET() {
  const auth = await requireGeoContext();
  if (!auth.ok) return auth.response;

  const [summary, prompts] = await Promise.all([
    services.geo.getLatestSummary(auth.ctx),
    services.geo.listPrompts(auth.ctx, { activeOnly: true }),
  ]);

  // Engine availability for the header chips (configured ≠ tracked).
  const clients = services.geo.createGeoEngineClients(process.env);
  const config = {
    perplexityConfigured: Boolean(clients.perplexity),
    geminiConfigured: Boolean(clients.gemini),
    chatgpt: 'soon' as const,
  };

  if (!summary) {
    return NextResponse.json({ run: null, prompts: jsonSafe(prompts), config });
  }
  return NextResponse.json({ run: jsonSafe(summary), prompts: jsonSafe(prompts), config });
}
