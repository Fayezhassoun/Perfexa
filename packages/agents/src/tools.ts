// Tool layer (CONTRACTS §8): typed tools, per-agent subsets, and the HARD
// approval-gate rule — gated tools refuse to run without an approved approvals
// row whose payload hash matches. Adapters are only reachable through this file
// for writes, so there is no un-gated spend path.

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  approvals,
  campaignsMirror,
  competitors,
  contentPieces,
  leadForms,
  leads,
  organizations,
  reviews,
  socialPosts,
  websites,
} from '@sayso/db';
import {
  ApprovalRequired,
  BudgetCapExceeded,
  crawlWebsite,
  createMockSocialAdapter,
  fetchMockReviews,
  runSeoAudit,
  sentimentForReview,
  type AdPlatform,
  type MockAdAdapter,
  type SeoAudit,
  type SocialPlatform,
} from '@sayso/integrations';
import type { AgentContext, AgentType, ToolCallRecord, ToolDef } from './types.js';
import { payloadHash } from './audit.js';
import { getOrgAdapter } from './store.js';
import { checkSpend } from './guardian.js';
import { remember, recall, recallAll } from './memory.js';
import { createJob as createVideoJob } from './services/video.js';
import { scanCompetitor as scanCompetitorAds } from './services/ad-intel.js';

const platformSchema = z.enum(['google_ads', 'meta', 'tiktok']);

async function requireWebsiteUrl(ctx: AgentContext, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const [org] = await ctx.db
    .select({ websiteUrl: organizations.websiteUrl })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  if (org?.websiteUrl) return org.websiteUrl;
  const [site] = await ctx.db.select({ url: websites.url }).from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
  if (site?.url) return site.url;
  throw new Error('No website on file yet. Tell me your website address first.');
}

async function persistAudit(ctx: AgentContext, url: string, audit: unknown, score: number): Promise<void> {
  const [existing] = await ctx.db.select().from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
  if (existing) {
    await ctx.db
      .update(websites)
      .set({ url, crawl: audit, lastCrawledAt: ctx.now ?? new Date() })
      .where(eq(websites.id, existing.id));
  } else {
    await ctx.db.insert(websites).values({ orgId: ctx.orgId, url, crawl: audit, lastCrawledAt: ctx.now ?? new Date() });
  }
  // seoScoreHistory for the dashboard tracker (cap 90 entries)
  const [org] = await ctx.db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, ctx.orgId))
    .limit(1);
  const settings = (org?.settings as Record<string, unknown> | undefined) ?? {};
  const history = ((settings.seoScoreHistory as { date: string; score: number }[] | undefined) ?? []).slice(-89);
  history.push({ date: (ctx.now ?? new Date()).toISOString().slice(0, 10), score });
  await ctx.db
    .update(organizations)
    .set({ settings: { ...settings, seoScoreHistory: history } })
    .where(eq(organizations.id, ctx.orgId));
}

/** Throws BudgetCapExceeded when the Guardian rejects the spend. */
async function assertSpendAllowed(ctx: AgentContext, platform: AdPlatform, additionalDailyCents: number): Promise<void> {
  const verdict = await checkSpend(ctx, platform, additionalDailyCents);
  if (!verdict.ok) {
    throw new BudgetCapExceeded(verdict.scope ?? `platform:${platform}`, verdict.capCents ?? 0, verdict.attemptedCents ?? additionalDailyCents);
  }
}

/** Deterministic caption template (the mock stand-in for the LLM copywriter). */
export function draftCaption(businessName: string, topic: string, platform: string): string {
  const clean = topic.trim().replace(/[.!?]+$/, '');
  const hashtags = clean
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 3)
    .map((w) => `#${w}`)
    .join(' ');
  const cta =
    platform === 'linkedin'
      ? 'Get in touch to learn more.'
      : platform === 'x'
        ? 'DM us to get started.'
        : 'Tap the link in bio to get started.';
  return `${clean.charAt(0).toUpperCase()}${clean.slice(1)} — here's how ${businessName} can help. ${cta} ${hashtags ?? ''}`.trim();
}

