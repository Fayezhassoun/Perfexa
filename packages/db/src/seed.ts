import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb, closeDb, schema } from './index';
import { loadRootEnv } from './env';

export const DEMO_USER_EMAIL = 'demo@voxmarketer.dev';
export const DEMO_USER_PASSWORD = 'demo1234';

// TODO(wave-2): replace with KNOWLEDGE_SEED_DOCS from @voxmarketer/integrations
// (~12 distilled docs). Wave 1 keeps a local minimal set so this package has
// no dependency on packages/integrations yet.
const MINIMAL_KNOWLEDGE_DOCS: { source: string; title: string; content: string }[] = [
  {
    source: 'seo_guide',
    title: 'On-page SEO basics',
    content:
      'Every page needs a unique title tag and meta description, one clear H1, and ' +
      'descriptive headings. Missing meta descriptions lower click-through from search ' +
      'results. Keep pages fast on mobile: compress images and minimize render-blocking scripts.',
  },
  {
    source: 'google_ads_help',
    title: 'Google Search campaign structure',
    content:
      'A Search campaign targets keywords users type into Google. Start with a small set of ' +
      'high-intent keywords, one tightly themed ad group, and a daily budget you are ' +
      'comfortable testing. Track conversions before scaling spend.',
  },
  {
    source: 'policy',
    title: 'Ad policy essentials',
    content:
      'Ads must not make misleading claims, must match the landing page content, and must ' +
      'not target prohibited categories. Policy violations lead to disapproval; repeated ' +
      'violations can suspend the account.',
  },
  {
    source: 'meta_help',
    title: 'Meta lead ads overview',
    content:
      'Meta lead ads collect contact details through an in-app form instead of sending ' +
      'traffic to a website. Keep forms short: every extra field lowers completion rate.',
  },
];

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
    console.log('[db] demo user already present — seed skipped');
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

  await db.insert(schema.knowledgeDocuments).values(
    MINIMAL_KNOWLEDGE_DOCS.map((d) => ({
      source: d.source,
      title: d.title,
      content: d.content,
      embedding: null,
      metadata: {},
    })),
  );

  console.log(
    `[db] seeded demo org "${org.name}" (${org.id}) with user ${DEMO_USER_EMAIL} ` +
      `and ${MINIMAL_KNOWLEDGE_DOCS.length} knowledge documents`,
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
