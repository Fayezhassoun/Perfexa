import { describe, expect, it } from 'vitest';
import {
  APPROVE_RE,
  REJECT_RE,
  detectBudgetAmountCents,
  detectBudgetConfirmation,
  detectGeography,
  detectIntents,
  detectPausePlatform,
} from '../src/intents.js';

describe('detectIntents', () => {
  it('detects the §12 reference message as [seo, visibility, leads]', () => {
    const intents = detectIntents(
      'I need an SEO specialist. I need my website to be top visible. I need to get leads.',
    );
    expect(intents).toEqual(['seo', 'visibility', 'leads']);
  });

  it('detects platform ad intents', () => {
    expect(detectIntents('run google ads for me')).toContain('ads_google');
    expect(detectIntents('I want Facebook ads')).toContain('ads_meta');
    expect(detectIntents('what about TikTok?')).toContain('ads_tiktok');
  });

  it('detects analytics questions', () => {
    expect(detectIntents('how did we do this week?')).toContain('analytics');
  });

  it('returns empty for unrelated chatter', () => {
    expect(detectIntents('what is the weather like')).toEqual([]);
  });
});

describe('detectGeography', () => {
  it('parses "<City> area"', () => {
    expect(detectGeography('Chicago area, yes $500 is fine.')).toBe('Chicago');
  });
  it('parses "in <City>"', () => {
    expect(detectGeography('we operate in Austin')).toBe('Austin');
  });
  it('returns undefined when absent', () => {
    expect(detectGeography('yes that works')).toBeUndefined();
  });
});

describe('detectBudgetAmountCents', () => {
  it('parses $500 → 50000', () => {
    expect(detectBudgetAmountCents('is $500 ok?')).toBe(50_000);
  });
  it('parses "2k" → 200000', () => {
    expect(detectBudgetAmountCents('around 2k a month')).toBe(200_000);
  });
  it('parses "500 dollars"', () => {
    expect(detectBudgetAmountCents('500 dollars')).toBe(50_000);
  });
});

describe('approval / rejection matchers', () => {
  it.each(['approve', 'Approved', '  yes approve ', 'go ahead!', 'launch it'])('approves %j', (msg) => {
    expect(APPROVE_RE.test(msg)).toBe(true);
  });
  it.each(['cancel', 'reject', 'no thanks'])('rejects %j', (msg) => {
    expect(REJECT_RE.test(msg)).toBe(true);
  });
  it('does not approve on partial sentences', () => {
    expect(APPROVE_RE.test('should I approve this?')).toBe(false);
  });
});

describe('detectPausePlatform', () => {
  it('pause tiktok → tiktok', () => {
    expect(detectPausePlatform('pause TikTok')).toBe('tiktok');
  });
  it('pause the google campaign → google_ads', () => {
    expect(detectPausePlatform('pause the Google campaign')).toBe('google_ads');
  });
  it('no pause keyword → undefined', () => {
    expect(detectPausePlatform('stop by the office')).toBeUndefined();
  });
});

describe('detectBudgetConfirmation', () => {
  it('yes / fine / sounds good confirm', () => {
    expect(detectBudgetConfirmation('yes $500 is fine')).toBe(true);
    expect(detectBudgetConfirmation('sounds good')).toBe(true);
  });
});
