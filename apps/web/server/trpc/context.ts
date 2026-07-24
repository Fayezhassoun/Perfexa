// tRPC request context (CONTRACTS §5): session from Auth.js, orgId from
// active-org resolution (vox_org cookie + memberships, see org-resolution.ts).

import type { Session } from 'next-auth';
import { db, type Db, type OrgMember } from '@voxmarketer/db';
import { auth } from '@/auth';
import { resolveActiveOrg } from '@/server/org-resolution';

export interface Context {
  db: Db;
  session: Session | null;
  userId: string | null;
  orgId: string | null;
  memberships: OrgMember[];
}

export async function createContext(): Promise<Context> {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let orgId: string | null = null;
  let memberships: OrgMember[] = [];
  if (userId) {
    const resolved = await resolveActiveOrg(db, userId);
    orgId = resolved.orgId;
    memberships = resolved.memberships;
  }

  return { db, session, userId, orgId, memberships };
}
