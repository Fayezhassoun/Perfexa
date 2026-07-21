// tRPC request context (CONTRACTS §5): session from Auth.js, orgId from the
// user's first org membership.

import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { db, orgMembers, type Db } from '@voxmarketer/db';
import { auth } from '@/auth';

export interface Context {
  db: Db;
  session: Session | null;
  userId: string | null;
  orgId: string | null;
}

export async function createContext(): Promise<Context> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let orgId: string | null = null;
  if (userId) {
    const [membership] = await db
      .select({ orgId: orgMembers.orgId })
      .from(orgMembers)
      .where(eq(orgMembers.userId, userId))
      .limit(1);
    orgId = membership?.orgId ?? null;
  }

  return { db, session, userId, orgId };
}
