// Settings services (CONTRACTS §5): integrations (sandbox/live gating),
// budget caps (>20% → approval), members, notifications.

import { and, eq } from 'drizzle-orm';
import { approvals, budgets, connectedAccounts, orgInvites, orgMembers, organizations, users, type Budget, type ConnectedAccount } from '@sayso/db';
import { sendEmail, type FetchLike } from '@sayso/integrations';
import type { AgentContext } from '../types.js';
import { isOAuthConfigured } from '../live.js';

const PLATFORMS = ['google_ads', 'meta', 'tiktok', 'ga4', 'gsc'] as const;
export type IntegrationPlatform = (typeof PLATFORMS)[number];

export interface IntegrationStatus {
  platform: IntegrationPlatform;
  connected: boolean;
  mode: 'sandbox' | 'live';
  status: string;
  externalAccountId: string | null;
  health: string;
  /** True when the platform's OAuth app credentials exist in env (Phase 2). */
  oauthConfigured: boolean;
  /** Relative URL that starts the real OAuth flow (null when not configured). */
  connectUrl: string | null;
}

export async function listIntegrations(ctx: AgentContext): Promise<IntegrationStatus[]> {
  const rows = await ctx.db.select().from(connectedAccounts).where(eq(connectedAccounts.orgId, ctx.orgId));
  return PLATFORMS.map((platform) => {
    const row = rows.find((r) => r.platform === platform);
    const mode = row?.mode === 'live' ? 'live' : 'sandbox';
    const oauthConfigured = isOAuthConfigured(platform);
    return {
      platform,
      connected: Boolean(row?.externalAccountId),
      mode,
      status: row?.status ?? 'not_connected',
      externalAccountId: row?.externalAccountId ?? null,
      health:
        mode === 'live'
          ? row?.status === 'connected'
            ? 'live — real API calls'
            : 'live — connection problem'
          : 'sandbox — simulated responses, no real spend',
      oauthConfigured,
      connectUrl: oauthConfigured ? `/api/integrations/${platform}/connect` : null,
    };
  });
}

/**
 * Flip an integration sandbox↔live (CONTRACTS §5/§16): going LIVE requires an
 * OAuth-connected account (externalAccountId) AND the literal confirm text
 * "LIVE". Both outcomes are audit-logged.
 */
export async function setIntegrationMode(
  ctx: AgentContext,
  platform: IntegrationPlatform,
  mode: 'sandbox' | 'live',
  confirmText?: string,
): Promise<IntegrationStatus> {
  const [row] = await ctx.db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, ctx.orgId), eq(connectedAccounts.platform, platform)))
    .limit(1);

  if (mode === 'live') {
    const reason = !row?.externalAccountId
      ? `Connect your ${platform} account first (OAuth) before going live.`
      : confirmText !== 'LIVE'
        ? 'Type LIVE to confirm switching to real spend.'
        : null;
    if (reason) {
      await ctx.audit.log({
        actorType: 'user',
        actorId: ctx.userId ?? 'unknown',
        action: 'integration.live_rejected',
        entityType: 'connected_account',
        entityId: row?.id,
        payload: { platform, reason },
      });
      throw new Error(reason);
    }
  }

  if (row) {
    await ctx.db
      .update(connectedAccounts)
      .set({ mode, updatedAt: ctx.now ?? new Date() })
      .where(eq(connectedAccounts.id, row.id));
  } else {
    await ctx.db.insert(connectedAccounts).values({ orgId: ctx.orgId, platform, mode, status: 'connected' });
  }
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'integration.mode_changed',
    entityType: 'connected_account',
    entityId: row?.id ?? platform,
    payload: { platform, mode },
  });
  const all = await listIntegrations(ctx);
  return all.find((i) => i.platform === platform)!;
}

