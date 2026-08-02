import type { Organization } from '@growthcrew/db';

/** The product plans and their feature flags. Plan state is stored in org settings. */
export const PLANS = {
  starter: {
    price: 19,
    maxLiveConnections: 1,
    whiteLabel: false,
    teamSeats: false,
    maxBrands: 1,
    features: ['sandbox', 'liveConnections', 'weeklyReports', 'alerts'],
  },
  growth: {
    price: 49,
    maxLiveConnections: Infinity,
    whiteLabel: true,
    teamSeats: false,
    maxBrands: 1,
    features: ['sandbox', 'liveConnections', 'unlimitedLiveConnections', 'weeklyReports', 'alerts', 'whiteLabel'],
  },
  agency: {
    price: 99,
    maxLiveConnections: Infinity,
    whiteLabel: true,
    teamSeats: true,
    maxBrands: Infinity,
    features: [
      'sandbox',
      'liveConnections',
      'unlimitedLiveConnections',
      'weeklyReports',
      'alerts',
      'whiteLabel',
      'teamSeats',
      'multiBrand',
      'priority',
    ],
  },
} as const;

export type Plan = keyof typeof PLANS;
export type EntitlementFeature = (typeof PLANS)[Plan]['features'][number];

export interface PlanEntitlements {
  plan: Plan;
  maxLiveConnections: number;
  whiteLabel: boolean;
  teamSeats: boolean;
  maxBrands: number;
}

function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PLANS, value);
}

/** Read the organization's plan, defaulting safely for new or invalid settings. */
export function getPlan(org: Pick<Organization, 'settings'>): Plan {
  const value = org.settings?.plan;
  return isPlan(value) ? value : 'starter';
}

/** Return the normalized feature limits for the organization's current plan. */
export function getEntitlements(org: Pick<Organization, 'settings'>): PlanEntitlements {
  const plan = getPlan(org);
  const definition = PLANS[plan];
  return {
    plan,
    maxLiveConnections: definition.maxLiveConnections,
    whiteLabel: definition.whiteLabel,
    teamSeats: definition.teamSeats,
    maxBrands: definition.maxBrands,
  };
}

/** Check whether a plan includes a named product capability. */
export function canUse(org: Pick<Organization, 'settings'>, feature: EntitlementFeature): boolean {
  return (PLANS[getPlan(org)].features as readonly string[]).includes(feature);
}
