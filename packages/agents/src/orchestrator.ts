// Orchestrator (CONTRACTS §8/§9): intent → clarification state machine →
// proposal → approval short-circuit. The mock path (default) is fully
// deterministic; openai/anthropic providers get the same flow as a system
// prompt plus the orchestrator tool set.

import { and, desc, eq } from 'drizzle-orm';
import { conversations, messages as messagesTable, organizations, proposals, websites } from '@voxmarketer/db';
import type { SeoAudit } from '@voxmarketer/integrations';
import type { ChatMessage } from '@voxmarketer/llm';
import type {
  AgentContext,
  ConversationDraft,
  ConversationMeta,
  Intent,
  OrchestratorResult,
  Plan,
} from './types.js';
import {
  APPROVE_RE,
  REJECT_RE,
  detectBudgetAmountCents,
  detectGeography,
  detectIntents,
  detectPausePlatform,
} from './intents.js';
import { recallString, remember } from './memory.js';
import { executeTool, getTool } from './tools.js';
import { approveProposal, getOrCreateAgent } from './execute-plan.js';

const PLATFORM_LABEL: Record<'google_ads' | 'meta' | 'tiktok', string> = {
  google_ads: 'Google Search',
  meta: 'Meta',
  tiktok: 'TikTok',
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

async function loadConversationMeta(ctx: AgentContext): Promise<ConversationMeta> {
  if (!ctx.conversationId) return {};
  const [row] = await ctx.db
    .select({ metadata: conversations.metadata })
    .from(conversations)
    .where(eq(conversations.id, ctx.conversationId))
    .limit(1);
  return ((row?.metadata as ConversationMeta | undefined) ?? {}) as ConversationMeta;
}

async function saveConversationMeta(ctx: AgentContext, meta: ConversationMeta): Promise<void> {
  if (!ctx.conversationId) return;
  await ctx.db.update(conversations).set({ metadata: meta }).where(eq(conversations.id, ctx.conversationId));
}

async function loadOrg(ctx: AgentContext) {
  const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1);
  if (!org) throw new Error('Organization not found');
  return org;
}

async function findPendingProposal(ctx: AgentContext) {
  const conditions = [eq(proposals.orgId, ctx.orgId), eq(proposals.status, 'pending')];
  const rows = await ctx.db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(desc(proposals.createdAt))
    .limit(1);
  return rows[0];
}

function platformFromIntents(intents: Intent[]): 'google_ads' | 'meta' | 'tiktok' {
  if (intents.includes('ads_meta')) return 'meta';
  if (intents.includes('ads_tiktok')) return 'tiktok';
  return 'google_ads';
}

const MARKETING_INTENTS: Intent[] = ['seo', 'visibility', 'leads', 'ads_google', 'ads_meta', 'ads_tiktok'];

