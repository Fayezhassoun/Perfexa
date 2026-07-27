// AgentContext factory (CONTRACTS §8) — shared by web routers and the worker.

import type { Db } from '@sayso/db';
import { getLLM, type LLMProvider } from '@sayso/llm';
import type { AgentContext } from './types.js';
import { createAuditLogger } from './audit.js';

export function createAgentContext(opts: {
  db: Db;
  orgId: string;
  userId?: string;
  conversationId?: string;
  now?: Date;
  /** Override the env-selected provider (tests, per-request control). */
  llm?: LLMProvider;
}): AgentContext {
  return {
    db: opts.db,
    orgId: opts.orgId,
    userId: opts.userId,
    conversationId: opts.conversationId,
    llm: opts.llm ?? getLLM(),
    audit: createAuditLogger(opts.db, opts.orgId),
    now: opts.now,
  };
}
