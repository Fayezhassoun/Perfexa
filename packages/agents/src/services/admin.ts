// Admin services (CONTRACTS §5): org user list + system health.

import net from 'node:net';
import { eq } from 'drizzle-orm';
import {
  auditLogs,
  connectedAccounts,
  orgMembers,
  organizations,
  users,
  weeklyReports,
} from '@growthcrew/db';
import type { AgentContext } from '../types.js';

export interface AdminUserRow {
  userId: string;
  email: string | null;
  name: string | null;
  role: string | null;
  orgId: string;
  orgName: string | null;
  createdAt: Date;
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

/** Platform admins see every org's members; others see their own org only. */
export async function listUsers(ctx: AgentContext, email?: string | null): Promise<AdminUserRow[]> {
  const base = ctx.db
    .select({
      userId: orgMembers.userId,
      email: users.email,
      name: users.name,
      role: orgMembers.role,
      orgId: orgMembers.orgId,
      orgName: organizations.name,
      createdAt: orgMembers.createdAt,
    })
    .from(orgMembers)
    .leftJoin(users, eq(orgMembers.userId, users.id))
    .leftJoin(organizations, eq(orgMembers.orgId, organizations.id));
  const rows = isPlatformAdmin(email) ? await base : await base.where(eq(orgMembers.orgId, ctx.orgId));
  return rows.map((r) => ({ ...r, userId: r.userId! }));
}

export type OrgPlan = 'starter' | 'growth' | 'agency';
export type OrgOverviewStatus = 'healthy' | 'attention' | 'critical';

export interface OrgOverview {
  orgId: string;
  name: string;
  plan: OrgPlan;
  memberCount: number;
  liveConnections: number;
  lastReportAt: Date | null;
  lastActiveAt: Date | null;
  status: OrgOverviewStatus;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function getPlan(settings: Record<string, unknown> | null | undefined): OrgPlan {
  const plan = settings?.plan;
  return plan === 'growth' || plan === 'agency' ? plan : 'starter';
}

function ageInDays(at: Date | null, now: Date): number {
  if (!at) return Number.POSITIVE_INFINITY;
  return Math.max(0, now.getTime() - at.getTime()) / DAY_MS;
}

function getOverviewStatus(
  liveConnections: number,
  lastReportAt: Date | null,
  lastActiveAt: Date | null,
  now: Date,
): OrgOverviewStatus {
  const activeAge = ageInDays(lastActiveAt, now);
  const reportAge = ageInDays(lastReportAt, now);

  if (activeAge > 30 || reportAge > 21) return 'critical';
  if (liveConnections === 0 || activeAge > 7 || reportAge > 10) return 'attention';
  return 'healthy';
}

/** Read-only overview of every organization available to the platform admin. */
export async function listOrgsOverview(
  ctx: AgentContext,
  email?: string | null,
): Promise<OrgOverview[]> {
  const orgRows = isPlatformAdmin(email)
    ? await ctx.db
        .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
        .from(organizations)
    : await ctx.db
        .select({ id: organizations.id, name: organizations.name, settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId));

  if (orgRows.length === 0) return [];

  const [memberRows, connectionRows, reportRows, activityRows] = await Promise.all([
    ctx.db.select({ orgId: orgMembers.orgId }).from(orgMembers),
    ctx.db
      .select({ orgId: connectedAccounts.orgId, mode: connectedAccounts.mode, status: connectedAccounts.status })
      .from(connectedAccounts),
    ctx.db
      .select({ orgId: weeklyReports.orgId, createdAt: weeklyReports.createdAt })
      .from(weeklyReports),
    ctx.db
      .select({ orgId: auditLogs.orgId, createdAt: auditLogs.createdAt })
      .from(auditLogs),
  ]);

  const memberCounts = new Map<string, number>();
  for (const row of memberRows) {
    memberCounts.set(row.orgId, (memberCounts.get(row.orgId) ?? 0) + 1);
  }

  const liveConnectionCounts = new Map<string, number>();
  for (const row of connectionRows) {
    if (row.mode !== 'live' || row.status !== 'connected') continue;
    liveConnectionCounts.set(row.orgId, (liveConnectionCounts.get(row.orgId) ?? 0) + 1);
  }

  const lastReportByOrg = new Map<string, Date>();
  const lastActiveByOrg = new Map<string, Date>();
  for (const row of reportRows) {
    const lastReport = lastReportByOrg.get(row.orgId);
    if (!lastReport || row.createdAt.getTime() > lastReport.getTime()) lastReportByOrg.set(row.orgId, row.createdAt);

    const lastActive = lastActiveByOrg.get(row.orgId);
    if (!lastActive || row.createdAt.getTime() > lastActive.getTime()) lastActiveByOrg.set(row.orgId, row.createdAt);
  }
  for (const row of activityRows) {
    if (!row.orgId) continue;
    const lastActive = lastActiveByOrg.get(row.orgId);
    if (!lastActive || row.createdAt.getTime() > lastActive.getTime()) lastActiveByOrg.set(row.orgId, row.createdAt);
  }

  const now = ctx.now ?? new Date();
  return orgRows.map((org) => {
    const lastReportAt = lastReportByOrg.get(org.id) ?? null;
    const lastActiveAt = lastActiveByOrg.get(org.id) ?? null;
    const liveConnections = liveConnectionCounts.get(org.id) ?? 0;

    return {
      orgId: org.id,
      name: org.name,
      plan: getPlan(org.settings),
      memberCount: memberCounts.get(org.id) ?? 0,
      liveConnections,
      lastReportAt,
      lastActiveAt,
      status: getOverviewStatus(liveConnections, lastReportAt, lastActiveAt, now),
    };
  });
}

async function pingRedis(): Promise<'ok' | 'error'> {
  const url = process.env.REDIS_URL;
  if (!url) return 'error';
  try {
    const { hostname, port } = new URL(url);
    return await new Promise<'ok' | 'error'>((resolve) => {
      const socket = net.connect({ host: hostname, port: Number(port) || 6379, timeout: 800 });
      socket.once('connect', () => {
        socket.destroy();
        resolve('ok');
      });
      socket.once('error', () => resolve('error'));
      socket.once('timeout', () => {
        socket.destroy();
        resolve('error');
      });
    });
  } catch {
    return 'error';
  }
}

export interface SystemHealth {
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
  llm: string;
  stt: string;
  tts: string;
  adapters: { platform: string; mode: string; status: string }[];
}

export async function systemHealth(ctx: AgentContext): Promise<SystemHealth> {
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    await ctx.db.select({ id: organizations.id }).from(organizations).limit(1);
  } catch {
    dbStatus = 'error';
  }
  const accounts = await ctx.db
    .select({ platform: connectedAccounts.platform, mode: connectedAccounts.mode, status: connectedAccounts.status })
    .from(connectedAccounts)
    .where(eq(connectedAccounts.orgId, ctx.orgId));
  return {
    db: dbStatus,
    redis: await pingRedis(),
    llm: process.env.LLM_PROVIDER ?? 'mock',
    stt: process.env.STT_PROVIDER ?? 'mock',
    tts: process.env.TTS_PROVIDER ?? 'mock',
    adapters: accounts.map((a) => ({ platform: a.platform ?? 'unknown', mode: a.mode ?? 'sandbox', status: a.status ?? 'unknown' })),
  };
}