/** Deterministic content drafts grounded on audit keywords (mock LLM). */
export function draftContent(
  businessName: string,
  type: string,
  topic: string,
  keywords: string[],
): { title: string; body: string } {
  const clean = topic.trim().replace(/[.!?]+$/, '');
  if (type === 'ad_copy') {
    return {
      title: `${clean} — ${businessName}`,
      body: `Headline: ${clean} made simple\nBody: ${businessName} helps you with ${clean.toLowerCase()} — fast, reliable, and local. Get a free quote today.`,
    };
  }
  if (type === 'social_caption') {
    return { title: clean, body: draftCaption(businessName, clean, 'instagram') };
  }
  const kw = keywords.length ? keywords.join(', ') : clean.toLowerCase();
  return {
    title: `${clean}: a practical guide from ${businessName}`,
    body:
      `## Why ${clean.toLowerCase()} matters\n\nCustomers searching for ${kw} want clear answers fast. ` +
      `This guide explains what to look for, what it costs, and how to choose well.\n\n` +
      `## What ${businessName} recommends\n\n1. Start with the basics and measure results.\n` +
      `2. Focus on the keywords your customers actually use (${kw}).\n` +
      `3. Make it easy to contact you from every page.\n\n` +
      `## Next steps\n\nTalk to us — we'll walk you through it without the jargon.`,
  };
}

/** Counter-move suggestions from a competitor audit vs our score. */
export function competitorSuggestions(theirs: SeoAudit, myScore: number | null): string[] {
  const suggestions: string[] = [];
  if (myScore != null) {
    suggestions.push(
      theirs.score > myScore
        ? `They score ${theirs.score}/100 vs your ${myScore} — close the gap by fixing your failing SEO checks first.`
        : `You score ${myScore}/100 vs their ${theirs.score} — you're ahead; protect the lead with fresh content.`,
    );
  }
  if (!theirs.crawl.hasLeadForm) {
    suggestions.push('They have no lead form — your contact form is a direct conversion advantage. Promote it.');
  }
  if (theirs.pagespeed.performanceScore < 60) {
    suggestions.push(`Their site is slow (${theirs.pagespeed.performanceScore}/100 mobile) — fast pages can win you their impatient visitors.`);
  }
  const kw = theirs.keywordSuggestions.slice(0, 3).map((k) => k.keyword);
  if (kw.length) suggestions.push(`They target: ${kw.join(', ')}. Consider bidding or writing content on these.`);
  return suggestions;
}

/** Tone-matched review reply templates (mock LLM). */
export function draftReviewReply(author: string, sentiment: string): string {
  const firstName = author.split(' ')[0] ?? 'there';
  if (sentiment === 'positive') {
    return `Thank you so much, ${firstName}! We're thrilled you had a great experience — see you again soon.`;
  }
  if (sentiment === 'negative') {
    return `${firstName}, we're really sorry this fell short. That's not the standard we hold ourselves to — please reach out directly so we can make it right.`;
  }
  return `Thanks for the honest feedback, ${firstName}. We're always improving and would love another chance to impress you.`;
}

