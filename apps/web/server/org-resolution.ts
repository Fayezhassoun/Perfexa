// Active-org resolution (CONTRACTS §5): the `vox_org` cookie picks the active
// org when the user is a member of it; otherwise the oldest membership wins
// (deterministic — replaces the old unordered LIMIT 1 lookups).

import { cookies } from 'next/headers';
import type { Db, OrgMember } from '@sayso/db';
import { services } from '@sayso/agents';

export const ACTIVE_ORG_COOKIE = 'vox_org';

export interface ActiveOrgResolution {
  orgId: string | null;
  memberships: OrgMember[];
}

export async function resolveActiveOrg(db: Db, userId: string): Promise<ActiveOrgResolution> {
  const memberships = await services.orgs.listUserMemberships(db, userId);
  const cookieOrgId = cookies().get(ACTIVE_ORG_COOKIE)?.value ?? null;
  return { orgId: services.orgs.resolveActiveOrgId(memberships, cookieOrgId), memberships };
}
