#!/usr/bin/env node
/**
 * dev-services.mjs — embedded Postgres + Redis for dockerless local dev.
 *
 *   node scripts/dev-services.mjs
 *
 * - Postgres: data dir .devdata/pg (persistent), port 5433, postgres/postgres, db voxmarketer
 * - Redis:    port 6380 (in-memory server)
 * Idempotent: an existing .devdata/pg cluster is reused as-is.
 * If binaries can't be prepared, prints a docker fallback message and exits 1.
 * Stays in the foreground; SIGINT/SIGTERM stops both services cleanly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PG_DIR = path.join(ROOT, '.devdata', 'pg');
const PG_PORT = 5433;
const PG_USER = 'postgres';
const PG_PASSWORD = 'postgres';
const PG_DB = 'voxmarketer';
const REDIS_PORT = 6380;

const DATABASE_URL = `postgres://${PG_USER}:${PG_PASSWORD}@localhost:${PG_PORT}/${PG_DB}`;
const REDIS_URL = `redis://localhost:${REDIS_PORT}`;

function dockerFallback(err) {
  console.error('\n[dev-services] failed to start embedded services:', err?.message ?? err);
  console.error(
    '[dev-services] docker is the fallback: install Docker Desktop and run `docker compose up db redis`,\n' +
      'then point .env at postgres://postgres:postgres@localhost:5432/voxmarketer and redis://localhost:6379.',
  );
  process.exit(1);
}

let pg;
let redis;

async function startPostgres() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  fs.mkdirSync(PG_DIR, { recursive: true });

  pg = new EmbeddedPostgres({
    databaseDir: PG_DIR,
    user: PG_USER,
    password: PG_PASSWORD,
    port: PG_PORT,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });

  const alreadyInitialized = fs.existsSync(path.join(PG_DIR, 'PG_VERSION'));
  if (!alreadyInitialized) {
    console.log('[dev-services] initializing postgres cluster in .devdata/pg (first boot)...');
    await pg.initialise();
  }
  await pg.start();

  if (!alreadyInitialized) {
    await pg.createDatabase(PG_DB);
  } else {
    try {
      await pg.createDatabase(PG_DB);
    } catch (err) {
      // 42P04 = duplicate_database — expected on restart
      if (err?.code !== '42P04' && !/already exists/i.test(String(err?.message))) throw err;
    }
  }
  console.log(`[dev-services] postgres ready  →  DATABASE_URL=${DATABASE_URL}`);
}

async function startRedis() {
  const { RedisMemoryServer } = await import('redis-memory-server');
  redis = new RedisMemoryServer({
    instance: { port: REDIS_PORT, ip: '127.0.0.1' },
  });
  await redis.start();
  console.log(`[dev-services] redis ready     →  REDIS_URL=${REDIS_URL}`);
}

async function shutdown(signal) {
  console.log(`\n[dev-services] ${signal} received — shutting down...`);
  try {
    if (redis) await redis.stop();
  } catch {}
  try {
    if (pg) await pg.stop();
  } catch {}
  console.log('[dev-services] stopped cleanly');
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await startPostgres();
  await startRedis();
} catch (err) {
  dockerFallback(err);
}

console.log('[dev-services] both services up — keep this process running (Ctrl+C to stop)');

// keep the event loop alive in the foreground
await new Promise(() => {});
