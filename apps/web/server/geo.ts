// Shared guard for /api/geo/* routes: feature flag, session auth, and
// active-org resolution (same pattern as the tRPC orgProcedure, adapted to
// standalone route handlers). Keeps the route files thin.

import { NextResponse } from 'next/server';
import { createAgentContext, type AgentContext } from '@growthcrew/agents';
import { env } from '@/lib/env';
import { createContext } from '@/server/trpc/context';

export type GeoAuth =
  | { ok: true; ctx: AgentContext; userId: string; orgId: string }
  | { ok: false; response: NextResponse };

/** Resolve an authenticated org-scoped AgentContext for GEO routes. */
export async function requireGeoContext(): Promise<GeoAuth> {
  if (!env.GEO_ENABLED) {
    return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  }
  const { userId, orgId, db } = await createContext();
  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) };
  }
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'no active organization' }, { status: 403 }),
    };
  }
  return { ok: true, ctx: createAgentContext({ db, orgId, userId }), userId, orgId };
}

/** Serialize a summary/history payload, converting Dates to ISO strings. */
export function jsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