/** Dev/Phase-1 helper: simulate completing OAuth so live switching can be exercised. */
export async function connectSandboxAccount(ctx: AgentContext, platform: IntegrationPlatform): Promise<ConnectedAccount> {
  const [existing] = await ctx.db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.orgId, ctx.orgId), eq(connectedAccounts.platform, platform)))
    .limit(1);
  if (existing) {
    const [updated] = await ctx.db
      .update(connectedAccounts)
      .set({ externalAccountId: existing.externalAccountId ?? `sandbox-${platform}-acct`, status: 'connected' })
      .where(eq(connectedAccounts.id, existing.id))
      .returning();
    return updated!;
  }
  const [created] = await ctx.db
    .insert(connectedAccounts)
    .values({ orgId: ctx.orgId, platform, externalAccountId: `sandbox-${platform}-acct`, status: 'connected', mode: 'sandbox' })
    .returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'integration.connected',
    entityType: 'connected_account',
    entityId: created!.id,
    payload: { platform, simulated: true },
  });
  return created!;
}

export async function listBudgetCaps(ctx: AgentContext): Promise<Budget[]> {
  return ctx.db.select().from(budgets).where(eq(budgets.orgId, ctx.orgId));
}

export interface BudgetUpdateResult {
  applied: boolean;
  approvalId?: string;
  cap?: Budget;
  message: string;
}

/**
 * Update a budget cap. A change of more than 20% vs the current cap does NOT
 * apply — it creates a pending approvals row (CONTRACTS §5/§6).
 */
export async function updateBudgetCap(
  ctx: AgentContext,
  input: { scope: string; capCents: number; period: 'daily' | 'monthly' },
): Promise<BudgetUpdateResult> {
  const [existing] = await ctx.db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, ctx.orgId), eq(budgets.scope, input.scope), eq(budgets.period, input.period)))
    .limit(1);

  if (existing?.capCents && existing.capCents > 0) {
    const changeRatio = Math.abs(input.capCents - existing.capCents) / existing.capCents;
    if (changeRatio > 0.2) {
      const [approval] = await ctx.db
        .insert(approvals)
        .values({
          orgId: ctx.orgId,
          action: {
            type: 'budget_cap',
            scope: input.scope,
            capCents: input.capCents,
            period: input.period,
            summary: `Change ${input.scope} ${input.period} cap from $${(existing.capCents / 100).toFixed(0)} to $${(input.capCents / 100).toFixed(0)}`,
          },
          status: 'pending',
        })
        .returning();
      await ctx.audit.log({
        actorType: 'user',
        actorId: ctx.userId ?? 'unknown',
        action: 'budget.approval_required',
        entityType: 'budget',
        entityId: existing.id,
        payload: { scope: input.scope, period: input.period, fromCents: existing.capCents, toCents: input.capCents },
      });
      return {
        applied: false,
        approvalId: approval!.id,
        message: `That's a change of more than 20% — it needs your explicit approval before it applies.`,
      };
    }
  }

  let cap: Budget;
  if (existing) {
    const [updated] = await ctx.db.update(budgets).set({ capCents: input.capCents }).where(eq(budgets.id, existing.id)).returning();
    cap = updated!;
  } else {
    const [created] = await ctx.db
      .insert(budgets)
      .values({ orgId: ctx.orgId, scope: input.scope, capCents: input.capCents, period: input.period })
      .returning();
    cap = created!;
  }
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'budget.updated',
    entityType: 'budget',
    entityId: cap.id,
    payload: { scope: input.scope, period: input.period, capCents: input.capCents },
  });
  return { applied: true, cap, message: 'Budget cap updated.' };
}

export interface MemberRow {
  id: string;
  role: string | null;
  userId: string;
  email: string | null;
  name: string | null;
  createdAt: Date;
}

export async function listMembers(ctx: AgentContext): Promise<MemberRow[]> {
  const rows = await ctx.db
    .select({
      id: orgMembers.id,
      role: orgMembers.role,
      userId: orgMembers.userId,
      email: users.email,
      name: users.name,
      createdAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .leftJoin(users, eq(orgMembers.userId, users.id))
    .where(eq(orgMembers.orgId, ctx.orgId));
  return rows.map((r) => ({ ...r, userId: r.userId! }));
}

/** The caller's role in the active org (null when somehow not a member). */
async function callerRole(ctx: AgentContext): Promise<string | null> {
  if (!ctx.userId) return null;
  const [row] = await ctx.db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.orgId, ctx.orgId), eq(orgMembers.userId, ctx.userId)))
    .limit(1);
  return row?.role ?? null;
}

