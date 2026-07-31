// Conversation services (CONTRACTS §5): list/get/create + the core sendMessage
// entry that runs the orchestrator. Voice "approve"/"cancel" flows through here
// as transcript text — the orchestrator handles the deterministic short-circuit.

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { conversations, messages, type Conversation, type Message } from '@growthcrew/db';
import type { AgentContext, OrchestratorResult, Plan, Question } from '../types.js';
import { handleUserMessage } from '../orchestrator.js';

export interface ConversationSummary extends Conversation {
  lastMessage: { content: string | null; createdAt: Date } | null;
}

export async function listConversations(ctx: AgentContext): Promise<ConversationSummary[]> {
  const rows = await ctx.db
    .select()
    .from(conversations)
    .where(eq(conversations.orgId, ctx.orgId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const recent = await ctx.db
    .select()
    .from(messages)
    .where(sql`${messages.conversationId} in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`)
    .orderBy(desc(messages.createdAt));
  const lastByConv = new Map<string, Message>();
  for (const m of recent) {
    if (!lastByConv.has(m.conversationId)) lastByConv.set(m.conversationId, m);
  }
  return rows.map((c) => {
    const last = lastByConv.get(c.id);
    return { ...c, lastMessage: last ? { content: last.content, createdAt: last.createdAt } : null };
  });
}

export async function getConversation(
  ctx: AgentContext,
  id: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const [conversation] = await ctx.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.orgId, ctx.orgId)))
    .limit(1);
  if (!conversation) throw new Error('Conversation not found');
  const msgs = await ctx.db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  return { conversation, messages: msgs };
}

export async function createConversation(ctx: AgentContext, title?: string): Promise<Conversation> {
  const [row] = await ctx.db
    .insert(conversations)
    .values({ orgId: ctx.orgId, userId: ctx.userId ?? null, title: title ?? null })
    .returning();
  return row!;
}

export interface SendMessageInput {
  conversationId?: string;
  content: string;
  modality: 'voice' | 'text';
  idempotencyKey?: string;
}

export interface SendMessageResult {
  conversationId: string;
  userMessage: Message;
  assistantMessage: Message;
  reply: string;
  proposal?: Plan;
  proposalId?: string;
  proposalApproved?: boolean;
  proposalRejected?: boolean;
  needsClarification?: Question[];
}

export async function sendChatMessage(ctx: AgentContext, input: SendMessageInput): Promise<SendMessageResult> {
  const content = input.content.trim();
  if (!content) throw new Error('Message is empty');

  // Idempotency: a replayed key returns the original result (CONTRACTS §5).
  if (input.idempotencyKey) {
    const [existing] = await ctx.db
      .select({ metadata: messages.metadata })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.orgId, ctx.orgId),
          sql`${messages.metadata}->>'idempotencyKey' = ${input.idempotencyKey}`,
        ),
      )
      .limit(1);
    const replay = (existing?.metadata as Record<string, unknown> | undefined)?.replay as SendMessageResult | undefined;
    if (replay) return replay;
  }

  let conversationId = input.conversationId;
  if (!conversationId) {
    const conv = await createConversation(ctx, content.slice(0, 60));
    conversationId = conv.id;
  } else {
    const [owned] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.orgId, ctx.orgId)))
      .limit(1);
    if (!owned) throw new Error('Conversation not found');
  }

  const [userMessage] = await ctx.db
    .insert(messages)
    .values({
      conversationId,
      role: 'user',
      content,
      inputModality: input.modality,
      metadata: input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {},
    })
    .returning();

  const result: OrchestratorResult = await handleUserMessage({ ...ctx, conversationId }, content, input.modality);

  const [assistantMessage] = await ctx.db
    .insert(messages)
    .values({
      conversationId,
      role: 'assistant',
      content: result.assistantMessage,
      inputModality: input.modality,
      metadata: result.proposalId ? { proposalId: result.proposalId } : {},
    })
    .returning();
  await ctx.db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));

  const response: SendMessageResult = {
    conversationId,
    userMessage: userMessage!,
    assistantMessage: assistantMessage!,
    reply: result.assistantMessage,
    proposal: result.proposal,
    proposalId: result.proposalId,
    proposalApproved: result.proposalApproved,
    proposalRejected: result.proposalRejected,
    needsClarification: result.needsClarification,
  };

  if (input.idempotencyKey) {
    await ctx.db
      .update(messages)
      .set({ metadata: { idempotencyKey: input.idempotencyKey, replay: JSON.parse(JSON.stringify(response)) } })
      .where(eq(messages.id, userMessage!.id));
  }
  return response;
}
