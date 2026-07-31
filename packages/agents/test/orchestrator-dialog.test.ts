// The §12 reference dialog (CONTRACTS §9) — exact required mock behavior,
// driven through the same sendChatMessage entry the web app uses.

import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { agents, auditLogs, campaignsMirror, proposals } from '@growthcrew/db';
import { sendChatMessage } from '../src/services/conversations.js';
import type { Plan } from '../src/types.js';
import { db, freshOrg, truncateAll, type TestOrg } from './helpers.js';

const BRIEF = 'I need an SEO specialist. I need my website to be top visible. I need to get leads.';

async function say(org: TestOrg, content: string, conversationId?: string) {
  return sendChatMessage(
    { ...org.ctx, conversationId },
    { conversationId, content, modality: 'voice' },
  );
}

describe('§12 reference dialog (mock orchestrator)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('step 1: audit summary with the exact fixture numbers + 2 questions', async () => {
    const org = await freshOrg({ websiteUrl: 'https://example.com' });
    const r1 = await say(org, BRIEF);

    expect(r1.reply).toContain('58/100');
    expect(r1.reply).toMatch(/3 missing meta description/i);
    expect(r1.reply).toMatch(/no lead form/i);
    expect(r1.reply).toContain('$500');
    expect(r1.reply).toContain('60%');
    expect(r1.reply).toMatch(/city|area/i);
    // No proposal yet — clarification round-trip first.
    expect(r1.proposalId).toBeUndefined();
  });

  it('step 2: clarification answer emits the proposal + voice summary', async () => {
    const org = await freshOrg({ websiteUrl: 'https://example.com' });
    const r1 = await say(org, BRIEF);
    const r2 = await say(org, 'Chicago area, yes $500 is fine.', r1.conversationId);

    expect(r2.proposalId).toBeTruthy();
    expect(r2.reply).toContain(
      'Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel.',
    );

    const plan = r2.proposal as Plan;
    expect(plan.geography).toBe('Chicago');
    expect(plan.monthlyBudgetCents).toBe(50_000);
    const google = plan.budgetSplit.find((s) => s.platform === 'google_ads');
    const reserve = plan.budgetSplit.find((s) => s.platform === 'reserve');
    expect(google?.cents).toBe(30_000);
    expect(reserve?.cents).toBe(20_000);
    expect(plan.actions.some((a) => a.toolName === 'ads.create_campaign')).toBe(true);
  });

  it('step 3: "approve" launches everything with recorded approvals + audit', async () => {
    const org = await freshOrg({ websiteUrl: 'https://example.com' });
    const r1 = await say(org, BRIEF);
    const r2 = await say(org, 'Chicago area, yes $500 is fine.', r1.conversationId);
    const r3 = await say(org, 'approve', r2.conversationId);

    expect(r3.proposalApproved).toBe(true);

    const [proposal] = await db.select().from(proposals).where(eq(proposals.orgId, org.orgId));
    expect(proposal!.status).toBe('approved');
    expect(proposal!.decidedVia).toBe('voice');

    // Agents created: seo, google_ads, lead_gen at minimum.
    const orgAgents = await db.select().from(agents).where(eq(agents.orgId, org.orgId));
    const types = orgAgents.map((a) => a.type);
    expect(types).toEqual(expect.arrayContaining(['seo', 'google_ads', 'lead_gen']));

    // Mock campaign live in the mirror: google_ads, active, $10/day (= $300/mo).
    const mirror = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, org.orgId));
    expect(mirror).toHaveLength(1);
    expect(mirror[0]!.platform).toBe('google_ads');
    expect(mirror[0]!.status).toBe('active');
    expect(mirror[0]!.budgetDailyCents).toBe(1_000);
    expect(mirror[0]!.mode).toBe('sandbox');

    // Every step audit-logged.
    const audits = await db.select().from(auditLogs).where(eq(auditLogs.orgId, org.orgId));
    const actions = audits.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['proposal.approved', 'tool.ads.create_campaign', 'agent.created']),
    );
  });

  it('"cancel" on a pending proposal rejects it and launches nothing', async () => {
    const org = await freshOrg({ websiteUrl: 'https://example.com' });
    const r1 = await say(org, BRIEF);
    const r2 = await say(org, 'Chicago area, yes $500 is fine.', r1.conversationId);
    const r3 = await say(org, 'cancel', r2.conversationId);

    expect(r3.proposalRejected).toBe(true);
    const [proposal] = await db.select().from(proposals).where(eq(proposals.orgId, org.orgId));
    expect(proposal!.status).toBe('rejected');
    const mirror = await db.select().from(campaignsMirror).where(eq(campaignsMirror.orgId, org.orgId));
    expect(mirror).toHaveLength(0);
  });
});
