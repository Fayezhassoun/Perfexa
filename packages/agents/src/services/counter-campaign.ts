// Counter-Campaign Agent: analyzes competitor ad intel scans and generates
// a concrete counter-campaign proposal for human approval.

import { and, desc, eq } from 'drizzle-orm';
import { competitorAdScans, competitors, proposals, type CompetitorAdScan } from '@growthcrew/db';
import type { AgentContext, Plan, PlanAction, PlanAgent } from '../types.js';
import { getOrCreateAgent } from '../execute-plan.js';

export interface CounterCampaignInput {
  competitorId?: string;
  monthlyBudgetCents?: number;
}

export interface CounterCampaignResult {
  competitorName: string;
  analysis: string;
  plan: Plan;
  proposalId: string;
}

/**
 * Analyze the latest ad intel scans for a competitor and generate a
 * counter-campaign proposal. The proposal goes through the standard
 * human-approval gate — nothing spends without explicit sign-off.
 */
export async function generateCounterCampaign(
  ctx: AgentContext,
  input: CounterCampaignInput,
): Promise<CounterCampaignResult> {
  // 1. Load competitor info
  let competitorName = 'Unknown competitor';
  let competitorUrl: string | null = null;

  if (input.competitorId) {
    const [comp] = await ctx.db
      .select()
      .from(competitors)
      .where(and(eq(competitors.id, input.competitorId), eq(competitors.orgId, ctx.orgId)))
      .limit(1);
    if (!comp) throw new Error('Competitor not found');
    competitorName = comp.name ?? comp.url ?? 'Unknown competitor';
    competitorUrl = comp.url ?? null;
  }

  // 2. Load latest scans (all regions)
  const scanConditions = [eq(competitorAdScans.orgId, ctx.orgId)];
  if (input.competitorId) {
    scanConditions.push(eq(competitorAdScans.competitorId, input.competitorId));
  }
  const scans = await ctx.db
    .select()
    .from(competitorAdScans)
    .where(and(...scanConditions))
    .orderBy(desc(competitorAdScans.scannedAt))
    .limit(20);

  if (scans.length === 0) {
    throw new Error(
      `No ad intel scans found${input.competitorId ? ` for ${competitorName}` : ''}. Run a scan first via competitors.adIntel.scan.`,
    );
  }

  // If no specific competitor was targeted, derive the name from scan data
  if (!input.competitorId) {
    const nameCounts = new Map<string, number>();
    for (const scan of scans) {
      const name = scan.advertiserName;
      if (name) nameCounts.set(name, (nameCounts.get(name) ?? 0) + (scan.adCount ?? 0));
    }
    if (nameCounts.size > 0) {
      competitorName = [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    }
  }

  // 3. Analyze competitive landscape
  const analysis = analyzeScans(scans, competitorName);

  // 4. Build counter-campaign plan
  const monthlyBudgetCents = input.monthlyBudgetCents ?? 50000; // default $500/mo
  const plan = buildCounterPlan(analysis, competitorName, competitorUrl, monthlyBudgetCents);

  // 5. Create proposal (human approval required)
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
    actorId: 'competitor-analyst',
    action: 'counter_campaign.proposed',
    entityType: 'proposal',
    entityId: proposal!.id,
    payload: {
      competitor: competitorName,
      title: plan.title,
      monthlyBudgetCents: plan.monthlyBudgetCents,
      regions: analysis.activeRegions,
    },
  });

  return {
    competitorName,
    analysis: analysis.summary,
    plan,
    proposalId: proposal!.id,
  };
}

// ---------------------------------------------------------------------------
// Internal analysis
// ---------------------------------------------------------------------------

interface ScanAnalysis {
  totalAds: number;
  activeRegions: string[];
  topRegion: { region: string; adCount: number };
  avgAdsPerRegion: number;
  hasCreatives: boolean;
  creativeCount: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  recommendedPlatforms: ('google_ads' | 'meta' | 'tiktok')[];
  recommendedKeywords: string[];
}

