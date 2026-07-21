// Stateful mock ad-platform adapter (CONTRACTS §7). Metrics are a deterministic
// function of (externalId, now): cumulative since the last state-changing event,
// folded into `accum` on every mutation — so polls never drift and restarts are safe.

import { createHash } from 'node:crypto';
import type {
  AdAdapter,
  AdCampaign,
  AdCampaignInput,
  AdPlatform,
  AdapterDeps,
  CampaignMetrics,
} from '../types.js';
import { hashString, seededRandom } from '../util/hash.js';
import { checkAdCopyPolicy } from './policy.js';

interface SimParams {
  dailyImpressions: number;
  ctrBps: number; // click-through rate, basis points
  cpcCentsAvg: number;
  cvrBps: number; // conversion rate on clicks, basis points
}

interface StoredCampaign extends AdCampaign {
  createdAt: string; // baseline for the current accumulation window (ISO)
  accum: CampaignMetrics; // metrics baked in before baseline
  sim: SimParams;
}

interface MockState {
  campaigns: StoredCampaign[];
}

/** Adapter with the extra write ops the tool layer needs beyond the base interface. */
export interface MockAdAdapter extends AdAdapter {
  removeCampaign(externalId: string): Promise<void>;
}

const PLATFORM_RANGES: Record<AdPlatform, { ctr: [number, number]; cpc: [number, number]; cvr: [number, number] }> = {
  google_ads: { ctr: [300, 800], cpc: [150, 600], cvr: [200, 600] },
  meta: { ctr: [100, 250], cpc: [30, 150], cvr: [150, 450] },
  tiktok: { ctr: [80, 220], cpc: [20, 120], cvr: [120, 400] },
};

function deriveSim(platform: AdPlatform, externalId: string, budgetDailyCents: number): SimParams {
  const ranges = PLATFORM_RANGES[platform];
  const rand = seededRandom(hashString(externalId));
  const span = ([min, max]: [number, number]) => Math.round(min + rand() * (max - min));
  const cpcCentsAvg = span(ranges.cpc);
  const ctrBps = span(ranges.ctr);
  const cvrBps = span(ranges.cvr);
  // Impressions such that expected daily spend ≈ budget.
  const dailyImpressions = Math.max(50, Math.round(budgetDailyCents / cpcCentsAvg / (ctrBps / 10_000)));
  return { dailyImpressions, ctrBps, cpcCentsAvg, cvrBps };
}

/** Whole-day jitter factor in 0.97–1.05, deterministic per campaign+day. */
function dayJitter(externalId: string, dayIndex: number): number {
  return 0.97 + seededRandom(hashString(`${externalId}:${dayIndex}`))() * 0.08;
}

const ZERO: CampaignMetrics = { impressions: 0, clicks: 0, spendCents: 0, conversions: 0 };

function simulateWindow(c: StoredCampaign, fromMs: number, toMs: number): CampaignMetrics {
  if (c.status !== 'active') return { ...ZERO };
  const elapsedDays = Math.max(0, (toMs - fromMs) / 86_400_000);
  if (elapsedDays === 0) return { ...ZERO };
  let impressions = 0;
  const wholeDays = Math.floor(elapsedDays);
  const startDay = Math.floor(fromMs / 86_400_000);
  for (let d = 0; d < wholeDays; d++) {
    impressions += c.sim.dailyImpressions * dayJitter(c.externalId, startDay + d);
  }
  const frac = elapsedDays - wholeDays;
  if (frac > 0) {
    impressions += c.sim.dailyImpressions * frac * dayJitter(c.externalId, startDay + wholeDays);
  }
  impressions = Math.floor(impressions);
  const clicks = Math.floor(impressions * (c.sim.ctrBps / 10_000));
  const spendCents = Math.round(clicks * c.sim.cpcCentsAvg);
  const conversions = Math.floor(clicks * (c.sim.cvrBps / 10_000));
  return { impressions, clicks, spendCents, conversions };
}

function metricsAt(c: StoredCampaign, nowMs: number): CampaignMetrics {
  const window = simulateWindow(c, Date.parse(c.createdAt), nowMs);
  return {
    impressions: c.accum.impressions + window.impressions,
    clicks: c.accum.clicks + window.clicks,
    spendCents: c.accum.spendCents + window.spendCents,
    conversions: c.accum.conversions + window.conversions,
  };
}

