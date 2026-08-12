// Weekly GEO + SEO visibility cron endpoint (CONTRACTS §6/§11). The auth +
// execution contract lives in @growthcrew/agents's `handleGeoCron` so the
// agents test suite covers it; this file only mounts the handler.

import { handleGeoCron } from '@growthcrew/agents';

export async function POST(req: Request): Promise<Response> {
  return handleGeoCron(req);
}
