// Orchestrator (CONTRACTS §8/§9): intent → clarification state machine →
// proposal → approval short-circuit. The mock path (default) is fully
// deterministic; openai/anthropic providers get the same flow as a system
// prompt plus the orchestrator tool set.

import { and, desc, eq } from 'drizzle-orm';
import { conversations, messages as messagesTable, organizations, proposals, websites } from '@growthcrew/db';
import type { SeoAudit } from '@growthcrew/integrations';
import type { ChatMessage } from '@growthcrew/llm';
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
import { searchMemory } from './services/memory.js';


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

  // 4b. Expansion intents (social / content / competitors / reviews) — only
  // when the message isn't part of the campaign-planning state machine.
  const hasMarketingIntent = intents.some((i) => MARKETING_INTENTS.includes(i));
  // An explicit "post …" request is social even when a platform name (e.g.
  // Instagram) also matched an ads intent.
  const explicitlySocial = intents.includes('social') && /\bposts?\b|social media|content calendar/i.test(message);
  if (explicitlySocial && !meta.draft) {
    return handleSocialRequest(ctx, message);
  }
  if (!hasMarketingIntent && !meta.draft) {
    if (intents.includes('social')) return handleSocialRequest(ctx, message);
    if (intents.includes('content')) return handleContentRequest(ctx, message);
    if (intents.includes('reviews')) return handleReviewsRequest(ctx);
    if (intents.includes('competitor')) return handleCompetitorRequest(ctx, message);
  }

  // 5. Marketing intents → audit + clarification state machine.
  const hasMarketing = hasMarketingIntent;
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
  org: { name: string; websiteUrl?: string | null; monthlyBudgetCeilingCents: number | null },
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
            // live adapters attach a real ad only when they know where it points
            ...(org.websiteUrl ? { landingUrl: org.websiteUrl } : {}),
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

const SYSTEM_PROMPT = `You are the GrowthCrew Orchestrator — the user's fractional head of growth. You are not a chatbot answering tickets; you are a senior marketing strategist who happens to live in their dashboard. You think like an operator: you weigh trade-offs, you cite specifics, you anticipate the next problem, and you talk to the owner like a trusted colleague, not a customer.

How you communicate:
- Be substantive. A real strategist doesn't answer a growth question in one line. Give the reasoning, the recommendation, and the "here's what I'd watch for." Two to four short paragraphs is normal; use a tight list when you're laying out options or steps.
- Be specific and grounded. Reference the brand context, the business memory, and any live numbers you pulled from tools. Vague advice ("improve your SEO") is worthless — say what to change and why it matters.
- Plain language, no jargon walls. The owner is smart but not an ads specialist. Explain a term the first time you use it, then move on. Warm and confident, never salesy or sycophantic.
- Match the depth to the ask. A quick factual question gets a crisp answer. A strategy question gets real thinking. Don't pad, but don't shortchange.
- Never invent numbers. If you don't have a metric, say so or pull it with a tool.

Your operating flow (follow it, but keep it conversational — never sound like a script):
1. When the user expresses a marketing goal (SEO, visibility, leads, ads), FIRST run seo.run_audit on their website. Then walk them through what you found in plain terms, give your read on what it means for their business, and ask AT MOST 2 clarifying questions (which city/area they serve; whether the suggested budget works).
2. When they answer, propose a concrete plan: which specialist agents you'll set up (SEO, Google Ads, Lead Gen as needed), the budget split (default 60% ads / 40% reserve), the timeline, and the outcomes they should expect. Explain the reasoning behind the split. Close with a one-line decision prompt like: "Launch a $300/month Google Search campaign targeting Chicago — say approve or cancel."
3. For general questions, brainstorming, or "what do you think" prompts — just be the strategist. Reason it through, give your honest recommendation with the trade-offs, and offer to turn it into action. You don't need to force every message into a campaign.
4. NEVER execute spend, publish, or delete actions yourself. The system gates them behind human approval — if a tool call fails with an approval error, explain plainly that the step needs their sign-off and stop.
5. Ground marketing advice in the knowledge base and business memory when relevant.`;