export async function handleUserMessage(
  ctx: AgentContext,
  message: string,
  modality: 'voice' | 'text',
): Promise<OrchestratorResult> {
  // 1. Approval short-circuit — deterministic, before anything else (§8.2).
  const pending = await findPendingProposal(ctx);
  if (pending) {
    if (APPROVE_RE.test(message)) {
      const { plan, agentRuns, errors } = await approveProposal(ctx, pending.id, modality === 'voice' ? 'voice' : 'click');
      const firstRunSummary = plan.actions.map((a) => a.summary).join(' ');
      const assistantMessage =
        errors.length > 0
          ? `I approved the plan but hit a problem: ${errors[0]} Check the activity feed for details.`
          : `Done! ${firstRunSummary} Your ${plan.agents.length} specialists are set up and everything is running in safe sandbox mode — no real money is being spent. Take a look at the dashboard to watch results come in.`;
      return { assistantMessage, proposal: plan, proposalId: pending.id, proposalApproved: true, agentRuns, errors };
    }
    if (REJECT_RE.test(message)) {
      await ctx.db
        .update(proposals)
        .set({ status: 'rejected', decidedBy: ctx.userId ?? null, decidedVia: modality, decidedAt: ctx.now ?? new Date() })
        .where(eq(proposals.id, pending.id));
      await ctx.audit.log({
        actorType: 'user',
        actorId: ctx.userId ?? 'unknown',
        action: 'proposal.rejected',
        entityType: 'proposal',
        entityId: pending.id,
        payload: { via: modality },
      });
      return {
        assistantMessage:
          "No problem — I've cancelled that plan and nothing was launched. Tell me what you'd like to change and I'll put together a new one.",
        proposalRejected: true,
        proposalId: pending.id,
      };
    }
  }

  // 2. Non-mock LLM providers use the tool-calling loop.
  if (ctx.llm.name !== 'mock') {
    return handleWithLLM(ctx, message, modality);
  }

  const meta = await loadConversationMeta(ctx);
  const org = await loadOrg(ctx);
  const intents = detectIntents(message);

  // 3. Pause command on existing campaigns.
  const pausePlatform = detectPausePlatform(message);
  if (pausePlatform) {
    return handlePause(ctx, pausePlatform);
  }

  // 4. Analytics question.
  if (intents.includes('analytics') && !intents.some((i) => MARKETING_INTENTS.includes(i))) {
    return handleAnalyticsQuestion(ctx);
  }

  // 5. Marketing intents → audit + clarification state machine.
  const hasMarketing = intents.some((i) => MARKETING_INTENTS.includes(i));
  if (hasMarketing && !meta.draft) {
    return startDraft(ctx, org, intents, message, meta);
  }
  if (meta.draft) {
    return finalizeDraft(ctx, org, message, meta);
  }

  // 6. Budget change on existing state.
  if (intents.includes('budget_change')) {
    return {
      assistantMessage:
        'To change budgets I need a bit more detail: which platform, and what monthly amount? For example: "Set Google to $800 a month".',
      needsClarification: [{ id: 'budget-detail', question: 'Which platform and what monthly amount?', field: 'budget' }],
    };
  }

  // 7. Fallback — never more than 4 clarifying questions per conversation.
  const questionCount = (meta.questionCount ?? 0) + 1;
  await saveConversationMeta(ctx, { ...meta, questionCount });
  if (questionCount > 4) {
    return {
      assistantMessage:
        "I don't want to keep guessing. The easiest starting point: tell me your main goal — more visibility, more leads, or more sales — and I'll take it from there.",
    };
  }
  return {
    assistantMessage:
      "I can help you get more visibility, more leads, or launch ads. For example, try saying: \"I need an SEO specialist, my website must be top visible, I need to get leads.\" What would you like to work on?",
    needsClarification: [{ id: 'goal', question: 'What is your main goal?', field: 'goal' }],
  };
}

// ---------------------------------------------------------------------------
// Mock state machine (CONTRACTS §9 — exact required behavior)
// ---------------------------------------------------------------------------

