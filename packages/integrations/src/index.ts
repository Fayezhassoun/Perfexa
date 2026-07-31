// @growthcrew/integrations — public surface (CONTRACTS.md §7).

export * from './types.js';
export * from './errors.js';

export { crawlWebsite, normalizeUrl } from './crawler.js';
export { runPageSpeed } from './pagespeed.js';
export { runSeoAudit } from './seo-audit.js';

export { getAdAdapter, createMockAdapter, createLiveAdapter, type MockAdAdapter } from './ads/index.js';
export { createGoogleAdsLiveAdapter } from './ads/live-google.js';
export { createMetaLiveAdapter } from './ads/live-meta.js';
export { createTikTokLiveAdapter } from './ads/live-tiktok.js';
export { checkAdCopyPolicy } from './ads/policy.js';

export {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchExternalAccountId,
  signOAuthState,
  verifyOAuthState,
  oauthProviderFor,
  scopesFor,
  isConnectablePlatform,
  CONNECTABLE_PLATFORMS,
  META_SCOPES,
  type OAuthProvider,
  type ConnectablePlatform,
  type OAuthStatePayload,
  type ExchangedTokens,
} from './oauth.js';
export { liveFetchJson, platformLabel } from './live-http.js';
export { sendEmail, renderWeeklyReportEmail, type SendEmailInput, type SendEmailResult, type WeeklyReportContent } from './email.js';

export { encrypt, decrypt } from './crypto.js';
export { withRetry } from './retry.js';

export { KNOWLEDGE_SEED_DOCS } from './knowledge-docs.js';
export { embedText, cosineSimilarity, EMBEDDING_DIM } from './embeddings.js';

export {
  createMockSocialAdapter,
  SOCIAL_PLATFORMS,
  type SocialAdapter,
  type SocialEngagement,
  type SocialPlatform,
} from './social.js';
export { fetchMockReviews, type ExternalReview } from './reviews.js';
export { analyzeSentiment, sentimentForReview, type Sentiment } from './sentiment.js';

export { getGa4Traffic, createGa4LiveAdapter, type Ga4TrafficPoint, type Ga4Adapter } from './ga4.js';
export { getGscQueries, createGscLiveAdapter, type GscQueryRow, type GscAdapter } from './gsc.js';

export {
  getVideoAdapter,
  createMockVideoAdapter,
  createFalVideoAdapter,
  type VideoAdapter,
  type GenerateVideoInput,
  type VideoJobResult,
} from './video.js';

export {
  getAdIntelAdapter,
  createMockAdIntelAdapter,
  createTransparencyAdIntelAdapter,
  REGIONS,
  type AdIntelAdapter,
  type AdCreative,
  type ScanRegionInput,
  type ScanRegionResult,
} from './ad-intel.js';

export {
  hashString,
  hashHex,
  seededRandom,
  seededRange,
  pickDeterministic,
  dateDaysAgo,
  hostnameOf,
} from './util/hash.js';
