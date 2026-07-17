// Per-org long-term memory: organizations.settings.memory (CONTRACTS §8).

import { eq } from 'drizzle-orm';
import { organizations } from '@voxmarketer/db';
import type { AgentContext } from './types.js';

type MemoryStore = Record<string, unknown>;

async function readSettings(ctx: AgentContext): Promise<Record<string, unknown>> {
  const [org] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  return (org?.settings as Record<string, unknown> | undefined) ?? {};
}

export async function remember(ctx: AgentContext, key: string, value: unknown): Promise<void> {
  const settings = await readSettings(ctx);
  const memory: MemoryStore = { ...((settings.memory as MemoryStore | undefined) ?? {}), [key]: value };
  await ctx.db
    .update(organizations)
    .set({ settings: { ...settings, memory } })
    .where(eq(organizations.id, ctx.orgId));
}

export async function recall(ctx: AgentContext, key: string): Promise<unknown> {
  const settings = await readSettings(ctx);
  const memory = (settings.memory as MemoryStore | undefined) ?? {};
  return memory[key];
}

export async function recallAll(ctx: AgentContext): Promise<MemoryStore> {
  const settings = await readSettings(ctx);
  return (settings.memory as MemoryStore | undefined) ?? {};
}

export async function recallString(ctx: AgentContext, key: string): Promise<string | undefined> {
  const value = await recall(ctx, key);
  return typeof value === 'string' ? value : undefined;
}
