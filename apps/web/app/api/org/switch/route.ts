// Org switch (CONTRACTS §6): validates the session and that the user is a
// member of the target org, then sets the httpOnly vox_org cookie that
// active-org resolution reads (server/org-resolution.ts).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@sayso/db';
import { services } from '@sayso/agents';
import { auth } from '@/auth';
import { ACTIVE_ORG_COOKIE } from '@/server/org-resolution';

export async function POST(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* invalid JSON handled by zod below */
  }
  const parsed = z.object({ orgId: z.string().uuid() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'orgId (uuid) is required' }, { status: 400 });

  if (!(await services.orgs.isMember(db, userId, parsed.data.orgId))) {
    return NextResponse.json({ error: 'not a member of this organization' }, { status: 403 });
  }

  cookies().set(ACTIVE_ORG_COOKIE, parsed.data.orgId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
  });
  return NextResponse.json({ ok: true });
}