export const TOOLS: ToolDef[] = [
  // ---- SEO ----
  {
    name: 'seo.run_audit',
    description: 'Run a full SEO audit (crawl + PageSpeed) on a website and store the results.',
    schema: z.object({ url: z.string().optional() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const url = await requireWebsiteUrl(ctx, args.url as string | undefined);
      const audit = await runSeoAudit(url);
      await persistAudit(ctx, url, audit, audit.score);
      return audit;
    },
  },
  {
    name: 'seo.crawl',
    description: 'Crawl a website and extract titles, meta descriptions, headings, lead forms.',
    schema: z.object({ url: z.string().optional() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const url = await requireWebsiteUrl(ctx, args.url as string | undefined);
      return crawlWebsite(url);
    },
  },

  // ---- Ads (read) ----
  {
    name: 'ads.list_campaigns',
    description: 'List campaigns for an ad platform.',
    schema: z.object({ platform: platformSchema }).strict(),
    gated: false,
    async execute(ctx, args) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform);
      return adapter.listCampaigns();
    },
  },
  {
    name: 'ads.get_metrics',
    description: 'Get fresh metrics for one campaign.',
    schema: z.object({ platform: platformSchema, externalId: z.string() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform);
      return adapter.getMetrics(args.externalId as string);
    },
  },
  {
    name: 'ads.get_keyword_ideas',
    description: 'Get keyword ideas with search volume and CPC estimates.',
    schema: z.object({ platform: platformSchema, seed: z.string(), geography: z.string().optional() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform);
      if (!adapter.getKeywordIdeas) return [];
      return adapter.getKeywordIdeas(args.seed as string, args.geography as string | undefined);
    },
  },
  {
    name: 'ads.check_ad_policy',
    description: 'Pre-check ad copy for likely platform policy violations.',
    schema: z
      .object({
        platform: platformSchema,
        adCopy: z.object({ headline: z.string(), body: z.string() }),
      })
      .strict(),
    gated: false,
    async execute(ctx, args) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform);
      if (!adapter.checkAdPolicy) return { ok: true, violations: [] };
      return adapter.checkAdPolicy(args.adCopy as { headline: string; body: string });
    },
  },

  // ---- Ads (write — GATED) ----
  {
    name: 'ads.create_campaign',
    description: 'Create and launch an ad campaign. SPEND action — requires approval.',
    schema: z
      .object({
        platform: platformSchema,
        input: z.object({
          name: z.string(),
          objective: z.string(),
          dailyBudgetCents: z.number().int().positive(),
          targeting: z.object({
            geography: z.string().optional(),
            keywords: z.array(z.string()).optional(),
            audience: z.string().optional(),
          }),
          adCopy: z.object({ headline: z.string(), body: z.string() }).optional(),
          landingUrl: z.string().url().optional(),
        }),
      })
      .strict(),
    gated: true,
    async execute(ctx, args) {
      const platform = args.platform as AdPlatform;
      const input = args.input as {
        name: string;
        objective: string;
        dailyBudgetCents: number;
        targeting: { geography?: string; keywords?: string[]; audience?: string };
        adCopy?: { headline: string; body: string };
      };
      await assertSpendAllowed(ctx, platform, input.dailyBudgetCents);
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, platform);
      let policyCheck: { ok: boolean; violations: string[] } = { ok: true, violations: [] };
      if (input.adCopy && adapter.checkAdPolicy) {
        policyCheck = await adapter.checkAdPolicy(input.adCopy);
      }
      const campaign = await adapter.createCampaign(input);
      return { campaign, policyCheck };
    },
  },
  {
    name: 'ads.update_budget',
    description: 'Change a campaign daily budget. SPEND action — requires approval.',
    schema: z
      .object({ platform: platformSchema, externalId: z.string(), dailyBudgetCents: z.number().int().positive() })
      .strict(),
    gated: true,
    async execute(ctx, args) {
      const platform = args.platform as AdPlatform;
      await assertSpendAllowed(ctx, platform, args.dailyBudgetCents as number);
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, platform);
      await adapter.updateBudget(args.externalId as string, args.dailyBudgetCents as number);
      return { ok: true };
    },
  },
  {
    name: 'ads.resume_campaign',
    description: 'Resume a paused campaign. SPEND action — requires approval.',
    schema: z.object({ platform: platformSchema, externalId: z.string() }).strict(),
    gated: true,
    async execute(ctx, args) {
      const platform = args.platform as AdPlatform;
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, platform);
      const campaigns = await adapter.listCampaigns();
      const target = campaigns.find((c) => c.externalId === (args.externalId as string));
      await assertSpendAllowed(ctx, platform, target?.budgetDailyCents ?? 0);
      await adapter.resumeCampaign(args.externalId as string);
      return { ok: true };
    },
  },
  {
    name: 'ads.pause_campaign',
    description: 'Pause a campaign (stops spend; not gated — pausing is always safe).',
    schema: z.object({ platform: platformSchema, externalId: z.string() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const adapter = await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform);
      await adapter.pauseCampaign(args.externalId as string);
      return { ok: true };
    },
  },
  {
    name: 'campaigns.delete',
    description: 'Permanently remove a campaign. DELETE action — requires approval.',
    schema: z.object({ platform: platformSchema, externalId: z.string() }).strict(),
    gated: true,
    async execute(ctx, args) {
      const adapter = (await getOrgAdapter(ctx.db, ctx.orgId, args.platform as AdPlatform)) as MockAdAdapter;
      await adapter.removeCampaign(args.externalId as string);
      return { ok: true };
    },
  },
  {
    name: 'budgets.raise_cap',
    description: 'Raise a budget cap. BUDGET action — requires approval.',
    schema: z
      .object({ scope: z.string(), capCents: z.number().int().positive(), period: z.enum(['daily', 'monthly']) })
      .strict(),
    gated: true,
    async execute(ctx, args) {
      const { budgets } = await import('@sayso/db');
      const [existing] = await ctx.db
        .select()
        .from(budgets)
        .where(and(eq(budgets.orgId, ctx.orgId), eq(budgets.scope, args.scope as string), eq(budgets.period, args.period as 'daily' | 'monthly')))
        .limit(1);
      if (existing) {
        await ctx.db.update(budgets).set({ capCents: args.capCents as number }).where(eq(budgets.id, existing.id));
        return { ok: true, id: existing.id };
      }
      const [row] = await ctx.db
        .insert(budgets)
        .values({ orgId: ctx.orgId, scope: args.scope as string, capCents: args.capCents as number, period: args.period as string })
        .returning();
      return { ok: true, id: row?.id };
    },
  },

  // ---- Lead gen ----
  {
    name: 'leads.create_form',
    description: 'Create a lead-capture form (embeddable + hosted link).',
    schema: z
      .object({
        name: z.string(),
        fields: z
          .array(
            z.object({
              key: z.string(),
              label: z.string(),
              type: z.enum(['text', 'email', 'phone', 'textarea']),
              required: z.boolean(),
            }),
          )
          .optional(),
      })
      .strict(),
    gated: false,
    async execute(ctx, args) {
      const fields = (args.fields as unknown[] | undefined) ?? [
        { key: 'name', label: 'Your name', type: 'text', required: true },
        { key: 'email', label: 'Email', type: 'email', required: true },
        { key: 'phone', label: 'Phone', type: 'phone', required: false },
        { key: 'message', label: 'How can we help?', type: 'textarea', required: false },
      ];
      const [form] = await ctx.db
        .insert(leadForms)
        .values({ orgId: ctx.orgId, name: args.name as string, fields })
        .returning();
      return form;
    },
  },
  {
    name: 'leads.score',
    description: 'Score a lead (0–100) from contactability and source quality.',
    schema: z.object({ leadId: z.string() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const [lead] = await ctx.db.select().from(leads).where(eq(leads.id, args.leadId as string)).limit(1);
      if (!lead) throw new Error(`Lead ${args.leadId} not found`);
      const score = scoreLead(lead);
      await ctx.db.update(leads).set({ score }).where(eq(leads.id, lead.id));
      return { leadId: lead.id, score };
    },
  },

  // ---- Analytics ----
  {
    name: 'analytics.get_overview',
    description: 'Unified spend/click/conversion totals across platforms.',
    schema: z.object({ days: z.number().int().optional() }).strict(),
    gated: false,
    async execute(ctx) {
      const rows = await ctx.db
        .select()
        .from(campaignsMirror)
        .where(eq(campaignsMirror.orgId, ctx.orgId))
        .orderBy(desc(campaignsMirror.updatedAt));
      const byPlatform: Record<string, { impressions: number; clicks: number; spendCents: number; conversions: number }> = {};
      for (const row of rows) {
        const p = row.platform ?? 'unknown';
        const m = (row.metrics as { impressions?: number; clicks?: number; spendCents?: number; conversions?: number } | null) ?? {};
        byPlatform[p] ??= { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };
        byPlatform[p]!.impressions += m.impressions ?? 0;
        byPlatform[p]!.clicks += m.clicks ?? 0;
        byPlatform[p]!.spendCents += m.spendCents ?? 0;
        byPlatform[p]!.conversions += m.conversions ?? 0;
      }
      const totals = Object.values(byPlatform).reduce(
        (acc, p) => ({
          impressions: acc.impressions + p.impressions,
          clicks: acc.clicks + p.clicks,
          spendCents: acc.spendCents + p.spendCents,
          conversions: acc.conversions + p.conversions,
        }),
        { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 },
      );
      return { byPlatform, totals, campaigns: rows.length };
    },
  },

  // ---- Social media ----
  {
    name: 'social.draft_post',
    description: 'Draft a social post (caption generated from the topic and brand voice). Not published.',
    schema: z
      .object({
        platform: z.enum(['facebook', 'instagram', 'x', 'linkedin', 'tiktok']),
        topic: z.string(),
        scheduledAt: z.string().optional(), // ISO
      })
      .strict(),
    gated: false,
    async execute(ctx, args) {
      const [org] = await ctx.db
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1);
      const content = draftCaption(org?.name ?? 'our business', args.topic as string, args.platform as string);
      const scheduledAt = args.scheduledAt ? new Date(args.scheduledAt as string) : null;
      const [post] = await ctx.db
        .insert(socialPosts)
        .values({
          orgId: ctx.orgId,
          platform: args.platform as string,
          content,
          status: scheduledAt ? 'scheduled' : 'draft',
          scheduledAt,
        })
        .returning();
      return post;
    },
  },
  {
    name: 'social.publish_post',
    description: 'Publish a drafted/scheduled post to its platform. PUBLISH action — requires approval.',
    schema: z.object({ postId: z.string() }).strict(),
    gated: true,
    async execute(ctx, args) {
      const [post] = await ctx.db
        .select()
        .from(socialPosts)
        .where(and(eq(socialPosts.id, args.postId as string), eq(socialPosts.orgId, ctx.orgId)))
        .limit(1);
      if (!post) throw new Error('Post not found');
      if (post.status === 'published') throw new Error('Post is already published');
      const adapter = createMockSocialAdapter(post.platform as SocialPlatform);
      const now = ctx.now ?? new Date();
      const { externalId, publishedAt } = await adapter.publishPost(
        { content: post.content ?? '', mediaUrls: post.mediaUrls ?? undefined },
        now,
      );
      const [updated] = await ctx.db
        .update(socialPosts)
        .set({
          status: 'published',
          externalId,
          publishedAt: new Date(publishedAt),
          metrics: { impressions: 0, likes: 0, comments: 0, shares: 0 },
        })
        .where(eq(socialPosts.id, post.id))
        .returning();
      return updated;
    },
  },
  {
    name: 'social.get_engagement',
    description: 'Refresh engagement metrics for published posts.',
    schema: z.object({ postId: z.string().optional() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const conditions = [eq(socialPosts.orgId, ctx.orgId), eq(socialPosts.status, 'published')];
      if (args.postId) conditions.push(eq(socialPosts.id, args.postId as string));
      const posts = await ctx.db
        .select()
        .from(socialPosts)
        .where(and(...conditions));
      const now = ctx.now ?? new Date();
      let refreshed = 0;
      for (const post of posts) {
        if (!post.externalId || !post.publishedAt) continue;
        const adapter = createMockSocialAdapter(post.platform as SocialPlatform);
        const metrics = await adapter.getEngagement(post.externalId, post.publishedAt, now);
        await ctx.db.update(socialPosts).set({ metrics: { ...metrics } }).where(eq(socialPosts.id, post.id));
        refreshed++;
      }
      return { refreshed };
    },
  },

  // ---- Content studio ----
  {
    name: 'content.draft',
    description: 'Draft a content piece (blog, ad copy, or caption) grounded on the site audit and knowledge base.',
    schema: z
      .object({
        type: z.enum(['blog', 'ad_copy', 'social_caption']),
        topic: z.string(),
      })
      .strict(),
    gated: false,
    async execute(ctx, args) {
      const [org] = await ctx.db
        .select({ name: organizations.name, websiteUrl: organizations.websiteUrl })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1);
      const [site] = await ctx.db.select().from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
      const audit = site?.crawl as { keywordSuggestions?: { keyword: string }[]; score?: number } | null;
      const keywords = (audit?.keywordSuggestions ?? []).slice(0, 5).map((k) => k.keyword);
      const piece = draftContent(org?.name ?? 'our business', args.type as string, args.topic as string, keywords);
      const [row] = await ctx.db
        .insert(contentPieces)
        .values({
          orgId: ctx.orgId,
          type: args.type as string,
          title: piece.title,
          body: piece.body,
          status: 'draft',
          grounding: { topic: args.topic, keywords, auditScore: audit?.score ?? null },
        })
        .returning();
      return row;
    },
  },

  // ---- Competitor intelligence ----
  {
    name: 'competitor.analyze',
    description: 'Run an SEO analysis of a competitor site and store the snapshot + counter-move suggestions.',
    schema: z.object({ competitorId: z.string() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const [row] = await ctx.db
        .select()
        .from(competitors)
        .where(and(eq(competitors.id, args.competitorId as string), eq(competitors.orgId, ctx.orgId)))
        .limit(1);
      if (!row) throw new Error('Competitor not found');
      const audit = await runSeoAudit(row.url);
      const [mySite] = await ctx.db.select().from(websites).where(eq(websites.orgId, ctx.orgId)).limit(1);
      const myAudit = mySite?.crawl as { score?: number } | null;
      const snapshot = {
        analyzedAt: (ctx.now ?? new Date()).toISOString(),
        score: audit.score,
        title: audit.crawl.title,
        performanceScore: audit.pagespeed.performanceScore,
        missingMetaDescriptions: audit.crawl.missingMetaDescriptions,
        hasLeadForm: audit.crawl.hasLeadForm,
        keywords: audit.keywordSuggestions.slice(0, 8).map((k) => k.keyword),
      };
      const suggestions = competitorSuggestions(audit, myAudit?.score ?? null);
      const history = [...(row.history ?? []), { analyzedAt: snapshot.analyzedAt, score: snapshot.score, keywords: snapshot.keywords }].slice(-12);
      const [updated] = await ctx.db
        .update(competitors)
        .set({ snapshot, suggestions, history })
        .where(eq(competitors.id, row.id))
        .returning();
      return updated;
    },
  },

  // ---- Reputation ----
  {
    name: 'reviews.sync',
    description: 'Fetch the latest reviews (mock Google Business) and store new ones with sentiment.',
    schema: z.object({}).strict(),
    gated: false,
    async execute(ctx) {
      const external = fetchMockReviews(ctx.orgId, 8, ctx.now ?? new Date());
      const existing = await ctx.db
        .select({ externalId: reviews.externalId })
        .from(reviews)
        .where(eq(reviews.orgId, ctx.orgId));
      const known = new Set(existing.map((r) => r.externalId));
      let added = 0;
      for (const review of external) {
        if (known.has(review.externalId)) continue;
        await ctx.db.insert(reviews).values({
          orgId: ctx.orgId,
          source: review.source,
          externalId: review.externalId,
          author: review.author,
          rating: review.rating,
          content: review.content,
          sentiment: sentimentForReview(review.content, review.rating),
        });
        added++;
      }
      return { added, total: external.length };
    },
  },
  {
    name: 'reviews.draft_reply',
    description: 'Draft a reply to a review, tone-matched to its sentiment. Not posted.',
    schema: z.object({ reviewId: z.string() }).strict(),
    gated: false,
    async execute(ctx, args) {
      const [review] = await ctx.db
        .select()
        .from(reviews)
        .where(and(eq(reviews.id, args.reviewId as string), eq(reviews.orgId, ctx.orgId)))
        .limit(1);
      if (!review) throw new Error('Review not found');
      const replyDraft = draftReviewReply(review.author ?? 'there', review.sentiment ?? 'neutral');
      const [updated] = await ctx.db
        .update(reviews)
        .set({ replyDraft, replyStatus: 'drafted' })
        .where(eq(reviews.id, review.id))
        .returning();
      return updated;
    },
  },
  {
    name: 'reviews.post_reply',
    description: 'Post the drafted reply publicly. PUBLISH action — requires approval.',
    schema: z.object({ reviewId: z.string() }).strict(),
    gated: true,
    async execute(ctx, args) {
      const [review] = await ctx.db
        .select()
        .from(reviews)
        .where(and(eq(reviews.id, args.reviewId as string), eq(reviews.orgId, ctx.orgId)))
        .limit(1);
      if (!review) throw new Error('Review not found');
      if (!review.replyDraft) throw new Error('No drafted reply to post');
      const [updated] = await ctx.db
        .update(reviews)
        .set({ replyStatus: 'replied', repliedAt: ctx.now ?? new Date() })
        .where(eq(reviews.id, review.id))
        .returning();
      return updated;
    },
  },

  // ---- Memory ----
  {
    name: 'memory.remember',
    description: 'Store a business fact/preference in long-term memory.',
    schema: z.object({ key: z.string(), value: z.unknown() }).strict(),
    gated: false,
    async execute(ctx, args) {
      await remember(ctx, args.key as string, args.value);
      return { ok: true };
    },
  },
  {
    name: 'memory.recall',
    description: 'Recall facts from long-term memory.',
    schema: z.object({ key: z.string().optional() }).strict(),
    gated: false,
    async execute(ctx, args) {
      return args.key ? { [args.key as string]: await recall(ctx, args.key as string) } : recallAll(ctx);
    },
  },
  {
    name: 'video.generate',
    description: 'Generate a short marketing video from a prompt. SPEND action — live renders require approval; mock mode completes instantly.',
    schema: z
      .object({
        prompt: z.string().min(4).max(1000),
        style: z.enum(['ugc', 'product_demo', 'cinematic', 'slideshow']).optional(),
        aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional(),
        durationSec: z.number().int().min(3).max(120).optional(),
      })
      .strict(),
    gated: true,
    async execute(ctx, args) {
      return createVideoJob(ctx, {
        prompt: args.prompt as string,
        style: args.style as string | undefined,
        aspectRatio: args.aspectRatio as string | undefined,
        durationSec: args.durationSec as number | undefined,
      });
    },
  },
  {
    name: 'competitor.ad_scan',
    description: 'Scan a competitor\'s Google Ads presence across regions via the Ads Transparency Center. Read-only research — not gated.',
    schema: z
      .object({
        competitorId: z.string().uuid().optional(),
        advertiserId: z.string().min(4).max(120),
        regions: z.array(z.string().length(2)).optional(),
      })
      .strict(),
    gated: false,
    async execute(ctx, args) {
      const rows = await scanCompetitorAds(ctx, {
        competitorId: args.competitorId as string | undefined,
        advertiserId: args.advertiserId as string,
        regions: args.regions as string[] | undefined,
      });
      return {
        scanned: rows.length,
        regions: rows.map((r) => ({ region: r.region, adCount: r.adCount })),
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef | undefined {
  return BY_NAME.get(name);
}

const AGENT_TOOLS: Record<AgentType, string[]> = {
  orchestrator: [
    'seo.run_audit',
    'seo.crawl',
    'ads.list_campaigns',
    'ads.get_metrics',
    'ads.get_keyword_ideas',
    'ads.check_ad_policy',
    'analytics.get_overview',
    'memory.remember',
    'memory.recall',
  ],
  seo: ['seo.run_audit', 'seo.crawl', 'memory.remember', 'memory.recall'],
  google_ads: [
    'ads.list_campaigns',
    'ads.get_metrics',
    'ads.get_keyword_ideas',
    'ads.check_ad_policy',
    'ads.create_campaign',
    'ads.update_budget',
    'ads.pause_campaign',
    'ads.resume_campaign',
    'campaigns.delete',
    'memory.recall',
  ],
  meta_ads: [
    'ads.list_campaigns',
    'ads.get_metrics',
    'ads.check_ad_policy',
    'ads.create_campaign',
    'ads.update_budget',
    'ads.pause_campaign',
    'ads.resume_campaign',
    'campaigns.delete',
    'memory.recall',
  ],
  tiktok_ads: [
    'ads.list_campaigns',
    'ads.get_metrics',
    'ads.check_ad_policy',
    'ads.create_campaign',
    'ads.update_budget',
    'ads.pause_campaign',
    'ads.resume_campaign',
    'campaigns.delete',
    'memory.recall',
  ],
  lead_gen: ['leads.create_form', 'leads.score', 'memory.remember', 'memory.recall'],
  analytics: ['analytics.get_overview', 'memory.recall'],
  budget_guardian: [],
  social_media: ['social.draft_post', 'social.publish_post', 'social.get_engagement', 'memory.remember', 'memory.recall'],
  content: ['content.draft', 'seo.crawl', 'memory.recall', 'video.generate'],
  competitor: ['competitor.analyze', 'competitor.ad_scan', 'seo.run_audit', 'memory.recall'],
  reputation: ['reviews.sync', 'reviews.draft_reply', 'reviews.post_reply', 'memory.recall'],
};

export function getToolsForAgent(type: AgentType): ToolDef[] {
  return (AGENT_TOOLS[type] ?? []).map((name) => BY_NAME.get(name)).filter((t): t is ToolDef => Boolean(t));
}

/** Lead scoring (also used by the public capture endpoint). */
export function scoreLead(lead: { email?: string | null; phone?: string | null; sourceCampaignId?: string | null }): number {
  let score = 0;
  if (lead.phone) score += 40;
  if (lead.email && !/@(gmail|yahoo|hotmail|outlook|aol)\./i.test(lead.email)) score += 30;
  else if (lead.email) score += 10;
  if (lead.sourceCampaignId) score += 30;
  return Math.min(100, score);
}

export interface ExecuteToolResult {
  result: unknown;
  record: ToolCallRecord;
}

/**
 * Execute a tool with gate enforcement. Gated tools REQUIRE
 * `rawArgs.__approvalId` → approvals row, status 'approved', same toolName,
 * matching payload hash. Anything else throws ApprovalRequired (CONTRACTS §8).
 */
export async function executeTool(
  ctx: AgentContext,
  toolName: string,
  rawArgs: Record<string, unknown>,
): Promise<ExecuteToolResult> {
  const tool = BY_NAME.get(toolName);
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  const { __approvalId, ...rest } = rawArgs;
  let approvalId: string | undefined;

  if (tool.gated) {
    if (typeof __approvalId !== 'string' || !__approvalId) {
      throw new ApprovalRequired(toolName, `${toolName} needs an approved approval to run`);
    }
    const [approval] = await ctx.db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, __approvalId), eq(approvals.orgId, ctx.orgId)))
      .limit(1);
    const action = approval?.action as { toolName?: string; args?: Record<string, unknown> } | undefined;
    if (
      !approval ||
      approval.status !== 'approved' ||
      action?.toolName !== toolName ||
      payloadHash(action.args ?? {}) !== payloadHash(rest)
    ) {
      throw new ApprovalRequired(toolName, `${toolName} approval is missing, rejected, or does not match this action`);
    }
    approvalId = approval.id;
  }

  const args = tool.schema.parse(rest) as Record<string, unknown>;
  const record: ToolCallRecord = { name: toolName, args, status: 'completed', gated: tool.gated, approvalId };

  try {
    const result = await tool.execute(ctx, args);
    record.result = result;
    await ctx.audit.log({
      actorType: 'agent',
      actorId: ctx.conversationId ? `orchestrator:${ctx.conversationId}` : 'tool-layer',
      action: `tool.${toolName}`,
      entityType: 'tool',
      entityId: toolName,
      payload: args,
      metadata: { gated: tool.gated, approvalId, status: 'completed' },
    });
    return { result, record };
  } catch (err) {
    record.status = 'failed';
    record.error = err instanceof Error ? err.message : String(err);
    await ctx.audit.log({
      actorType: 'agent',
      actorId: ctx.conversationId ? `orchestrator:${ctx.conversationId}` : 'tool-layer',
      action: `tool.${toolName}`,
      entityType: 'tool',
      entityId: toolName,
      payload: args,
      metadata: { gated: tool.gated, approvalId, status: 'failed', error: record.error },
    });
    throw err;
  }
}
