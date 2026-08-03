// Shared DB test helpers: fresh org per test + a ready AgentContext.

import { db, organizations, orgMembers, users, budgets, closeDb } from '@growthcrew/db';
import { truncateAll } from '../../db/src/test-utils';
import { createAgentContext } from '../src/context.js';
import type { AgentContext } from '../src/types.js';

export { db, closeDb, truncateAll };

export interface TestOrg {
  ctx: AgentContext;
  orgId: string;
  userId: string;
}

export async function freshOrg(opts?: {
  websiteUrl?: string;
  monthlyBudgetCeilingCents?: number;
  seedGlobalBudget?: boolean;
  now?: Date;
  settings?: Record<string, unknown>;
}): Promise<TestOrg> {
  const [user] = await db
    .insert(users)
    .values({ name: 'Test Owner', email: `owner-${crypto.randomUUID()}@test.dev` })
    .returning({ id: users.id });
  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Test Business',
      websiteUrl: opts?.websiteUrl ?? 'https://example.com',
      goals: ['visibility', 'leads'],
      monthlyBudgetCeilingCents: opts?.monthlyBudgetCeilingCents ?? 50_000,
      onboardingStep: 'done',
      settings: opts?.settings ?? {},
    })
    .returning({ id: organizations.id });
  await db.insert(orgMembers).values({ orgId: org!.id, userId: user!.id, role: 'owner' });

  if (opts?.seedGlobalBudget !== false) {
    await db.insert(budgets).values({
      orgId: org!.id,
      scope: 'global',
      capCents: opts?.monthlyBudgetCeilingCents ?? 50_000,
      period: 'monthly',
    });
  }

  const ctx = createAgentContext({ db, orgId: org!.id, userId: user!.id, now: opts?.now });
  return { ctx, orgId: org!.id, userId: user!.id };
}
