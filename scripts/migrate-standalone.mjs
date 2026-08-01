/**
 * Standalone production migrator.
 *
 * Bundled to a single CJS file (scripts/build-migrate.mjs) and copied into the
 * runtime image alongside packages/db/drizzle. Fly runs it as a release_command
 * before routing traffic, so schema migrations are ALWAYS applied on deploy —
 * this is what previously silently skipped (Business Memory table went missing).
 *
 * Self-contained: opens its own postgres connection from DATABASE_URL and runs
 * drizzle's migrator against the copied SQL folder. Idempotent (CREATE TABLE
 * IF NOT EXISTS), safe to run on every release.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exitCode = 1;
    return;
  }

  // Migrations folder is copied next to the bundle in the image (/app/drizzle).
  const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? '/app/drizzle';

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client);

  try {
    await migrate(db, { migrationsFolder });
    console.log('[migrate] schema up to date');
    process.exitCode = 0;
  } catch (err) {
    console.error('[migrate] failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
