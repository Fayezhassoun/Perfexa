// Admin services (CONTRACTS §5): org user list + system health.

import net from 'node:net';
import { eq } from 'drizzle-orm';
import { connectedAccounts, orgMembers, organizations, users } from '@growthcrew/db';
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