async function startDraft(
  ctx: AgentContext,
  org: { websiteUrl: string | null; monthlyBudgetCeilingCents: number | null },
  intents: Intent[],
  message: string,
  meta: ConversationMeta,
): Promise<OrchestratorResult> {
  const website = org.websiteUrl ?? (await websiteFromDb(ctx));
  if (!website) {
    return {
      assistantMessage: 'Happy to help with that. First — what is your website address?',
      needsClarification: [{ id: 'website', question: 'What is your website address?', field: 'website' }],
    };
  }

  // Run the real audit through the tool layer (mock-safe: respects SEO_AUDIT_MODE).
  const { result } = await executeTool(ctx, 'seo.run_audit', { url: website });
  const audit = result as SeoAudit;
  const mobileSpeed = audit.pagespeed.performanceScore;
  const missingMeta = audit.crawl.missingMetaDescriptions;

  const geography = detectGeography(message);
  if (geography) await remember(ctx, 'geography', geography);

  const draft: ConversationDraft = {
    intents,
    platform: platformFromIntents(intents),
    auditSummary: {
      url: audit.url,
      score: audit.score,
      mobileSpeed,
      missingMeta,
      hasLeadForm: audit.crawl.hasLeadForm,
      isMock: audit.isMock,
    },
    keywords: audit.keywordSuggestions.slice(0, 10).map((k) => k.keyword),
    createdAt: (ctx.now ?? new Date()).toISOString(),
  };
  await saveConversationMeta(ctx, { ...meta, draft, questionCount: 0 });

  const monthly = org.monthlyBudgetCeilingCents ?? 50000;
  const assistantMessage =
    `I ran a quick check on your site: mobile speed ${mobileSpeed}/100, ` +
    `${missingMeta} missing meta description${missingMeta === 1 ? '' : 's'}, ` +
    `${draft.auditSummary.hasLeadForm ? 'a lead form is already in place' : 'no lead form'}. ` +
    `I can set up: 1) SEO Agent to fix technical issues and target 10 keywords, ` +
    `2) Google Ads Agent to get you visible this week, 3) Lead Gen Agent to add a contact form. ` +
    `Suggested budget $${dollars(monthly)}/mo: 60% Google, 40% held for Meta later. ` +
    `What city/area do you serve, and is $${dollars(monthly)} OK?`;

  return {
    assistantMessage,
    needsClarification: [
      { id: 'geography', question: 'What city/area do you serve?', field: 'geography' },
      { id: 'budget', question: `Is $${dollars(monthly)} a month OK?`, field: 'budget' },
    ],
  };
}

