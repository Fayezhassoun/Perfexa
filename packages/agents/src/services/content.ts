// Content studio services: AI-drafted pieces with an approval workflow.

import { and, desc, eq } from 'drizzle-orm';
import { contentPieces, type ContentPiece } from '@sayso/db';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';
import { getOrCreateAgent } from '../execute-plan.js';

export async function listPieces(ctx: AgentContext, type?: string): Promise<ContentPiece[]> {
  const conditions = [eq(contentPieces.orgId, ctx.orgId)];
  if (type) conditions.push(eq(contentPieces.type, type));
  return ctx.db
    .select()
    .from(contentPieces)
    .where(and(...conditions))
    .orderBy(desc(contentPieces.createdAt))
    .limit(200);
}

export async function draftPiece(
  ctx: AgentContext,
  input: { type: 'blog' | 'ad_copy' | 'social_caption'; topic: string },
): Promise<ContentPiece> {
  await getOrCreateAgent(ctx, 'content');
  const { result } = await executeTool(ctx, 'content.draft', input);
  return result as ContentPiece;
}

export async function updatePiece(
  ctx: AgentContext,
  id: string,
  patch: { title?: string; body?: string; status?: 'draft' | 'approved' | 'rejected' },
): Promise<ContentPiece> {
  const [existing] = await ctx.db
    .select()
    .from(contentPieces)
    .where(and(eq(contentPieces.id, id), eq(contentPieces.orgId, ctx.orgId)))
    .limit(1);
  if (!existing) throw new Error('Content piece not found');
  const [updated] = await ctx.db
    .update(contentPieces)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    })
    .where(eq(contentPieces.id, id))
    .returning();
  if (patch.status) {
    await ctx.audit.log({
      actorType: 'user',
      actorId: ctx.userId ?? 'unknown',
      action: `content.${patch.status}`,
      entityType: 'content_piece',
      entityId: id,
      payload: { type: existing.type },
    });
  }
  return updated!;
}
