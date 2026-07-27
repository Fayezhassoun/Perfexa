// End-to-end smoke of the CONTRACTS §12 reference dialog against a real DB.
// Run: DATABASE_URL=... SEO_AUDIT_MODE=mock LLM_PROVIDER=mock pnpm exec tsx smoke.mts

import { eq } from 'drizzle-orm';
import { getDb, schema } from '@sayso/db';
import { getLLM } from '@sayso/llm';
import { createAuditLogger, executeTool, handleUserMessage, checkSpend } from './src/index.js';

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  console.log(cond ? `  ✓ ${label}` : `  ✗ FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra)?.slice(0, 200));
  if (!cond) failures++;
}

const db = getDb();
const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.name, 'Demo Business'));
const [user] = await db.select().from(schema.users).where(eq(schema.users.email, 'demo@sayso.dev'));
if (!org || !user) throw new Error('Seed data missing — run pnpm db:seed first');

// Clean slate so the smoke is re-runnable.
await db.delete(schema.conversations).where(eq(schema.conversations.orgId, org.id));
await db.delete(schema.proposals).where(eq(schema.proposals.orgId, org.id));
await db.delete(schema.approvals).where(eq(schema.approvals.orgId, org.id));
await db.delete(schema.agents).where(eq(schema.agents.orgId, org.id));
await db.delete(schema.agentRuns).where(eq(schema.agentRuns.orgId, org.id));
await db.delete(schema.campaignsMirror).where(eq(schema.campaignsMirror.orgId, org.id));
await db.delete(schema.auditLogs).where(eq(schema.auditLogs.orgId, org.id));
await db.delete(schema.budgets).where(eq(schema.budgets.orgId, org.id));
await db.insert(schema.budgets).values({ orgId: org.id, scope: 'global', capCents: 50000, period: 'monthly' });
await db.update(schema.organizations).set({ settings: {} }).where(eq(schema.organizations.id, org.id));

const [conv] = await db.insert(schema.conversations).values({ orgId: org.id, userId: user.id, title: 'smoke' }).returning();
const ctx = { db, orgId: org.id, userId: user.id, conversationId: conv!.id, llm: getLLM(), audit: createAuditLogger(db, org.id) };

console.log('--- §12 step 1: voice brief ---');
const r1 = await handleUserMessage(
  ctx,
  'I need an SEO specialist. I need my website to be top visible. I need to get leads.',
  'voice',
);
check('mentions mobile speed 58/100', r1.assistantMessage.includes('mobile speed 58/100'), r1.assistantMessage);
check('mentions 3 missing meta descriptions', r1.assistantMessage.includes('3 missing meta descriptions'));
check('mentions no lead form', r1.assistantMessage.includes('no lead form'));
check('offers 3 agents', /1\).*SEO.*2\).*Google Ads.*3\).*Lead Gen/s.test(r1.assistantMessage));
check('suggests $500 with 60/40 split', r1.assistantMessage.includes('$500') && r1.assistantMessage.includes('60%'));
check('asks 2 clarifying questions', (r1.needsClarification?.length ?? 0) === 2);

console.log('--- §12 step 2: clarification → proposal ---');
const r2 = await handleUserMessage(ctx, 'Chicago area, yes $500 is fine.', 'voice');
check('proposal created', Boolean(r2.proposal && r2.proposalId));
check(
  'exact voice summary',
  r2.assistantMessage.includes('Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel.'),
  r2.assistantMessage,
);
check('plan has gated create_campaign action', r2.proposal?.actions.some((a) => a.toolName === 'ads.create_campaign' && a.gated));
check('daily budget = $10 (1000 cents)', (r2.proposal?.actions[0]?.args.input as { dailyBudgetCents?: number })?.dailyBudgetCents === 1000);

console.log('--- §12 step 3: voice approve → execution ---');
const r3 = await handleUserMessage(ctx, 'approve', 'voice');
check('proposal approved', r3.proposalApproved === true);
const agentsRows = await db.select().from(schema.agents).where(eq(schema.agents.orgId, org.id));
const types = agentsRows.map((a) => a.type).sort();
check('agents created (seo, google_ads, lead_gen)', ['seo', 'google_ads', 'lead_gen'].every((t) => types.includes(t)), types);
const approvalsRows = await db.select().from(schema.approvals).where(eq(schema.approvals.orgId, org.id));
check('recorded approvals exist, all approved via voice', approvalsRows.length >= 1 && approvalsRows.every((a) => a.status === 'approved' && a.decidedVia === 'voice'));
const campaigns = await db.select().from(schema.campaignsMirror).where(eq(schema.campaignsMirror.orgId, org.id));
check(
  'campaign mirrored: google_ads active $10/day',
  campaigns.some((c) => c.platform === 'google_ads' && c.status === 'active' && c.budgetDailyCents === 1000),
  campaigns.map((c) => ({ p: c.platform, s: c.status, b: c.budgetDailyCents })),
);
const audits = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.orgId, org.id));
check('audit log populated', audits.length >= 5, audits.length);
const runs = await db.select().from(schema.agentRuns).where(eq(schema.agentRuns.orgId, org.id));
check('agent runs recorded with tool calls', runs.length >= 1 && runs.some((r) => (r.toolCalls as unknown[])?.length > 0));

console.log('--- approval gate (negative) ---');
let gateThrew = false;
try {
  await executeTool(ctx, 'ads.create_campaign', {
    platform: 'google_ads',
    input: { name: 'rogue', objective: 'leads', dailyBudgetCents: 500, targeting: {} },
  });
} catch (e) {
  gateThrew = (e as Error).name === 'ApprovalRequired';
}
check('gated tool without approval throws ApprovalRequired', gateThrew);

console.log('--- budget guardian ---');
await db.insert(schema.budgets).values({ orgId: org.id, scope: 'platform:google_ads', capCents: 100, period: 'monthly' });
const verdict = await checkSpend(ctx, 'google_ads', 1000);
check('tiny cap blocks new spend', !verdict.ok, verdict.reason);

console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
