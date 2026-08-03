// Seed realistic demo data for the GrowthCrew demo org so every engine
// (dashboard, campaigns, creative fatigue, anomaly alerts) shows a populated,
// believable state. Run: node scripts/seed-demo-data.mjs
// Requires DATABASE_URL pointing at prod (via `fly proxy`).
//
// ⚠️  DEPRECATED — honesty-rail guard (2026-08-03):
// This script writes UNLABELED simulated rows into real tables, which breaks
// the "no fake metrics without labels" rule. The sanctioned demo path is now
// `scripts/enable-demo-data.mjs` (settings-gated, labeled on every surface).
// This script refuses to run unless you explicitly accept the risk:
//   ENABLE_UNLABELED_SEED=1 node scripts/seed-demo-data.mjs
if (process.env.ENABLE_UNLABELED_SEED !== '1') {
  console.error(
    '[seed-demo-data] BLOCKED: this script seeds unlabeled fake data into real tables.\n' +
    'Use the labeled demo mode instead:  node scripts/enable-demo-data.mjs\n' +
    '(Override only with explicit intent: ENABLE_UNLABELED_SEED=1)'
  );
  process.exit(1);
}

// Resolve `postgres` through packages/db (root scripts have no direct resolution path).
import { createRequire } from 'node:module';
const requireFromDb = createRequire(new URL('../packages/db/package.json', import.meta.url));
const postgres = requireFromDb('postgres');

const ORG = '7620b2f8-9031-4394-a84e-bb7e8d59f0a6';
const url = process.env.DATABASE_URL;
if (!url) { console.error('set DATABASE_URL'); process.exit(1); }

const sql = postgres(url, { max: 1, onnotice: () => {} });

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
const hoursAgo = (h) => new Date(now - h * 3600000).toISOString();

