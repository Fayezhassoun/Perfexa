// Knowledge base services (CONTRACTS §5): list + cosine search over the
// distilled best-practice docs. knowledge_documents is GLOBAL (no orgId).

import { desc, eq, isNull } from 'drizzle-orm';
import { knowledgeDocuments, type KnowledgeDocument } from '@growthcrew/db';
import { cosineSimilarity, embedText } from '@growthcrew/integrations';
import type { AgentContext } from '../types.js';

export async function listKnowledge(ctx: AgentContext, source?: string): Promise<KnowledgeDocument[]> {
  const query = source
    ? ctx.db.select().from(knowledgeDocuments).where(eq(knowledgeDocuments.source, source))
    : ctx.db.select().from(knowledgeDocuments);
  return query.orderBy(desc(knowledgeDocuments.createdAt)).limit(200);
}

export interface KnowledgeHit {
  id: string;
  source: string | null;
  title: string | null;
  content: string | null;
  score: number;
}

export async function searchKnowledge(ctx: AgentContext, q: string): Promise<KnowledgeHit[]> {
  const queryEmbedding = embedText(q);
  const docs = await ctx.db.select().from(knowledgeDocuments).limit(500);

  const hits: KnowledgeHit[] = [];
  for (const doc of docs) {
    let embedding = doc.embedding;
    if (!embedding) {
      // Lazily embed + persist so subsequent searches are cheap.
      embedding = embedText(`${doc.title ?? ''} ${doc.content ?? ''}`);
      await ctx.db.update(knowledgeDocuments).set({ embedding }).where(eq(knowledgeDocuments.id, doc.id));
    }
    hits.push({
      id: doc.id,
      source: doc.source,
      title: doc.title,
      content: doc.content,
      score: cosineSimilarity(queryEmbedding, embedding),
    });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 5);
}

/** Count of docs still missing embeddings (admin health). */
export async function unembeddedCount(ctx: AgentContext): Promise<number> {
  const rows = await ctx.db.select({ id: knowledgeDocuments.id }).from(knowledgeDocuments).where(isNull(knowledgeDocuments.embedding));
  return rows.length;
}
