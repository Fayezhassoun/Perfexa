import { and, desc, eq, sql, type InferSelectModel } from 'drizzle-orm';
import { orgMemoryDocuments } from '@growthcrew/db';
import { cosineSimilarity, embedText } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';

export type OrgMemoryDocument = InferSelectModel<typeof orgMemoryDocuments>;

export interface MemoryHit {
  id: string;
  title: string | null;
  content: string | null;
  kind: string | null;
  tags: string[] | null;
  score: number;
  createdAt?: Date | string | null;
}


export async function listMemory(
  ctx: AgentContext,
  opts?: { kind?: string; tag?: string },
): Promise<OrgMemoryDocument[]> {
  const conditions = [eq(orgMemoryDocuments.orgId, ctx.orgId)];
  if (opts?.kind) {
    conditions.push(eq(orgMemoryDocuments.kind, opts.kind));
  }
  if (opts?.tag) {
    conditions.push(sql`${orgMemoryDocuments.tags} @> ${JSON.stringify([opts.tag])}::jsonb`);
  }
  return ctx.db
    .select()
    .from(orgMemoryDocuments)
    .where(and(...conditions))
    .orderBy(desc(orgMemoryDocuments.createdAt))
    .limit(200);
}

export async function addMemory(
  ctx: AgentContext,
  input: {
    title?: string;
    content: string;
    kind?: string;
    tags?: string[];
    sourceMeta?: Record<string, unknown>;
  },
): Promise<OrgMemoryDocument> {
  const textToEmbed = `${input.title ?? ''} ${input.content}`;
  const embedding = embedText(textToEmbed);

  const [doc] = await ctx.db
    .insert(orgMemoryDocuments)
    .values({
      orgId: ctx.orgId,
      title: input.title ?? null,
      content: input.content,
      kind: input.kind ?? 'note',
      tags: input.tags ?? [],
      sourceMeta: input.sourceMeta ?? null,
      embedding,
    })
    .returning();

  return doc!;
}

export async function importText(
  ctx: AgentContext,
  input: { title?: string; text: string; tags?: string[] },
): Promise<OrgMemoryDocument> {
  return addMemory(ctx, {
    title: input.title,
    content: input.text,
    kind: 'note',
    tags: input.tags,
  });
}

export async function importUrl(
  ctx: AgentContext,
  input: { url: string; tags?: string[] },
): Promise<OrgMemoryDocument> {
  let response: Response;
  try {
    response = await fetch(input.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GrowthCrewBot/1.0)',
      },
    });
  } catch (err) {
    throw new Error(`Failed to fetch URL ${input.url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch URL ${input.url}: HTTP ${response.status} ${response.statusText}`);
  }

  const rawHtml = await response.text();
  const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const extractedTitle = titleMatch ? titleMatch[1]?.trim().replace(/\s+/g, ' ') : undefined;

  let cleanedText = rawHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanedText.length > 20000) {
    cleanedText = cleanedText.slice(0, 20000);
  }

  return addMemory(ctx, {
    title: extractedTitle || input.url,
    content: cleanedText,
    kind: 'url',
    tags: input.tags,
    sourceMeta: { url: input.url },
  });
}

export async function importFile(
  ctx: AgentContext,
  input: { filename: string; mimeType: string; text: string; tags?: string[] },
): Promise<OrgMemoryDocument> {
  return addMemory(ctx, {
    title: input.filename,
    content: input.text,
    kind: 'file',
    tags: input.tags,
    sourceMeta: {
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.text.length,
    },
  });
}

export async function searchMemory(ctx: AgentContext, q: string): Promise<MemoryHit[]> {
  const queryEmbedding = embedText(q);
  const docs = await ctx.db
    .select()
    .from(orgMemoryDocuments)
    .where(eq(orgMemoryDocuments.orgId, ctx.orgId))
    .limit(500);

  const hits: MemoryHit[] = [];
  for (const doc of docs) {
    let embedding = doc.embedding;
    if (!embedding) {
      embedding = embedText(`${doc.title ?? ''} ${doc.content ?? ''}`);
      await ctx.db
        .update(orgMemoryDocuments)
        .set({ embedding })
        .where(and(eq(orgMemoryDocuments.id, doc.id), eq(orgMemoryDocuments.orgId, ctx.orgId)));
    }
    hits.push({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      kind: doc.kind,
      tags: doc.tags,
      score: cosineSimilarity(queryEmbedding, embedding),
      createdAt: doc.createdAt,
    });

  }

  return hits.sort((a, b) => b.score - a.score).slice(0, 5);
}

export async function deleteMemory(ctx: AgentContext, id: string): Promise<{ deleted: boolean }> {
  const deletedRows = await ctx.db
    .delete(orgMemoryDocuments)
    .where(and(eq(orgMemoryDocuments.id, id), eq(orgMemoryDocuments.orgId, ctx.orgId)))
    .returning({ id: orgMemoryDocuments.id });

  return { deleted: deletedRows.length > 0 };
}
