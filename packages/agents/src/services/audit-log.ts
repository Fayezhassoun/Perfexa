// Audit log read service (CONTRACTS §5): cursor-paginated, newest first.
// The log is immutable — this module is read-only by construction.

import { and, desc, eq, lt } from 'drizzle-orm';
import { auditLogs, type AuditLog } from '@growthcrew/db';
import type { AgentContext } from '../types.js';

export interface AuditPage {
  items: AuditLog[];
  nextCursor: string | null;
}

export async function listAuditLogs(ctx: AgentContext, opts?: { limit?: number; cursor?: string }): Promise<AuditPage> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const conditions = [eq(auditLogs.orgId, ctx.orgId)];
  if (opts?.cursor) conditions.push(lt(auditLogs.createdAt, new Date(opts.cursor)));
  const rows = await ctx.db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? last.createdAt.toISOString() : null };
}
