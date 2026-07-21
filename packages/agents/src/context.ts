// AgentContext factory (CONTRACTS §8) — shared by web routers and the worker.

import type { Db } from '@voxmarketer/db';
import { getLLM } from '@voxmarketer/llm';
import type { AgentContext } from './types.js';
import { createAuditLogger } from './audit.js';

export function createAgentContext(opts: {
  db: Db;
  orgId: string;
  userId?: string;
  conversationId?: string;
  now?: Date;
}): AgentContext {
  return {
    db: opts.db,
    orgId: opts.orgId,
    userId: opts.userId,
    conversationId: opts.conversationId,
    llm: getLLM(),
    audit: createAuditLogger(opts.db, opts.orgId),
    now: opts.now,
  };
}