function analyzeScans(scans: CompetitorAdScan[], competitorName: string): ScanAnalysis {
  // Deduplicate: latest scan per region (skip null regions)
  const latestByRegion = new Map<string, CompetitorAdScan>();
  for (const scan of scans) {
    const region = scan.region ?? 'unknown';
    if (!latestByRegion.has(region)) {
      latestByRegion.set(region, scan);
    }
  }

  const regions = [...latestByRegion.values()];
  const totalAds = regions.reduce((sum, r) => sum + (r.adCount ?? 0), 0);
  const activeRegions = regions.map((r) => r.region ?? 'unknown');
  const topRegion = regions.reduce((best, r) => ((r.adCount ?? 0) > (best.adCount ?? 0) ? r : best), regions[0]!);
  const avgAdsPerRegion = Math.round(totalAds / regions.length);

  // Count creatives across all scans
  let creativeCount = 0;
  for (const scan of regions) {
    const creatives = scan.creatives as unknown[] | null;
    if (creatives?.length) creativeCount += creatives.length;
  }

  // Threat assessment
  let threatLevel: ScanAnalysis['threatLevel'] = 'low';
  if (totalAds > 5000) threatLevel = 'critical';
  else if (totalAds > 1000) threatLevel = 'high';
  else if (totalAds > 200) threatLevel = 'medium';

  // Platform recommendation based on threat level and region spread
  const recommendedPlatforms: ('google_ads' | 'meta' | 'tiktok')[] = ['google_ads'];
  if (threatLevel === 'high' || threatLevel === 'critical') {
    recommendedPlatforms.push('meta');
  }
  if (activeRegions.some((r) => ['SA', 'AE', 'KW'].includes(r)) && threatLevel !== 'low') {
    recommendedPlatforms.push('tiktok');
  }

  // Extract keywords from advertiser name / creatives
  const recommendedKeywords: string[] = [];
  if (competitorName && competitorName !== 'Unknown competitor') {
    recommendedKeywords.push(competitorName.toLowerCase());
  }

  const topRegionName = topRegion.region ?? 'unknown';
  const topRegionAds = topRegion.adCount ?? 0;

  const summary =
    `${competitorName} is running ~${totalAds.toLocaleString()} ads across ${activeRegions.length} region(s). ` +
    `Heaviest presence: ${topRegionName} with ${topRegionAds.toLocaleString()} ads. ` +
    `Threat level: ${threatLevel.toUpperCase()}. ` +
    `${creativeCount > 0 ? `${creativeCount} unique creatives detected. ` : ''}` +
    `Recommended counter: ${recommendedPlatforms.map((p) => p.replace('_', ' ').toUpperCase()).join(' + ')}.`;

  return {
    totalAds,
    activeRegions,
    topRegion: { region: topRegionName, adCount: topRegionAds },
    avgAdsPerRegion,
    hasCreatives: creativeCount > 0,
    creativeCount,
    threatLevel,
    summary,
    recommendedPlatforms,
    recommendedKeywords,
  };
}

