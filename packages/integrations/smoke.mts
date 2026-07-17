import { runSeoAudit, encrypt, decrypt, getAdAdapter, embedText, cosineSimilarity, KNOWLEDGE_SEED_DOCS } from './src/index.js';
import type { AdapterStore } from './src/types.js';

const audit = await runSeoAudit('https://example.com');
console.log('audit.score=', audit.score, '| mobile=', audit.pagespeed.performanceScore, '| missingMeta=', audit.crawl.missingMetaDescriptions, '| hasLeadForm=', audit.crawl.hasLeadForm, '| keywords=', audit.keywordSuggestions.length, '| isMock=', audit.isMock);

const ct = encrypt('secret-token-123');
console.log('crypto roundtrip=', decrypt(ct) === 'secret-token-123');

const mem = new Map<string, unknown>();
const store: AdapterStore = { load: async (o, p) => mem.get(o + ':' + p), save: async (o, p, s) => void mem.set(o + ':' + p, s) };
const adapter = getAdAdapter('google_ads', 'sandbox', { store, orgId: 'org1' });
const c = await adapter.createCampaign({ name: 'Test', objective: 'leads', dailyBudgetCents: 1000, targeting: { geography: 'Chicago' } });
const m1 = await adapter.getMetrics(c.externalId);
await new Promise((r) => setTimeout(r, 1100));
const m2 = await adapter.getMetrics(c.externalId);
console.log('metrics monotone=', m2.impressions >= m1.impressions && m2.spendCents >= m1.spendCents, '| externalId=', c.externalId.slice(0, 18));
const pol = await adapter.checkAdPolicy!({ headline: 'GUARANTEED RESULTS!!!', body: 'click here' });
console.log('policy violations=', pol.violations.length > 0, pol.violations.length);

const sim = cosineSimilarity(embedText('google ads quality score'), embedText('improve quality score google ads'));
console.log('cosine=', sim.toFixed(3), '>0.3:', sim > 0.3);
console.log('knowledge docs=', KNOWLEDGE_SEED_DOCS.length);
