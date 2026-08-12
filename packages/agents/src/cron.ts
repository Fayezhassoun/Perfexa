// Weekly GEO + SEO visibility cron handler (CONTRACTS §6/§11): runs the same
// pass as the worker's `geo-scan` queue — GEO scans, then a technical SEO
// audit per org — DIRECTLY in the web process, so it fires on hosts where the
// worker never starts (single Fly machine: no Redis, no BullMQ consumer).
//
// Guarded by the CRON_SECRET bearer header exactly like /api/cron/sync —
// without a matching secret the endpoint is inert (401). Mounted from
// apps/web/app/api/cron/geo/route.ts; the handler lives here so the auth
// contract is covered by the agents test suite.

import { db } from '@growthcrew/db';
import * as services from './services/index.js';

export async function handleGeoCron(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const run = await services.seoAudit.runGeoScansAndSeoAuditsForAllOrgs(db);
  return Response.json(run, { status: 200 });
}