function requireOwnerOrAdmin(role: string | null): void {
  if (role !== 'owner' && role !== 'admin') {
    throw new Error('Only owners and admins can manage team members.');
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InviteMemberResult {
  invited: boolean;
  message: string;
  /** Copy-pasteable accept link (dev has no email key by default). */
  acceptUrl: string;
}

/**
 * Invite a teammate (CONTRACTS §5): creates a pending org_invites row with a
 * 7-day expiry and emails the accept link via Resend when RESEND_API_KEY is
 * set (log-only otherwise — §3). Caller must be owner/admin of the org.
 */
export async function inviteMember(
  ctx: AgentContext,
  email: string,
  role: 'admin' | 'member' = 'member',
  opts?: { env?: NodeJS.ProcessEnv; fetchImpl?: FetchLike },
): Promise<InviteMemberResult> {
  requireOwnerOrAdmin(await callerRole(ctx));
  const env = opts?.env ?? process.env;
  const now = ctx.now ?? new Date();
  const normalized = email.toLowerCase().trim();

  // Already a member of this org? Then there's nothing to invite.
  const [existingUser] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
  if (existingUser) {
    const [existingMember] = await ctx.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, ctx.orgId), eq(orgMembers.userId, existingUser.id)))
      .limit(1);
    if (existingMember) throw new Error('That person is already a member of this organization.');
  }

  const token = crypto.randomUUID();
  const [invite] = await ctx.db
    .insert(orgInvites)
    .values({ orgId: ctx.orgId, email: normalized, role, token, status: 'pending', expiresAt: new Date(now.getTime() + INVITE_TTL_MS) })
    .returning();
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const acceptUrl = `${appUrl}/invite/${token}`;

  const apiKey = env.RESEND_API_KEY ?? '';
  let emailed = false;
  if (apiKey) {
    try {
      await sendEmail({
        apiKey,
        from: env.EMAIL_FROM ?? 'Sayso <reports@sayso.dev>',
        to: normalized,
        subject: 'You have been invited to Sayso',
        html: `<p>You have been invited to join a team on Sayso.</p><p><a href="${acceptUrl}">Accept the invite</a> (expires in 7 days).</p>`,
        fetchImpl: opts?.fetchImpl,
      });
      emailed = true;
    } catch (err) {
      // The invite row is the source of truth — a mail failure must not lose it.
      console.warn('[settings] invite email failed:', err instanceof Error ? err.message : err);
    }
  } else {
    console.log(`[settings] RESEND_API_KEY not set — invite link for ${normalized}: ${acceptUrl}`);
  }

  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'member.invited',
    entityType: 'org_invite',
    entityId: invite!.id,
    payload: { email: normalized, role, emailed },
  });
  return {
    invited: true,
    message: emailed ? `Invite emailed to ${normalized}.` : `Invite created — share this link: ${acceptUrl}`,
    acceptUrl,
  };
}

export async function removeMember(ctx: AgentContext, memberId: string): Promise<{ ok: true }> {
  requireOwnerOrAdmin(await callerRole(ctx));
  const [member] = await ctx.db
    .select()
    .from(orgMembers)
    .where(and(eq(orgMembers.id, memberId), eq(orgMembers.orgId, ctx.orgId)))
    .limit(1);
  if (!member) throw new Error('Member not found');
  if (member.userId === ctx.userId) throw new Error('You cannot remove yourself');
  if (member.role === 'owner') {
    const owners = await ctx.db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.orgId, ctx.orgId), eq(orgMembers.role, 'owner')));
    if (owners.length <= 1) throw new Error('You cannot remove the last owner of an organization.');
  }
  await ctx.db.delete(orgMembers).where(eq(orgMembers.id, memberId));
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'member.removed',
    entityType: 'org_member',
    entityId: memberId,
    payload: {},
  });
  return { ok: true };
}

export async function updateNotifications(ctx: AgentContext, prefs: Record<string, unknown>): Promise<Record<string, unknown>> {
  const [org] = await ctx.db.select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
  const settings = (org?.settings as Record<string, unknown> | undefined) ?? {};
  const notifications = { ...((settings.notifications as Record<string, unknown> | undefined) ?? {}), ...prefs };
  await ctx.db.update(organizations).set({ settings: { ...settings, notifications } }).where(eq(organizations.id, ctx.orgId));
  return notifications;
}
