// One-off toggle for demo-data mode (settings.demoData) on the demo sandbox
// org ONLY — design-partner demos show labeled simulated numbers instead of
// all zeros. Run: node scripts/enable-demo-data.mjs [--off]
// Requires DATABASE_URL pointing at prod (via `fly proxy`).
//
// Note: resolves `postgres` through packages/db (declared dependency) because
// root scripts don't have it on their own resolution path.
import { createRequire } from 'node:module';

const ORG = '7620b2f8-9031-4394-a84e-bb7e8d59f0a6'; // demo sandbox org — never flip any other org
const enable = !process.argv.includes('--off');

const url = process.env.DATABASE_URL;
if (!url) { console.error('set DATABASE_URL'); process.exit(1); }

const requireFromDb = createRequire(new URL('../packages/db/package.json', import.meta.url));
const postgres = requireFromDb('postgres');
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const rows = await sql`
    update organizations
    set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('demoData', ${enable})
    where id = ${ORG}
    returning id, name, settings -> 'demoData' as demo_data`;
  if (rows.length === 0) {
    console.error(`[demo-data] org ${ORG} not found — nothing changed`);
    process.exitCode = 1;
  } else {
    console.log(`[demo-data] ${enable ? 'ENABLED' : 'DISABLED'} for "${rows[0].name}" (settings.demoData = ${rows[0].demo_data})`);
  }
} catch (err) {
  console.error('[demo-data] failed:', err);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