async function handleWithLLM(ctx: AgentContext, message: string, modality: 'voice' | 'text'): Promise<OrchestratorResult> {
  void modality;

  // --- Cost guardrail: block if org is over monthly LLM budget ---
  const { isWithinBudget, recordUsage, getUsageStats } = await import('./services/llm-usage.js');
  if (!(await isWithinBudget(ctx))) {
    const stats = await getUsageStats(ctx);
    return {
      assistantMessage: `You've reached your monthly AI budget ($${(stats.estimatedCostCents / 100).toFixed(2)} of $${(stats.budgetCents / 100).toFixed(2)} used). Your deterministic engines (alerts, fatigue detection, competitor intel) still run normally. Upgrade your plan or increase your budget in Settings → AI Usage to resume AI conversations.`,
    };
  }

  const { getToolsForAgent } = await import('./tools.js');
  const { zodToJsonSchema } = await import('@growthcrew/llm');
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

  let systemPrompt = SYSTEM_PROMPT;

  // Brand DNA — ground all output in the org's brand profile
  try {
    const org = await loadOrg(ctx);
    const bp = org.brandProfile;
    if (bp && Object.keys(bp).length > 0) {
      const parts: string[] = [];
      if (bp.companyName) parts.push(`Company: ${bp.companyName}`);
      if (bp.tagline) parts.push(`Tagline: ${bp.tagline}`);
      if (bp.industry) parts.push(`Industry: ${bp.industry}`);
      if (bp.targetAudience) parts.push(`Target audience: ${bp.targetAudience}`);
      if (bp.voiceTone) parts.push(`Voice & tone: ${bp.voiceTone}`);
      if (bp.usp) parts.push(`USP: ${bp.usp}`);
      if (Array.isArray(bp.doList) && bp.doList.length) parts.push(`Always: ${bp.doList.join('; ')}`);
      if (Array.isArray(bp.dontList) && bp.dontList.length) parts.push(`Never: ${bp.dontList.join('; ')}`);
      if (Array.isArray(bp.products) && bp.products.length) parts.push(`Products/services: ${bp.products.join(', ')}`);
      if (Array.isArray(bp.pastWins) && bp.pastWins.length) parts.push(`Past wins: ${bp.pastWins.join('; ')}`);
      if (Array.isArray(bp.competitors) && bp.competitors.length) parts.push(`Known competitors: ${bp.competitors.join(', ')}`);
      if (parts.length > 0) {
        systemPrompt += `\n\n## Brand Context\nYou are the AI marketing team for this business. Ground ALL responses, copy, and campaign proposals in this brand:\n${parts.join('\n')}`;
      }
    }
  } catch {
    // Brand profile is best-effort — never block the conversation
  }

  try {
    const memoryHits = await searchMemory(ctx, message);
    if (memoryHits.length > 0) {
      const memoryText = memoryHits
        .map((h) => `- [${h.kind ?? 'note'}] ${h.title ?? 'Untitled'}: ${h.content}`)
        .join('\n');
      systemPrompt += `\n\nBusiness Memory Context:\n${memoryText}`;
    }
  } catch {
    // Ignore memory search errors during prompt building
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m): ChatMessage => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content ?? '' })),
    { role: 'user', content: message },
  ];


  const toolCallsMade: string[] = [];
  for (let round = 0; round < 4; round++) {
    const res = await ctx.llm.chat(messages, { tools: specs });
    // Record token usage for cost guardrails
    if (res.usage) {
      await recordUsage(ctx, res.usage).catch(() => {});
    }
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

// ---------------------------------------------------------------------------
// Expansion intent handlers (social / content / reviews / competitors)
// ---------------------------------------------------------------------------

function extractTopic(message: string): string | undefined {
  const about = message.match(/\babout\s+(.{3,120})$/i);
  if (about?.[1]) return about[1].trim().replace(/[.!?]+$/, '');
  const on = message.match(/\b(?:post|blog|article|write|caption)\s+(?:on|for)\s+(.{3,120})$/i);
  if (on?.[1]) return on[1].trim().replace(/[.!?]+$/, '');
  return undefined;
}

function detectSocialPlatform(message: string): 'facebook' | 'instagram' | 'x' | 'linkedin' | 'tiktok' {
  if (/instagram|\big\b/i.test(message)) return 'instagram';
  if (/linkedin/i.test(message)) return 'linkedin';
  if (/facebook|\bfb\b/i.test(message)) return 'facebook';
  if (/tik\s?tok/i.test(message)) return 'tiktok';
  if (/\btweet\b|\bx\b/i.test(message)) return 'x';
  return 'instagram';
}

async function handleSocialRequest(ctx: AgentContext, message: string): Promise<OrchestratorResult> {
  const { createPost } = await import('./services/social.js');
  const topic = extractTopic(message);
  if (!topic) {
    return {
      assistantMessage:
        'Happy to handle your social media. Tell me what to post about — for example: "post about our summer discount on Instagram" — and I\'ll draft it for your review on the Social page.',
      needsClarification: [{ id: 'social-topic', question: 'What should the post be about?', field: 'topic' }],
    };
  }
  const platform = detectSocialPlatform(message);
  const post = await createPost(ctx, { platform, topic });
  return {
    assistantMessage:
      `I drafted a ${platform} post for you: “${post.content}” — it's waiting on the Social page. ` +
      `Nothing goes public until you hit Publish (that step always needs your approval).`,
  };
}

async function handleContentRequest(ctx: AgentContext, message: string): Promise<OrchestratorResult> {
  const { draftPiece } = await import('./services/content.js');
  const topic = extractTopic(message) ?? message.slice(0, 80);
  const type = /ad copy/i.test(message) ? ('ad_copy' as const) : /caption/i.test(message) ? ('social_caption' as const) : ('blog' as const);
  const piece = await draftPiece(ctx, { type, topic });
  const label = type === 'blog' ? 'blog draft' : type === 'ad_copy' ? 'ad copy draft' : 'caption draft';
  return {
    assistantMessage: `Done — I wrote a ${label} titled “${piece.title}”. It's in the Content studio for you to review, edit, and approve.`,
  };
}

async function handleReviewsRequest(ctx: AgentContext): Promise<OrchestratorResult> {
  const { syncReviews, stats } = await import('./services/reviews.js');
  await syncReviews(ctx);
  const s = await stats(ctx);
  const negativeNote = s.negative > 0 ? ` ${s.negative} negative review${s.negative > 1 ? 's' : ''} could use a reply — I can draft those for you.` : '';
  return {
    assistantMessage:
      `I pulled your latest reviews: ${s.total} total, averaging ${s.avgRating ?? '—'}★ ` +
      `(${s.positive} positive, ${s.neutral} neutral, ${s.negative} negative).${negativeNote} ` +
      `See them all on the Reviews page — posting any reply needs your approval.`,
  };
}

async function handleCompetitorRequest(ctx: AgentContext, message: string): Promise<OrchestratorResult> {
  const { addCompetitor, listCompetitors } = await import('./services/competitors.js');
  const urlMatch = message.match(/\b((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?)\b/i);
  if (urlMatch?.[1]) {
    const competitor = await addCompetitor(ctx, urlMatch[1]);
    const snapshot = competitor.snapshot as { score?: number } | null;
    return {
      assistantMessage:
        `I analyzed ${competitor.name}: their SEO score is ${snapshot?.score ?? '—'}/100. ` +
        `The full breakdown and my counter-move suggestions are on the Competitors page.`,
    };
  }
  const existing = await listCompetitors(ctx);
  if (existing.length) {
    return {
      assistantMessage: `You're tracking ${existing.length} competitor${existing.length > 1 ? 's' : ''} — the latest snapshots are on the Competitors page. Give me another website address to add one more.`,
    };
  }
  return {
    assistantMessage:
      'I can keep an eye on your competitors. Give me a website address — e.g. "track competitor rivalplumbing.com" — and I\'ll analyze their SEO and suggest counter-moves.',
    needsClarification: [{ id: 'competitor-url', question: "What is the competitor's website?", field: 'url' }],
  };
}
