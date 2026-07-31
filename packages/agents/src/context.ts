// AgentContext factory (CONTRACTS §8) — shared by web routers and the worker.

import { eq } from 'drizzle-orm';
import { organizations, type Db } from '@sayso/db';
import { getLLM, getLLMForConfig, type LLMConfig, type LLMProvider } from '@sayso/llm';
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

function readLLMConfig(settings: unknown): LLMConfig {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  const llm = (settings as Record<string, unknown>).llm;
  if (!llm || typeof llm !== 'object' || Array.isArray(llm)) return {};
  const rec = llm as Record<string, unknown>;
  return {
    provider: typeof rec.provider === 'string' ? rec.provider : undefined,
    model: typeof rec.model === 'string' ? rec.model : undefined,
  };
}

export async function createAgentContextWithOrgLLM(opts: {
  db: Db;
  orgId: string;
  userId?: string;
  conversationId?: string;
  now?: Date;
  llm?: LLMProvider;
}): Promise<AgentContext> {
  if (opts.llm) {
    return createAgentContext(opts);
  }

  const [org] = await opts.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, opts.orgId))
    .limit(1);

  const llmConfig = readLLMConfig(org?.settings);
  const llm = getLLMForConfig(llmConfig);

  return createAgentContext({ ...opts, llm });
}