function buildCounterPlan(
  analysis: ScanAnalysis,
  competitorName: string,
  competitorUrl: string | null,
  monthlyBudgetCents: number,
): Plan {
  const platformCount = analysis.recommendedPlatforms.length;
  const perPlatformCents = Math.floor((monthlyBudgetCents * 0.7) / platformCount);
  const reserveCents = monthlyBudgetCents - perPlatformCents * platformCount;

  const budgetSplit = [
    ...analysis.recommendedPlatforms.map((platform) => ({
      platform: platform as 'google_ads' | 'meta' | 'tiktok',
      cents: perPlatformCents,
    })),
    { platform: 'reserve' as const, cents: reserveCents },
  ];

  const agents: PlanAgent[] = [
    {
      type: 'competitor',
      name: 'Competitor Analyst',
      rationale: `Monitor ${competitorName}'s ${analysis.totalAds.toLocaleString()} ads and detect new moves`,
      tasks: [
        'Weekly re-scan of competitor ad presence',
        'Alert on new regions or creative angles',
        'Track creative fatigue and refresh cycles',
      ],
    },
  ];

  const actions: PlanAction[] = [];

  if (analysis.recommendedPlatforms.includes('google_ads')) {
    agents.push({
      type: 'google_ads',
      name: 'Google Ads Specialist',
      rationale: `Counter ${competitorName}'s search presence in ${analysis.topRegion.region}`,
      tasks: [
        `Bid on competitor keywords in ${analysis.topRegion.region}`,
        'Create comparison ad copy highlighting our USP',
        'Set up competitor conquesting campaign',
      ],
    });
    actions.push({
      toolName: 'ads.create_campaign',
      args: {
        platform: 'google_ads',
        name: `Counter: ${competitorName} — Search Conquesting`,
        dailyBudgetCents: Math.floor(perPlatformCents / 30),
        targeting: { regions: analysis.activeRegions, keywords: analysis.recommendedKeywords },
      },
      summary: `Launch Google Search conquesting campaign against ${competitorName} in ${analysis.activeRegions.join(', ')}`,
      gated: true,
    });
  }

  if (analysis.recommendedPlatforms.includes('meta')) {
    agents.push({
      type: 'meta_ads',
      name: 'Meta Ads Specialist',
      rationale: `Match ${competitorName}'s social ad volume with differentiated creative`,
      tasks: [
        'Create counter-creative addressing competitor weaknesses',
        'Target lookalike audiences in competitor regions',
        'A/B test 3 creative angles',
      ],
    });
    actions.push({
      toolName: 'ads.create_campaign',
      args: {
        platform: 'meta',
        name: `Counter: ${competitorName} — Social Differentiation`,
        dailyBudgetCents: Math.floor(perPlatformCents / 30),
        targeting: { regions: analysis.activeRegions },
      },
      summary: `Launch Meta counter-campaign with differentiated creative in ${analysis.topRegion.region}`,
      gated: true,
    });
  }

  if (analysis.recommendedPlatforms.includes('tiktok')) {
    agents.push({
      type: 'tiktok_ads',
      name: 'TikTok Ads Specialist',
      rationale: `Capture MENA short-video audience that ${competitorName} is targeting`,
      tasks: [
        'Produce 3 short-form video ads',
        'Target MENA demographics 18-35',
        'Test hook variations in first 3 seconds',
      ],
    });
    actions.push({
      toolName: 'ads.create_campaign',
      args: {
        platform: 'tiktok',
        name: `Counter: ${competitorName} — TikTok MENA`,
        dailyBudgetCents: Math.floor(perPlatformCents / 30),
        targeting: { regions: analysis.activeRegions.filter((r) => ['SA', 'AE', 'KW'].includes(r)) },
      },
      summary: `Launch TikTok counter-campaign targeting MENA audiences`,
      gated: true,
    });
  }

  const threatLabel =
    analysis.threatLevel === 'critical'
      ? 'dominant'
      : analysis.threatLevel === 'high'
        ? 'aggressive'
        : analysis.threatLevel === 'medium'
          ? 'active'
          : 'present';

  return {
    title: `Counter-Campaign: ${competitorName} (${analysis.threatLevel} threat)`,
    summary:
      `${competitorName} is ${threatLabel} with ~${analysis.totalAds.toLocaleString()} ads across ${analysis.activeRegions.length} regions. ` +
      `This plan launches ${platformCount} counter-campaign${platformCount > 1 ? 's' : ''} to capture their audience with differentiated messaging.`,
    businessGoal: 'leads',
    geography: analysis.activeRegions.join(', '),
    monthlyBudgetCents,
    budgetSplit,
    agents,
    actions,
    timeline:
      'Campaigns can launch within 24 hours of approval. ' +
      'First performance data in 3-5 days. Full optimization cycle: 2 weeks.',
    expectedOutcomes: [
      `Capture search traffic from ${competitorName}'s branded keywords`,
      `Differentiated creative in ${analysis.topRegion.region} (their strongest market)`,
      'Weekly competitor monitoring with alerts on new moves',
      analysis.hasCreatives
        ? `Counter their ${analysis.creativeCount} known creatives with fresher angles`
        : 'Establish baseline creative before they scale further',
    ],
  };
}
