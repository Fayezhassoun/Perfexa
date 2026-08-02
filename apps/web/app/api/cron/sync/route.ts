// Live data sync cron endpoint (CONTRACTS §6/§7): pulls live campaigns from
// every org's connected ad platforms into campaigns_mirror. Behind CRON_SECRET,
// exactly like /api/cron/weekly-report — without a matching bearer secret the
// endpoint is inert (401). Scheduled every 6h (see fly.toml).

import { NextResponse } from 'next/server';
import { db } from '@growthcrew/db';
import { services } from '@growthcrew/agents';

export async function POST(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const run = await services.sync.syncAllOrgs(db);
  return NextResponse.json(run, { status: run.errors.length > 0 ? 207 : 200 });
}
