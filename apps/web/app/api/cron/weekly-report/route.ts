// Weekly report cron endpoint (CONTRACTS §6/§11): builds a weekly report for
// every org and emails owners when RESEND_API_KEY is set. Behind CRON_SECRET.

import { NextResponse } from 'next/server';
import { db } from '@growthcrew/db';
import { services } from '@growthcrew/agents';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get('authorization');
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const run = await services.reports.runWeeklyReportsForAllOrgs(db);
  return NextResponse.json(run, { status: run.errors.length > 0 ? 207 : 200 });
}

