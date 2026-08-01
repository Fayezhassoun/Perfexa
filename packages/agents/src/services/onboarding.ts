// Onboarding services (CONTRACTS §5): org profile updates + completion
// (budget row from ceiling, initial crawl — fast and failable).

import { and, eq } from 'drizzle-orm';
import { budgets, organizations, type Organization } from '@growthcrew/db';
import type { AgentContext } from '../types.js';
import { executeTool } from '../tools.js';

export async function getOnboarding(ctx: AgentContext): Promise<Organization> {
  const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
  if (!org) throw new Error('Organization not found');
  return org;
}

export interface OnboardingPatch {
  name?: string;
  websiteUrl?: string;
  goals?: ('visibility' | 'leads' | 'sales')[];
  monthlyBudgetCeilingCents?: number;
  onboardingStep?: 'welcome' | 'business' | 'goals' | 'budget' | 'connect' | 'voice' | 'insight' | 'done';
  businessBrain?: BusinessBrainPatch;
}

export type BusinessBrainTone = 'friendly' | 'expert' | 'premium' | 'direct';
export type BusinessBrainFormality = 'casual' | 'balanced' | 'formal';
export type BusinessBrainPersonality = 'approachable' | 'authoritative' | 'playful' | 'bold';
export type BusinessBrainChannel = 'seo' | 'google_ads' | 'meta' | 'email' | 'social' | 'reviews';

export interface BusinessBrainPatch {
  offer?: string;
  idealCustomer?: string;
  location?: string;
  tone?: BusinessBrainTone;
  formality?: BusinessBrainFormality;
  personality?: BusinessBrainPersonality;
  channels?: BusinessBrainChannel[];
  constraints?: string;
  proofPoints?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mergeBusinessBrain(
  settings: Record<string, unknown> | null | undefined,
  patch: BusinessBrainPatch,
): Record<string, unknown> {
  const nextSettings = asRecord(settings);
  const currentBrain = asRecord(nextSettings.businessBrain);
  const nextBrain = Object.fromEntries(
    Object.entries({ ...currentBrain, ...patch }).filter(([, value]) => value !== undefined),
  );

  return { ...nextSettings, businessBrain: nextBrain };
}

export async function updateOnboarding(ctx: AgentContext, patch: OnboardingPatch): Promise<Organization> {
  const settings = patch.businessBrain
    ? mergeBusinessBrain((await getOnboarding(ctx)).settings, patch.businessBrain)
    : undefined;
  const [updated] = await ctx.db
    .update(organizations)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl } : {}),
      ...(patch.goals !== undefined ? { goals: patch.goals } : {}),
      ...(patch.monthlyBudgetCeilingCents !== undefined ? { monthlyBudgetCeilingCents: patch.monthlyBudgetCeilingCents } : {}),
      ...(patch.onboardingStep !== undefined ? { onboardingStep: patch.onboardingStep } : {}),
      ...(settings ? { settings } : {}),
    })
    .where(eq(organizations.id, ctx.orgId))
    .returning();
  if (!updated) throw new Error('Organization not found');
  return updated;
}

export async function completeOnboarding(ctx: AgentContext): Promise<{ org: Organization; crawled: boolean }> {
  const org = await getOnboarding(ctx);
  const ceiling = org.monthlyBudgetCeilingCents ?? 50000;

  const [existingCap] = await ctx.db
    .select()
    .from(budgets)
    .where(and(eq(budgets.orgId, ctx.orgId), eq(budgets.scope, 'global'), eq(budgets.period, 'monthly')))
    .limit(1);
  if (existingCap) {
    await ctx.db.update(budgets).set({ capCents: ceiling }).where(eq(budgets.id, existingCap.id));
  } else {
    await ctx.db.insert(budgets).values({ orgId: ctx.orgId, scope: 'global', capCents: ceiling, period: 'monthly' });
  }

  const [updated] = await ctx.db
    .update(organizations)
    .set({ onboardingStep: 'done' })
    .where(eq(organizations.id, ctx.orgId))
    .returning();

  let crawled = false;
  if (org.websiteUrl) {
    try {
      await executeTool(ctx, 'seo.run_audit', { url: org.websiteUrl });
      crawled = true;
    } catch {
      crawled = false; // failable by design (CONTRACTS §5)
    }
  }
  await ctx.audit.log({
    actorType: 'user',
    actorId: ctx.userId ?? 'unknown',
    action: 'onboarding.completed',
    entityType: 'organization',
    entityId: ctx.orgId,
    payload: { ceilingCents: ceiling, crawled },
  });
  return { org: updated!, crawled };
}
