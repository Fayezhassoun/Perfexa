// Mock social publishing adapter. Deterministic: engagement is a pure
// function of (externalId, hours since publish), so dashboards evolve
// between polls without any stored simulation state.

import { hashHex, hashString, seededRandom } from './util/hash.js';

export type SocialPlatform = 'facebook' | 'instagram' | 'x' | 'linkedin' | 'tiktok';

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'x', 'linkedin', 'tiktok'];

export interface SocialEngagement {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface PublishResult {
  externalId: string;
  publishedAt: string; // ISO
}

/** Per-platform engagement character (reach multiplier, like rate ‰ of reach). */
const PLATFORM_PROFILE: Record<SocialPlatform, { reach: [number, number]; likePerMille: [number, number] }> = {
  facebook: { reach: [300, 2200], likePerMille: [15, 45] },
  instagram: { reach: [500, 3500], likePerMille: [40, 90] },
  x: { reach: [200, 4000], likePerMille: [8, 30] },
  linkedin: { reach: [150, 1200], likePerMille: [20, 55] },
  tiktok: { reach: [800, 9000], likePerMille: [50, 120] },
};

export interface SocialAdapter {
  platform: SocialPlatform;
  mode: 'sandbox' | 'live';
  publishPost(input: { content: string; mediaUrls?: string[] }, now?: Date): Promise<PublishResult>;
  getEngagement(externalId: string, publishedAt: Date, now?: Date): Promise<SocialEngagement>;
}

/** Reach follows a saturating curve: fast first day, long tail after. */
function reachCurve(hours: number): number {
  if (hours <= 0) return 0;
  return 1 - Math.exp(-hours / 30);
}

export function createMockSocialAdapter(platform: SocialPlatform): SocialAdapter {
  const profile = PLATFORM_PROFILE[platform];
  return {
    platform,
    mode: 'sandbox',
    async publishPost(input, now = new Date()) {
      const externalId = `${platform}_${hashHex(`${platform}:${input.content}:${now.toISOString()}`)}`;
      return { externalId, publishedAt: now.toISOString() };
    },
    async getEngagement(externalId, publishedAt, now = new Date()) {
      const rand = seededRandom(hashString(externalId));
      const span = ([min, max]: [number, number]) => min + rand() * (max - min);
      const maxReach = Math.round(span(profile.reach));
      const likeRate = span(profile.likePerMille) / 1000;

      const hours = Math.max(0, (now.getTime() - publishedAt.getTime()) / 3_600_000);
      const impressions = Math.round(maxReach * reachCurve(hours));
      const likes = Math.round(impressions * likeRate);
      const comments = Math.round(likes * (0.08 + rand() * 0.12));
      const shares = Math.round(likes * (0.05 + rand() * 0.1));
      return { impressions, likes, comments, shares };
    },
  };
}
