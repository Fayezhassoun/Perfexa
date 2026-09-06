import { describe, expect, it } from 'vitest';
import { planText, snapshotTakeaway, weekToDate } from '../lib/weekly-brief';

describe('weekly briefing presentation', () => {
  it('starts the current reporting week on Monday, including on Sundays', () => {
    expect(weekToDate(new Date(2026, 8, 5))).toEqual({ from: '2026-08-31', to: '2026-09-05' });
    expect(weekToDate(new Date(2026, 8, 6))).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(weekToDate(new Date(2026, 8, 7))).toEqual({ from: '2026-09-07', to: '2026-09-07' });
  });
  it('handles year boundaries without shifting the local calendar day', () => {
    expect(weekToDate(new Date(2027, 0, 1, 23, 30))).toEqual({ from: '2026-12-28', to: '2027-01-01' });
  });
  it('does not invent a success signal for an empty or zero-conversion account', () => {
    expect(snapshotTakeaway({}).title).toContain('first connection');
    expect(snapshotTakeaway({ meta: { spendCents: 0, conversions: 0 } }).body).toContain('no recorded conversions');
  });
  it('ranks zero-conversion spend by actual spend, without claiming returns or efficiency', () => {
    const summary = snapshotTakeaway({ google_ads: { spendCents: 124000, conversions: 42 }, meta: { spendCents: 32000, conversions: 0 }, tiktok: { spendCents: 8000, conversions: 0 } });
    expect(summary.title).toBe('Google Ads is finding conversions. Meta needs a review.');
    expect(summary.body).toContain('$320');
    expect(summary.body).not.toMatch(/this week|return|profit|efficient/i);
  });
  it('keeps snapshot scope explicit when one channel has recorded conversions', () => {
    expect(snapshotTakeaway({ google_ads: { spendCents: 10000, conversions: 5 } }).body).toContain('latest account snapshot');
  });
  it('handles malformed historical proposal payloads without manufacturing a title', () => {
    for (const value of [null, [], 'Plan', { title: 12 }, { title: '  ' }]) expect(planText(value, 'title')).toBeNull();
    expect(planText({ title: 'Review budget shift' }, 'title')).toBe('Review budget shift');
  });
});