try {
  // 0. Give the org a real website + brand so audits/conversation are grounded,
  //    and a monthly cap consistent with the campaign spends below.
  await sql`update organizations set website_url = 'https://austinplumbingco.com', monthly_budget_ceiling_cents = 800000 where id = ${ORG}`;
  await sql`update budgets set cap_cents = 800000 where org_id = ${ORG} and scope = 'global'`;

  // Clean previous seed runs (idempotent re-seed).
  await sql`delete from creative_performance where org_id = ${ORG}`;
  await sql`delete from campaigns_mirror where org_id = ${ORG}`;

  // 1. Campaigns (campaigns_mirror). metrics.spendCents = TODAY's spend so the
  //    anomaly detector's velocity math is credible. A healthy mix + problem children.
  const campaigns = [
    { name: 'Google Search — Emergency Plumber (Austin)', platform: 'google_ads', status: 'active', daily: 150000,
      metrics: { impressions: 4200, clicks: 168, spendCents: 182000, conversions: 214 } }, // healthy hero
    { name: 'Meta Retargeting — Water Heater Promo', platform: 'meta', status: 'active', daily: 120000,
      metrics: { impressions: 9600, clicks: 81, spendCents: 64000, conversions: 38 } },
    { name: 'Google Search — Drain Cleaning', platform: 'google_ads', status: 'active', daily: 150000,
      metrics: { impressions: 3100, clicks: 95, spendCents: 158000, conversions: 0 } }, // zero-conversion critical
    { name: 'Meta Prospecting — New Homeowners', platform: 'meta', status: 'active', daily: 90000,
      metrics: { impressions: 12000, clicks: 41, spendCents: 52000, conversions: 12 } }, // low CTR
    { name: 'TikTok — Brand Awareness Test', platform: 'tiktok', status: 'paused', daily: 60000,
      metrics: { impressions: 21000, clicks: 64, spendCents: 21000, conversions: 4 } },
  ];
  const campIds = {};
  for (const c of campaigns) {
    const [row] = await sql`insert into campaigns_mirror
      (org_id, platform, external_id, name, status, budget_daily_cents, metrics, mode)
      values (${ORG}, ${c.platform}, ${'ext_' + Math.random().toString(36).slice(2, 10)}, ${c.name}, ${c.status}, ${c.daily}, ${JSON.stringify(c.metrics)}, 'sandbox')
      returning id`;
    campIds[c.name] = row.id;
  }
  console.log(`[seed] ${campaigns.length} campaigns`);

  // 2. Creative performance snapshots — history so fatigue detector has a
  //    baseline to compare against. Three fatigued creatives, two healthy.
  const day = 86400000;
  const snap = (creativeId, campaignId, platform, headline, daysBack, p) =>
    sql`insert into creative_performance
      (org_id, campaign_id, creative_id, platform, headline, impressions, clicks, spend_cents, conversions, frequency, ctr, snapshot_at)
      values (${ORG}, ${campaignId}, ${creativeId}, ${platform}, ${headline},
        ${p.impressions}, ${p.clicks}, ${p.spendCents}, ${p.conversions}, ${p.frequency}, ${p.ctr},
        ${new Date(now - daysBack * day).toISOString()})`;

  // Creative A — frequency saturation (critical): freq climbs to 5.4x
  const A = 'cr_emergency_v1', Ac = campIds['Google Search — Emergency Plumber (Austin)'];
  await snap(A, Ac, 'google_ads', '24/7 Emergency Plumber in Austin', 6, { impressions: 8000, clicks: 420, spendCents: 31000, conversions: 48, frequency: 2.1, ctr: 0.052 });
  await snap(A, Ac, 'google_ads', '24/7 Emergency Plumber in Austin', 3, { impressions: 14000, clicks: 610, spendCents: 52000, conversions: 61, frequency: 3.6, ctr: 0.044 });
  await snap(A, Ac, 'google_ads', '24/7 Emergency Plumber in Austin', 0, { impressions: 19000, clicks: 690, spendCents: 71000, conversions: 58, frequency: 5.4, ctr: 0.036 });

  // Creative B — CTR collapse (critical): 4.8% -> 2.1% (>40% drop)
  const B = 'cr_waterheater_v2', Bc = campIds['Meta Retargeting — Water Heater Promo'];
  await snap(B, Bc, 'meta', 'Tankless Water Heater — $200 Off Install', 6, { impressions: 22000, clicks: 1056, spendCents: 18000, conversions: 19, frequency: 2.4, ctr: 0.048 });
  await snap(B, Bc, 'meta', 'Tankless Water Heater — $200 Off Install', 3, { impressions: 31000, clicks: 1085, spendCents: 24000, conversions: 12, frequency: 3.8, ctr: 0.035 });
  await snap(B, Bc, 'meta', 'Tankless Water Heater — $200 Off Install', 0, { impressions: 43000, clicks: 903, spendCents: 22000, conversions: 7, frequency: 5.1, ctr: 0.021 });

  // Creative C — zero conversions despite spend (critical)
  const C = 'cr_drain_v1', Cc = campIds['Google Search — Drain Cleaning'];
  await snap(C, Cc, 'google_ads', 'Fast Drain Cleaning — Book Online', 4, { impressions: 9000, clicks: 120, spendCents: 41000, conversions: 3, frequency: 2.0, ctr: 0.013 });
  await snap(C, Cc, 'google_ads', 'Fast Drain Cleaning — Book Online', 0, { impressions: 16000, clicks: 95, spendCents: 88000, conversions: 0, frequency: 3.2, ctr: 0.006 });

  // Creative D — healthy (warning only, mild frequency)
  const D = 'cr_homeowner_v1', Dc = campIds['Meta Prospecting — New Homeowners'];
  await snap(D, Dc, 'meta', 'New Homeowner? Get a Free Plumbing Checkup', 5, { impressions: 40000, clicks: 520, spendCents: 21000, conversions: 14, frequency: 1.6, ctr: 0.013 });
  await snap(D, Dc, 'meta', 'New Homeowner? Get a Free Plumbing Checkup', 0, { impressions: 80000, clicks: 890, spendCents: 31000, conversions: 12, frequency: 3.1, ctr: 0.011 });

  // Creative E — healthy, no signal
  const E = 'cr_brand_v1', Ec = campIds['TikTok — Brand Awareness Test'];
  await snap(E, Ec, 'tiktok', 'Austin Plumbers Who Actually Show Up', 2, { impressions: 210000, clicks: 640, spendCents: 21000, conversions: 4, frequency: 1.2, ctr: 0.003 });

  console.log('[seed] creative snapshots (A/B/C fatigued, D warning, E healthy)');

  // 3. Clear stale alerts so the detectors produce a fresh, accurate set.
  await sql`delete from alerts where org_id = ${ORG}`;
  console.log('[seed] cleared old alerts');

  const counts = await sql`select
    (select count(*) from campaigns_mirror where org_id = ${ORG}) as campaigns,
    (select count(*) from creative_performance where org_id = ${ORG}) as snapshots`;
  console.log('[seed] totals:', JSON.stringify(counts[0]));
} catch (err) {
  console.error('[seed] failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
