// Demo-data mode for design-partner demos (pilot ops). Orgs with no connected
// ad account would otherwise see all zeros in dashboards and weekly reports;
// when `organizations.settings.demoData === true` the dashboard KPIs and the
// weekly reports render a deterministic, realistic simulated marketing
// dataset instead. Every surface that shows this data MUST carry
// DEMO_DATA_LABEL — simulated numbers are never presented as real.

export const DEMO_DATA_LABEL = 'Demo data — connect your account for live numbers.';

/** True only when org settings explicitly opt in (`settings.demoData === true`). */
export function isDemoDataEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return false;
  return (settings as Record<string, unknown>).demoData === true;
}

export interface DemoTotals {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface DemoCampaignSeed extends DemoTotals {
  name: string;
  platform: 'google_ads' | 'meta';
  status: 'active' | 'paused';
}

/**
 * The simulated account: a believable small-business mix — a healthy search
 * hero, an efficient retargeting campaign, and one problem child spending
 * without conversions (the source of the demo alert).
 */
export const DEMO_CAMPAIGNS: DemoCampaignSeed[] = [
  {
    name: 'Search — Emergency Service Calls',
    platform: 'google_ads',
    status: 'active',
    spendCents: 31_240,
    impressions: 41_250,
    clicks: 1_240,
    conversions: 38,
  },
  {
    name: 'Retargeting — Recent Site Visitors',
    platform: 'meta',
    status: 'active',
    spendCents: 14_890,
    impressions: 28_900,
    clicks: 610,
    conversions: 17,
  },
  {
    name: 'Awareness — Local Reach',
    platform: 'google_ads',
    status: 'active',
    spendCents: 5_430,
    impressions: 60_100,
    clicks: 402,
    conversions: 0,
  },
];

export interface DemoHistoryPoint extends DemoTotals {
  date: string; // ISO day (YYYY-MM-DD)
}

/** Current-week weights, oldest → newest (sum 100). */
const CURRENT_WEEK_WEIGHTS = [11, 12, 13, 13, 13, 13, 13, 12];
/** Previous-week weights (sum 100); previous week runs at 88% of current. */
const PREV_WEEK_WEIGHTS = [13, 14, 14, 15, 15, 15, 14];
const PREV_WEEK_FACTOR = 0.88;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Split a total over fixed weights; the remainder lands on the final day. */
function spread(total: number, weights: number[]): number[] {
  const values = weights.map((w) => Math.round((total * w) / 100));
  const partial = values.slice(0, -1).reduce((a, b) => a + b, 0);
  values[values.length - 1] = total - partial;
  return values;
}

/**
 * 15 deterministic daily points for one campaign: days 0–7 back cover the
 * reporting week and sum exactly to the campaign totals; days 8–14 back are
 * the previous week at 88% (so week-over-week deltas look believable).
 */
export function demoCampaignHistory(campaign: DemoCampaignSeed, now: Date): DemoHistoryPoint[] {
  const points: DemoHistoryPoint[] = [];
  const daysAgoToDate = (daysAgo: number) => isoDay(new Date(now.getTime() - daysAgo * 86_400_000));

  const current = {
    spendCents: spread(campaign.spendCents, CURRENT_WEEK_WEIGHTS),
    impressions: spread(campaign.impressions, CURRENT_WEEK_WEIGHTS),
    clicks: spread(campaign.clicks, CURRENT_WEEK_WEIGHTS),
    conversions: spread(campaign.conversions, CURRENT_WEEK_WEIGHTS),
  };
  for (let i = 0; i < CURRENT_WEEK_WEIGHTS.length; i++) {
    points.push({
      date: daysAgoToDate(CURRENT_WEEK_WEIGHTS.length - 1 - i),
      spendCents: current.spendCents[i]!,
      impressions: current.impressions[i]!,
      clicks: current.clicks[i]!,
      conversions: current.conversions[i]!,
    });
  }

  const prevTotal = {
    spendCents: Math.round(campaign.spendCents * PREV_WEEK_FACTOR),
    impressions: Math.round(campaign.impressions * PREV_WEEK_FACTOR),
    clicks: Math.round(campaign.clicks * PREV_WEEK_FACTOR),
    conversions: Math.round(campaign.conversions * PREV_WEEK_FACTOR),
  };
  const prev = {
    spendCents: spread(prevTotal.spendCents, PREV_WEEK_WEIGHTS),
    impressions: spread(prevTotal.impressions, PREV_WEEK_WEIGHTS),
    clicks: spread(prevTotal.clicks, PREV_WEEK_WEIGHTS),
    conversions: spread(prevTotal.conversions, PREV_WEEK_WEIGHTS),
  };
  for (let i = 0; i < PREV_WEEK_WEIGHTS.length; i++) {
    points.push({
      date: daysAgoToDate(CURRENT_WEEK_WEIGHTS.length + PREV_WEEK_WEIGHTS.length - 1 - i),
      spendCents: prev.spendCents[i]!,
      impressions: prev.impressions[i]!,
      clicks: prev.clicks[i]!,
      conversions: prev.conversions[i]!,
    });
  }

  return points.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Aggregated demo history across all campaigns, oldest → newest. */
export function demoHistory(now: Date): DemoHistoryPoint[] {
  const byDate = new Map<string, DemoHistoryPoint>();
  for (const campaign of DEMO_CAMPAIGNS) {
    for (const point of demoCampaignHistory(campaign, now)) {
      const acc = byDate.get(point.date) ?? { date: point.date, spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
      acc.spendCents += point.spendCents;
      acc.impressions += point.impressions;
      acc.clicks += point.clicks;
      acc.conversions += point.conversions;
      byDate.set(point.date, acc);
    }
  }
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function demoWeeklyTotals(): DemoTotals {
  return DEMO_CAMPAIGNS.reduce<DemoTotals>(
    (acc, c) => ({
      spendCents: acc.spendCents + c.spendCents,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
    }),
    { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 },
  );
}

export function demoPrevWeeklyTotals(): DemoTotals {
  return DEMO_CAMPAIGNS.reduce<DemoTotals>(
    (acc, c) => ({
      spendCents: acc.spendCents + Math.round(c.spendCents * PREV_WEEK_FACTOR),
      impressions: acc.impressions + Math.round(c.impressions * PREV_WEEK_FACTOR),
      clicks: acc.clicks + Math.round(c.clicks * PREV_WEEK_FACTOR),
      conversions: acc.conversions + Math.round(c.conversions * PREV_WEEK_FACTOR),
    }),
    { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 },
  );
}

export function demoTotalsByPlatform(): Record<string, DemoTotals> {
  const byPlatform: Record<string, DemoTotals> = {};
  for (const c of DEMO_CAMPAIGNS) {
    byPlatform[c.platform] ??= { spendCents: 0, impressions: 0, clicks: 0, conversions: 0 };
    byPlatform[c.platform]!.spendCents += c.spendCents;
    byPlatform[c.platform]!.impressions += c.impressions;
    byPlatform[c.platform]!.clicks += c.clicks;
    byPlatform[c.platform]!.conversions += c.conversions;
  }
  return byPlatform;
}

/** Campaigns spending without conversions — the source of the single demo alert. */
export function demoBurningCampaigns(): DemoCampaignSeed[] {
  return DEMO_CAMPAIGNS.filter((c) => c.spendCents > 0 && c.conversions === 0);
}

/**
 * Pseudo campaigns_mirror rows (only the fields the weekly-report
 * aggregation reads) so the email-path aggregation runs unchanged.
 */
export function demoCampaignRows(now: Date): { platform: string; metrics: Record<string, unknown> }[] {
  return DEMO_CAMPAIGNS.map((c) => ({
    platform: c.platform,
    metrics: {
      history: demoCampaignHistory(c, now),
      spendCents: c.spendCents,
      conversions: c.conversions,
    },
  }));
}