async function finalizeDraft(
  ctx: AgentContext,
  org: { name: string; monthlyBudgetCeilingCents: number | null },
  message: string,
  meta: ConversationMeta,
): Promise<OrchestratorResult> {
  const draft = meta.draft!;
  const geography = detectGeography(message) ?? (await recallString(ctx, 'geography')) ?? 'your area';
  const statedBudget = detectBudgetAmountCents(message);
  // Explicit amount wins; otherwise fall back to the org ceiling (§8.4).
  const monthlyCents = statedBudget ?? org.monthlyBudgetCeilingCents ?? 50000;
  await remember(ctx, 'geography', geography);

  const platform = draft.platform;
  const platformCents = Math.round(monthlyCents * 0.6);
  const reserveCents = monthlyCents - platformCents;
  const dailyCents = Math.max(100, Math.round(platformCents / 30));
  const primaryKeyword = draft.keywords[0] ?? 'services';

  const plan: Plan = {
    title: `Growth plan for ${org.name}`,
    summary: `Fix SEO issues, launch ${PLATFORM_LABEL[platform]} ads targeting ${geography}, and capture leads with a contact form.`,
    businessGoal: draft.intents.includes('leads') ? 'leads' : 'visibility',
    geography,
    monthlyBudgetCents: monthlyCents,
    budgetSplit: [
      { platform, cents: platformCents },
      { platform: 'reserve', cents: reserveCents },
    ],
    agents: [
      {
        type: 'seo',
        name: 'SEO Specialist',
        rationale: `Audit score ${draft.auditSummary.score}/100 — fix technical issues and grow organic visibility.`,
        tasks: [
          `Fix ${draft.auditSummary.missingMeta} missing meta descriptions`,
          'Improve mobile speed (currently ' + draft.auditSummary.mobileSpeed + '/100)',
          `Target 10 keywords starting with "${primaryKeyword}"`,
        ],
      },
      {
        type: platform === 'meta' ? 'meta_ads' : platform === 'tiktok' ? 'tiktok_ads' : 'google_ads',
        name: `${PLATFORM_LABEL[platform]} Ads Specialist`,
        rationale: 'Get you visible this week while SEO gains build up.',
        tasks: [`Launch a ${PLATFORM_LABEL[platform]} campaign targeting ${geography}`, 'Track spend and results daily'],
      },
      {
        type: 'lead_gen',
        name: 'Lead Gen Specialist',
        rationale: draft.auditSummary.hasLeadForm ? 'Improve lead capture and scoring.' : 'No lead form on the site — add one.',
        tasks: ['Add a contact form (hosted + embeddable)', 'Score and route new leads'],
      },
    ],
    actions: [
      {
        toolName: 'ads.create_campaign',
        args: {
          platform,
          input: {
            name: `${org.name} — ${PLATFORM_LABEL[platform]} (${geography})`,
            objective: 'leads',
            dailyBudgetCents: dailyCents,
            targeting: { geography, keywords: draft.keywords.slice(0, 5) },
            adCopy: {
              headline: `${org.name} — ${primaryKeyword} in ${geography}`,
              body: `Trusted ${primaryKeyword} in ${geography}. Get a free quote today.`,
            },
          },
        },
        summary: `Launch a $${dollars(platformCents)}/month ${PLATFORM_LABEL[platform]} campaign targeting ${geography}`,
        gated: true,
      },
      {
        toolName: 'leads.create_form',
        args: { name: 'Contact form' },
        summary: 'Add a contact form to capture leads',
        gated: true,
      },
    ],
    timeline: 'Ads can be live within 24 hours. SEO fixes land in week 1; rankings build over 4–12 weeks.',
    expectedOutcomes: [
      'Your ad shows for local searches within days',
      'A working contact form turning visitors into leads',
      'A healthier, faster website that ranks better over time',
    ],
  };

  const orchestratorAgent = await getOrCreateAgent(ctx, 'orchestrator');
  const [proposal] = await ctx.db
    .insert(proposals)
    .values({
      orgId: ctx.orgId,
      conversationId: ctx.conversationId ?? null,
      createdByAgentId: orchestratorAgent.id,
      plan,
      status: 'pending',
    })
    .returning();
  await ctx.audit.log({
    actorType: 'agent',
    actorId: 'orchestrator',
    action: 'proposal.created',
    entityType: 'proposal',
    entityId: proposal!.id,
    payload: { title: plan.title, monthlyBudgetCents: plan.monthlyBudgetCents, geography },
  });
  await saveConversationMeta(ctx, { ...meta, draft: undefined });

  const assistantMessage =
    `Here's your plan. Three specialists: an SEO Agent to fix the technical issues and target 10 keywords, ` +
    `a ${PLATFORM_LABEL[platform]} Ads Specialist, and a Lead Gen Agent to add a contact form. ` +
    `Budget: $${dollars(monthlyCents)}/month — 60% to ${PLATFORM_LABEL[platform]}, 40% held in reserve for Meta later. ` +
    `${plan.actions[0]!.summary} — say approve or cancel.`;

  return { assistantMessage, proposal: plan, proposalId: proposal!.id };
}

async function handlePause(ctx: AgentContext, platform: 'google_ads' | 'meta' | 'tiktok'): Promise<OrchestratorResult> {
  const { result } = await executeTool(ctx, 'ads.list_campaigns', { platform });
  const campaigns = (result as { externalId: string; name: string; status: string }[]) ?? [];
  const active = campaigns.filter((c) => c.status === 'active');
  if (active.length === 0) {
    return { assistantMessage: `There are no active ${PLATFORM_LABEL[platform]} campaigns to pause right now.` };
  }
  for (const c of active) {
    await executeTool(ctx, 'ads.pause_campaign', { platform, externalId: c.externalId });
  }
  return {
    assistantMessage: `Paused ${active.length} ${PLATFORM_LABEL[platform]} campaign${active.length === 1 ? '' : 's'} (${active
      .map((c) => `"${c.name}"`)
      .join(', ')}). Nothing else will be charged there. Want me to move that budget somewhere else?`,
  };
}

