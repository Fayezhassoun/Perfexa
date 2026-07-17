// @voxmarketer/integrations — public surface (CONTRACTS.md §7).

export * from './types.js';
export * from './errors.js';

export { crawlWebsite, normalizeUrl } from './crawler.js';
export { runPageSpeed } from './pagespeed.js';
export { runSeoAudit } from './seo-audit.js';

export { getAdAdapter, createMockAdapter, createLiveAdapter, type MockAdAdapter } from './ads/index.js';

export { encrypt, decrypt } from './crypto.js';
export { withRetry } from './retry.js';

export { KNOWLEDGE_SEED_DOCS } from './knowledge-docs.js';
export { embedText, cosineSimilarity, EMBEDDING_DIM } from './embeddings.js';

export { getGa4Traffic, type Ga4TrafficPoint } from './ga4.js';
export { getGscQueries, type GscQueryRow } from './gsc.js';

export {
  hashString,
  hashHex,
  seededRandom,
  seededRange,
  pickDeterministic,
  dateDaysAgo,
  hostnameOf,
} from './util/hash.js';
