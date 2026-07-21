import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { KNOWLEDGE_SEED_DOCS, embedText } from '@voxmarketer/integrations';
import { getDb, closeDb, schema, type Db } from './index';
import { loadRootEnv } from './env';

export const DEMO_USER_EMAIL = 'demo@voxmarketer.dev';
export const DEMO_USER_PASSWORD = 'demo1234';

/**
 * Seed the knowledge base from the distilled best-practice docs
 * (@voxmarketer/integrations). Idempotent: docs are upserted by title and
 * each gets its deterministic embedding.
 */
export async function seedKnowledge(db: Db): Promise<number> {
  for (const doc of KNOWLEDGE_SEED_DOCS) {
    const embedding = embedText(`${doc.title} ${doc.content}`);
    const [existing] = await db
      .select({ id: schema.knowledgeDocuments.id })
      .from(schema.knowledgeDocuments)
      .where(eq(schema.knowledgeDocuments.title, doc.title))
      .limit(1);
    if (existing) {
      await db
        .update(schema.knowledgeDocuments)
        .set({ source: doc.source, content: doc.content, embedding })
        .where(eq(schema.knowledgeDocuments.id, existing.id));
    } else {
      await db.insert(schema.knowledgeDocuments).values({
        source: doc.source,
        title: doc.title,
        content: doc.content,
        embedding,
        metadata: {},
      });
    }
  }
  return KNOWLEDGE_SEED_DOCS.length;
}

/** Seed the demo org (CONTRACTS §3/§12). Idempotent: re-running is a no-op. */
export async function seedDemo(): Promise<void> {
  loadRootEnv();
  const db = getDb();

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, DEMO_USER_EMAIL))
    .limit(1);
  if (existing.length > 0) {
    const count = await seedKnowledge(db);
    console.log(`[db] demo user already present — org seed skipped, ${count} knowledge docs upserted`);
    return;
  }

  const passwordHash = bcrypt.hashSync(DEMO_USER_PASSWORD, 10);

  const [user] = await db
    .insert(schema.users)
    .values({ email: DEMO_USER_EMAIL, name: 'Demo User', passwordHash })
    .returning();
  if (!user) throw new Error('failed to insert demo user');

  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: 'Demo Business',
      websiteUrl: 'https://example.com',
      goals: ['visibility', 'leads'],
      monthlyBudgetCeilingCents: 50000, // $500
      onboardingStep: 'done',
      settings: {},
    })
    .returning();
  if (!org) throw new Error('failed to insert demo org');

  await db.insert(schema.orgMembers).values({
    orgId: org.id,
    userId: user.id,
    role: 'owner',
  });

  // CONTRACTS §4: seed budgets row — global monthly = org ceiling
  await db.insert(schema.budgets).values({
    orgId: org.id,
    scope: 'global',
    capCents: 50000,
    period: 'monthly',
  });

  const docCount = await seedKnowledge(db);

  console.log(
    `[db] seeded demo org "${org.name}" (${org.id}) with user ${DEMO_USER_EMAIL} ` +
      `and ${docCount} knowledge documents`,
  );
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  seedDemo()
    .then(async () => {
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[db] seed failed:', err);
      await closeDb();
      process.exit(1);
    });
}