async function handleAnalyticsQuestion(ctx: AgentContext): Promise<OrchestratorResult> {
  const { result } = await executeTool(ctx, 'analytics.get_overview', {});
  const overview = result as {
    totals: { impressions: number; clicks: number; spendCents: number; conversions: number };
    byPlatform: Record<string, { spendCents: number; clicks: number; conversions: number }>;
    campaigns: number;
  };
  if (overview.campaigns === 0) {
    return { assistantMessage: 'No campaigns are running yet, so there are no results to report. Want me to put together a plan?' };
  }
  const t = overview.totals;
  const perPlatform = Object.entries(overview.byPlatform)
    .map(([p, m]) => `${PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p}: $${(m.spendCents / 100).toFixed(2)} spent, ${m.clicks} clicks, ${m.conversions} leads`)
    .join('; ');
  return {
    assistantMessage: `So far: $${(t.spendCents / 100).toFixed(2)} spent, ${t.impressions.toLocaleString()} impressions, ${t.clicks} clicks and ${t.conversions} leads across ${overview.campaigns} campaign(s). ${perPlatform}. Everything is inside your budget caps.`,
  };
}

async function websiteFromDb(ctx: AgentContext): Promise<string | null> {
  const [site] = await ctx.db.select({ url: websites.url }).from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
  return site?.url ?? null;
}

// ---------------------------------------------------------------------------
// LLM provider path (openai/anthropic) — same flow, model-driven.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the VoxMarketer Orchestrator for a small business owner who knows nothing about advertising.
Style: simple, reassuring, jargon-free. Short sentences. Never invent numbers.

Flow you must follow:
1. When the user expresses marketing goals (SEO, visibility, leads, ads), FIRST run seo.run_audit on their website, then reply with a plain-language summary of the findings and ask AT MOST 2 clarifying questions (which city/area they serve; whether the suggested budget is OK).
2. When they answer, propose a concrete plan: which specialist agents you will set up (SEO, Google Ads, Lead Gen as needed), the budget split (default 60% ads / 40% reserve), timeline, and expected outcomes. End with a one-line voice summary like: "Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel."
3. NEVER execute spend, publish, or delete actions yourself. The system gates them behind human approval — if a tool call fails with an approval error, explain that approval is needed and stop.
4. Ground marketing advice in the knowledge base when relevant. Keep replies under 120 words unless asked for detail.`;

async function handleWithLLM(ctx: AgentContext, message: string, modality: 'voice' | 'text'): Promise<OrchestratorResult> {
  void modality;
  const { getToolsForAgent } = await import('./tools.js');
  const { zodToJsonSchema } = await import('@voxmarketer/llm');
  const tools = getToolsForAgent('orchestrator');
  const specs = tools.map((t) => ({ name: t.name, description: t.description, parameters: zodToJsonSchema(t.schema) }));

  const history = ctx.conversationId
    ? await ctx.db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, ctx.conversationId))
        .orderBy(messagesTable.createdAt)
        .limit(20)
    : [];

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map((m): ChatMessage => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content ?? '' })),
    { role: 'user', content: message },
  ];

  const toolCallsMade: string[] = [];
  for (let round = 0; round < 4; round++) {
    const res = await ctx.llm.chat(messages, { tools: specs });
    if (!res.toolCalls?.length) {
      return { assistantMessage: res.content || 'I am here — tell me what you need.', agentRuns: undefined };
    }
    messages.push({ role: 'assistant', content: res.content });
    for (const call of res.toolCalls) {
      const tool = getTool(call.name);
      let toolResult: unknown;
      try {
        if (!tool || tool.gated) {
          toolResult = { error: 'This action requires human approval and cannot be executed by the assistant.' };
        } else {
          const { result } = await executeTool(ctx, call.name, call.args);
          toolResult = result;
          toolCallsMade.push(call.name);
        }
      } catch (err) {
        toolResult = { error: err instanceof Error ? err.message : String(err) };
      }
      messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify(toolResult).slice(0, 4000) });
    }
  }
  return { assistantMessage: 'I looked into that for you. Could you confirm what you would like me to do next?' };
}
