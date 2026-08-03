// Demo-data mode (pilot ops): simulated marketing numbers for design-partner
// demos, gated on organizations.settings.demoData === true, default OFF, and
// ALWAYS labeled — simulated data must never be presented as real.

import { beforeEach, describe, expect, it } from 'vitest';
import { renderWeeklyReportEmail } from '@growthcrew/integrations';
import {
  DEMO_CAMPAIGNS,
  DEMO_DATA_LABEL,
  demoCampaignHistory,
  demoPrevWeeklyTotals,
  demoWeeklyTotals,
  isDemoDataEnabled,
} from '../src/services/demo-data.js';
import { overview } from '../src/services/dashboard.js';
import { buildWeeklyReport, generateWeeklyReport } from '../src/services/reports.js';
import { db, freshOrg, truncateAll } from './helpers.js';

const NOW = new Date('2026-08-03T15:00:00Z');

describe('demo-data gating (settings.demoData)', () => {
  it('isDemoDataEnabled is true only for an explicit true', () => {
    expect(isDemoDataEnabled({ demoData: true })).toBe(true);
    expect(isDemoDataEnabled({ demoData: false })).toBe(false);
    expect(isDemoDataEnabled({ demoData: 'true' })).toBe(false);
    expect(isDemoDataEnabled({})).toBe(false);
    expect(isDemoDataEnabled(undefined)).toBe(false);
    expect(isDemoDataEnabled(null)).toBe(false);
    expect(isDemoDataEnabled([])).toBe(false);
  });

  it('carries the exact required label', () => {
    expect(DEMO_DATA_LABEL).toBe('Demo data — connect your account for live numbers.');
  });
});

describe('demo dataset determinism', () => {
  it('daily history sums to the campaign totals for the reporting week', () => {
    for (const campaign of DEMO_CAMPAIGNS) {
      const history = demoCampaignHistory(campaign, NOW);
      expect(history).toHaveLength(15); // 8 days current week + 7 days previous week
      const current = history.slice(-8);
      expect(current.reduce((a, p) => a + p.spendCents, 0)).toBe(campaign.spendCents);
      expect(current.reduce((a, p) => a + p.impressions, 0)).toBe(campaign.impressions);
      expect(current.reduce((a, p) => a + p.clicks, 0)).toBe(campaign.clicks);
      expect(current.reduce((a, p) => a + p.conversions, 0)).toBe(campaign.conversions);
    }
  });

  it('is fully deterministic for a given date', () => {
    expect(demoCampaignHistory(DEMO_CAMPAIGNS[0]!, NOW)).toEqual(demoCampaignHistory(DEMO_CAMPAIGNS[0]!, NOW));
    expect(demoWeeklyTotals()).toEqual(demoWeeklyTotals());
    expect(demoPrevWeeklyTotals()).toEqual(demoPrevWeeklyTotals());
  });
});

describe('dashboard KPIs', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('default OFF: an org with no campaigns still sees its real zeros', async () => {
    const org = await freshOrg({ now: NOW });
    const result = await overview(org.ctx);
    expect(result.demoData).toBe(false);
    expect(result.campaigns).toBe(0);
    expect(result.totals.spendCents).toBe(0);
    expect(result.totals.impressions).toBe(0);
    expect(result.series).toEqual([]);
  });

  it('ON: renders the deterministic simulated dataset, flagged as demo', async () => {
    const org = await freshOrg({ now: NOW, settings: { demoData: true } });
    const result = await overview(org.ctx);
    const totals = demoWeeklyTotals();

    expect(result.demoData).toBe(true);
    expect(result.campaigns).toBe(DEMO_CAMPAIGNS.length);
    expect(result.totals.spendCents).toBe(totals.spendCents);
    expect(result.totals.impressions).toBe(totals.impressions);
    expect(result.totals.clicks).toBe(totals.clicks);
    expect(result.totals.conversions).toBe(totals.conversions);
    expect(result.totals.spendCents).toBeGreaterThan(0);
    expect(Object.keys(result.byPlatform).sort()).toEqual(['google_ads', 'meta']);
    expect(result.series.length).toBeGreaterThan(0);

    // Deterministic: same inputs, same numbers.
    expect(await overview(org.ctx)).toEqual(result);
  });

  it('explicit demoData: false stays on the real path', async () => {
    const org = await freshOrg({ now: NOW, settings: { demoData: false } });
    const result = await overview(org.ctx);
    expect(result.demoData).toBe(false);
    expect(result.totals.spendCents).toBe(0);
  });
});

describe('in-app weekly report (/reports)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('default OFF: no demo flag and no label', async () => {
    const org = await freshOrg({ now: NOW });
    const { content } = await generateWeeklyReport(org.ctx);
    expect(content.demoData).toBeFalsy();
    expect(content.markdown).not.toContain(DEMO_DATA_LABEL);
    expect(content.totals.spendCents).toBe(0);
  });

  it('ON: simulated numbers, one alert, and the label in the payload + markdown', async () => {
    const org = await freshOrg({ now: NOW, settings: { demoData: true } });
    const { content } = await generateWeeklyReport(org.ctx);
    const totals = demoWeeklyTotals();

    expect(content.demoData).toBe(true);
    expect(content.totals.spendCents).toBe(totals.spendCents);
    expect(content.totals.conversions).toBe(totals.conversions);
    expect(content.alertCount).toBe(1);
    expect(content.source).toBe('deterministic');
    // The label leads the markdown so every rendering surface shows it.
    expect(content.markdown.startsWith(`**${DEMO_DATA_LABEL}**`)).toBe(true);
    expect(Object.keys(content.byPlatform).sort()).toEqual(['google_ads', 'meta']);
  });
});

describe('emailed weekly report (cron path)', () => {
  beforeEach(async () => {
    await truncateAll(db);
  });

  it('default OFF: content carries no demo flag', async () => {
    const org = await freshOrg({ now: NOW });
    const { content } = await buildWeeklyReport(org.ctx);
    expect(content.demoData).toBeUndefined();
    expect(content.totals.spendCents).toBe(0);
  });

  it('ON: simulated totals and a labeled email', async () => {
    const org = await freshOrg({ now: NOW, settings: { demoData: true } });
    const { content } = await buildWeeklyReport(org.ctx);
    const totals = demoWeeklyTotals();

    expect(content.demoData).toBe(true);
    expect(content.totals.spendCents).toBe(totals.spendCents);
    expect(content.totals.impressions).toBe(totals.impressions);
    expect(content.summary).toContain(`$${(totals.spendCents / 100).toFixed(2)}`);

    const html = renderWeeklyReportEmail('Demo Org', content);
    expect(html).toContain(DEMO_DATA_LABEL);
  });

  it('OFF: the email carries no demo label', async () => {
    const org = await freshOrg({ now: NOW });
    const { content } = await buildWeeklyReport(org.ctx);
    const html = renderWeeklyReportEmail('Real Org', content);
    expect(html).not.toContain(DEMO_DATA_LABEL);
  });
});
