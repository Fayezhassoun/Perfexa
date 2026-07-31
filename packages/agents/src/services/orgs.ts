// Multi-org services (CONTRACTS §5): membership listing, active-org
// resolution, org creation, invite acceptance. These are user-scoped (the
// active org is the INPUT, not the ctx), so they take explicit args instead
// of AgentContext. Invite creation/removal lives in settings.ts (org-scoped).

import { and, asc, eq } from 'drizzle-orm';
import { orgInvites, orgMembers, organizations, type Db, type OrgMember, type Organization } from '@growthcrew/db';
import { createAuditLogger } from '../audit.js';

/** All of a user's memberships, oldest first (deterministic active-org fallback). */
export async function listUserMemberships(db: Db, userId: string): Promise<OrgMember[]> {
  return db.select().from(orgMembers).where(eq(orgMembers.userId, userId)).orderBy(asc(orgMembers.createdAt));
}

/**
 * Pick the active org: the cookie value wins when the user is actually a
 * member of it; otherwise fall back to the oldest membership.
 */
export function resolveActiveOrgId(memberships: OrgMember[], cookieOrgId: string | null): string | null {
  if (cookieOrgId && memberships.some((m) => m.orgId === cookieOrgId)) return cookieOrgId;
  return memberships[0]?.orgId ?? null;
}

export async function isMember(db: Db, userId: string, orgId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    .limit(1);
  return Boolean(row);
}

export interface UserOrg {
  org: Organization;
  role: string | null;
  active: boolean;
}

/** The user's orgs with role + active flag, for the switcher (CONTRACTS §5 orgs.list). */
export async function listUserOrgs(db: Db, userId: string, activeOrgId: string | null): Promise<UserOrg[]> {
  const memberships = await listUserMemberships(db, userId);
  const result: UserOrg[] = [];
  for (const m of memberships) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, m.orgId)).limit(1);
    if (org) result.push({ org, role: m.role, active: m.orgId === activeOrgId });
  }
  return result;
}

/**
 * Create an additional org shell (agency "Add business"): same shape as
 * registerUser's org — onboardingStep 'welcome', caller becomes owner.
 */
export async function createOrg(db: Db, userId: string, name: string): Promise<Organization> {
  const [org] = await db
    .insert(organizations)
    .values({ name, onboardingStep: 'welcome', monthlyBudgetCeilingCents: 50000, settings: {} })
    .returning();
  await db.insert(orgMembers).values({ orgId: org!.id, userId, role: 'owner' });
  await createAuditLogger(db, org!.id).log({
    actorType: 'user',
    actorId: userId,
    action: 'org.created',
    entityType: 'org',
    entityId: org!.id,
    payload: { name },
  });
  return org!;
}

export interface AcceptInviteResult {
  orgId: string;
  role: string | null;
}

/**
 * Accept an org invite (CONTRACTS §5 orgs.acceptInvite): token must exist,
 * be pending, and be unexpired. Membership is upserted (unique orgId+userId),
 * the invite is marked accepted. A retry by the SAME user who already
 * accepted is a no-op success; reuse by a different user is rejected.
 */
export async function acceptInvite(
  db: Db,
  userId: string,
  token: string,
  opts?: { now?: Date },
): Promise<AcceptInviteResult> {
  const now = opts?.now ?? new Date();
  const [invite] = await db.select().from(orgInvites).where(eq(orgInvites.token, token)).limit(1);
  if (!invite) throw new Error('Invite not found');

  if (invite.status !== 'pending') {
    const alreadyMember = await isMember(db, userId, invite.orgId);
    if (invite.status === 'accepted' && alreadyMember) {
      return { orgId: invite.orgId, role: invite.role };
    }
    throw new Error('This invite has already been used or revoked.');
  }
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) {
    throw new Error('This invite has expired — ask for a new one.');
  }

  await db
    .insert(orgMembers)
    .values({ orgId: invite.orgId, userId, role: invite.role ?? 'member' })
    .onConflictDoNothing({ target: [orgMembers.orgId, orgMembers.userId] });
  await db.update(orgInvites).set({ status: 'accepted' }).where(eq(orgInvites.id, invite.id));
  await createAuditLogger(db, invite.orgId).log({
    actorType: 'user',
    actorId: userId,
    action: 'member.invite_accepted',
    entityType: 'org_invite',
    entityId: invite.id,
    payload: { email: invite.email, role: invite.role },
  });
  return { orgId: invite.orgId, role: invite.role };
}
