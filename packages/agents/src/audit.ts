// Immutable audit logging (CONTRACTS §8). payloadHash = sha256 of canonical JSON.

import { createHash } from 'node:crypto';
import { auditLogs, type Db } from '@voxmarketer/db';

/** JSON.stringify with recursively sorted object keys — stable for hashing. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export interface AuditEntry {
  actorType: 'user' | 'agent' | 'system';
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string;
  payload?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

export function createAuditLogger(db: Db, orgId?: string): AuditLogger {
  return {
    async log(entry) {
      await db.insert(auditLogs).values({
        orgId: orgId ?? null,
        actorType: entry.actorType,
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        payloadHash: payloadHash(entry.payload ?? null),
        metadata: entry.metadata ?? {},
      });
    },
  };
}
