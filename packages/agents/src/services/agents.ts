// Agent directory services (CONTRACTS §5): list/detail/status. Agents are
// created by the orchestrator only — never by users directly.

import { and, desc, eq, sql } from 'drizzle-orm';
import { agentRuns, agents, type Agent, type AgentRun } from '@voxmarketer/db';
import type { AgentContext, AgentType } from '../types.js';
import { getToolsForAgent } from '../tools.js';
import { recallAll } from '../memory.js';

export interface AgentSummary extends Agent {
  latestRun: Pick<AgentRun, 'id' | 'status' | 'createdAt' | 'output'> | null;
}

export async function listAgents(ctx: AgentContext): Promise<AgentSummary[]> {
  const rows = await ctx.db.select().from(agents).where(eq(agents.orgId, ctx.orgId)).orderBy(agents.createdAt);
  if (rows.length === 0) return [];
  const runs = await ctx.db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.orgId, ctx.orgId))
    .orderBy(desc(agentRuns.createdAt));
  const latestByAgent = new Map<string, AgentRun>();
  for (const run of runs) {
    if (run.agentId && !latestByAgent.has(run.agentId)) latestByAgent.set(run.agentId, run);
  }
  return rows.map((a) => {
    const latest = latestByAgent.get(a.id);
    return {
      ...a,
      latestRun: latest ? { id: latest.id, status: latest.status, createdAt: latest.createdAt, output: latest.output } : null,
    };
  });
}

export interface AgentDetail {
  agent: Agent;
  tools: { name: string; description: string; gated: boolean }[];
  memory: Record<string, unknown>;
  runs: AgentRun[];
}

export async function getAgent(ctx: AgentContext, id: string): Promise<AgentDetail> {
  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, ctx.orgId)))
    .limit(1);
  if (!agent) throw new Error('Agent not found');
  const runs = await ctx.db
    .select()
    .from(agentRuns)
    .where(sql`${agentRuns.agentId} = ${id}`)
    .orderBy(desc(agentRuns.createdAt))
    .limit(20);
  return {
    agent,
    tools: getToolsForAgent(agent.type as AgentType).map((t) => ({ name: t.name, description: t.description, gated: t.gated })),
    memory: await recallAll(ctx),
    runs,
  };
}

export async function setAgentStatus(ctx: AgentContext, id: string, status: 'active' | 'paused' | 'archived'): Promise<Agent> {
  const [agent] = await ctx.db
    .select()
    .from(agents)
    .where(and(eq(agents.id, id), eq(agents.orgId, ctx.orgId)))
    .limit(1);
  if (!agent) throw new Error('Agent not found');
  const [updated] = await ctx.db.update(agents).set({ status }).where(eq(agents.id, id)).returning();
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'agent.status_changed',
    entityType: 'agent',
    entityId: id,
    payload: { from: agent.status, to: status },
  });
  return updated!;
}
