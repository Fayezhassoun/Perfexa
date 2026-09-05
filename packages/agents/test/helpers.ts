// Shared DB test helpers: fresh org per test + a ready AgentContext.

import { vi } from 'vitest';
import { encrypt } from '@growthcrew/integrations';
import { db, connectedAccounts, organizations, orgMembers, users, budgets, closeDb } from '@growthcrew/db';
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

/** An encrypted provider-account fixture, never an external OAuth request. */
export async function connectOAuthTestAccount(ctx: AgentContext, platform: 'google_ads') {
  vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client');
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('GOOGLE_ADS_DEVELOPER_TOKEN', 'test-developer');
  await db.insert(connectedAccounts).values({ orgId: ctx.orgId, platform, externalAccountId: '1234567890', accessTokenEnc: encrypt('test-access-token'), status: 'connected', mode: 'sandbox' });
}
