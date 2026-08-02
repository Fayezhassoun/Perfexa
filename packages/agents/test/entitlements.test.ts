import { describe, expect, it } from 'vitest';
import type { Organization } from '@growthcrew/db';
import { canUse, getEntitlements, getPlan, PLANS } from '../src/services/entitlements.js';

function orgWithPlan(plan?: string): Pick<Organization, 'settings'> {
  return { settings: plan === undefined ? {} : { plan } };
}

describe('entitlements', () => {
  it('defaults missing or invalid plan settings to starter', () => {
    expect(getPlan(orgWithPlan())).toBe('starter');
    expect(getPlan(orgWithPlan('not-a-plan'))).toBe('starter');
    expect(getPlan(orgWithPlan('constructor'))).toBe('starter');
  });

  it.each(['starter', 'growth', 'agency'] as const)('returns the %s plan entitlements', (plan) => {
    expect(getEntitlements(orgWithPlan(plan))).toEqual({
      plan,
      maxLiveConnections: PLANS[plan].maxLiveConnections,
      whiteLabel: PLANS[plan].whiteLabel,
      teamSeats: PLANS[plan].teamSeats,
      maxBrands: PLANS[plan].maxBrands,
    });
  });

  it('allows only the capabilities included by each plan', () => {
    expect(canUse(orgWithPlan('starter'), 'whiteLabel')).toBe(false);
    expect(canUse(orgWithPlan('starter'), 'teamSeats')).toBe(false);
    expect(canUse(orgWithPlan('starter'), 'weeklyReports')).toBe(true);
    expect(canUse(orgWithPlan('growth'), 'whiteLabel')).toBe(true);
    expect(canUse(orgWithPlan('growth'), 'unlimitedLiveConnections')).toBe(true);
    expect(canUse(orgWithPlan('growth'), 'multiBrand')).toBe(false);
    expect(canUse(orgWithPlan('agency'), 'teamSeats')).toBe(true);
    expect(canUse(orgWithPlan('agency'), 'multiBrand')).toBe(true);
    expect(canUse(orgWithPlan('agency'), 'priority')).toBe(true);
  });
});