/** Fold simulated metrics into accum and reset the baseline (used before any mutation). */
function fold(c: StoredCampaign, now: Date): void {
  c.accum = metricsAt(c, now.getTime());
  c.createdAt = now.toISOString();
}

function publicView(c: StoredCampaign, now: Date): AdCampaign {
  return {
    externalId: c.externalId,
    platform: c.platform,
    name: c.name,
    status: c.status,
    budgetDailyCents: c.budgetDailyCents,
    metrics: metricsAt(c, now.getTime()),
  };
}

export function createMockAdapter(platform: AdPlatform, deps: AdapterDeps): MockAdAdapter {
  const orgId = deps.orgId ?? 'default';

  async function loadState(): Promise<MockState> {
    const raw = await deps.store.load(orgId, platform);
    if (raw && typeof raw === 'object' && Array.isArray((raw as MockState).campaigns)) {
      return raw as MockState;
    }
    return { campaigns: [] };
  }

  function saveState(state: MockState): Promise<void> {
    return deps.store.save(orgId, platform, state);
  }

  function find(state: MockState, externalId: string): StoredCampaign {
    const c = state.campaigns.find((x) => x.externalId === externalId);
    if (!c) throw new Error(`${platform}: campaign ${externalId} not found`);
    return c;
  }

  return {
    platform,
    mode: 'sandbox',

    async listCampaigns() {
      const state = await loadState();
      const now = new Date();
      return state.campaigns.filter((c) => c.status !== 'removed').map((c) => publicView(c, now));
    },

    async createCampaign(input: AdCampaignInput): Promise<AdCampaign> {
      const state = await loadState();
      const now = new Date();
      const externalId = `${platform}_${createHash('sha256')
        .update(`${platform}:${orgId}:${input.name}:${now.toISOString()}`)
        .digest('hex')
        .slice(0, 10)}`;
      const campaign: StoredCampaign = {
        externalId,
        platform,
        name: input.name,
        status: 'active',
        budgetDailyCents: input.dailyBudgetCents,
        metrics: { ...ZERO },
        createdAt: now.toISOString(),
        accum: { ...ZERO },
        sim: deriveSim(platform, externalId, input.dailyBudgetCents),
      };
      state.campaigns.push(campaign);
      await saveState(state);
      return publicView(campaign, now);
    },

    async pauseCampaign(externalId: string) {
      const state = await loadState();
      const c = find(state, externalId);
      fold(c, new Date());
      c.status = 'paused';
      await saveState(state);
    },

    async resumeCampaign(externalId: string) {
      const state = await loadState();
      const c = find(state, externalId);
      fold(c, new Date());
      c.status = 'active';
      await saveState(state);
    },

    async removeCampaign(externalId: string) {
      const state = await loadState();
      const c = find(state, externalId);
      fold(c, new Date());
      c.status = 'removed';
      await saveState(state);
    },

    async updateBudget(externalId: string, dailyBudgetCents: number) {
      const state = await loadState();
      const c = find(state, externalId);
      fold(c, new Date());
      c.budgetDailyCents = dailyBudgetCents;
      c.sim = deriveSim(platform, c.externalId, dailyBudgetCents);
      await saveState(state);
    },

    async getMetrics(externalId: string) {
      const state = await loadState();
      const c = find(state, externalId);
      const metrics = metricsAt(c, new Date().getTime());
      c.metrics = metrics;
      await saveState(state);
      return metrics;
    },

    async getKeywordIdeas(seed: string, geography?: string) {
      const base = seed.toLowerCase().trim();
      const modifiers = ['', ' near me', ' services', ' company', ' cost', ' best', ' affordable', ' professional', ' local', ' reviews'];
      return modifiers.slice(0, 10).map((mod, i) => {
        const keyword = `${base}${mod}${geography && i % 3 === 0 ? ` ${geography.toLowerCase()}` : ''}`.trim();
        const h = hashString(keyword);
        return {
          keyword,
          avgMonthlySearches: 100 + (h % 219) * 100,
          cpcCents: 40 + (h % 95) * 8,
        };
      });
    },

    async checkAdPolicy(adCopy: { headline: string; body: string }) {
      return checkAdCopyPolicy(adCopy);
    },
  };
}
