// Vitest global setup: throwaway embedded Postgres + migrations.
// Env set here is inherited by the worker processes that run the tests.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 5599;

export default async function setup(): Promise<() => Promise<void>> {
  process.env.LLM_PROVIDER = 'mock';
  process.env.SEO_AUDIT_MODE = 'mock';
  process.env.STT_PROVIDER = 'mock';
  process.env.TTS_PROVIDER = 'mock';
  process.env.ENCRYPTION_KEY ??=
    '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';

  // CI uses its dedicated service database to avoid host-library requirements
  // of downloaded embedded binaries. Never point destructive tests at live data.
  const testDatabaseUrl = process.env.PERFEXA_TEST_DATABASE_URL;
  if (testDatabaseUrl) {
    const target = new URL(testDatabaseUrl);
    if (!process.env.CI || !['localhost', '127.0.0.1'].includes(target.hostname) || target.pathname !== '/perfexa_test') {
      throw new Error('External test database must be the local CI perfexa_test database');
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    const { runMigrations } = await import('../../db/src/migrate');
    const { closeDb } = await import('../../db/src/index');
    await runMigrations();
    await closeDb();
    return async () => {};
  }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'growthcrew-test-pg-'));
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('growthcrew_test');

  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/growthcrew_test`;

  const { runMigrations } = await import('../../db/src/migrate');
  const { closeDb } = await import('../../db/src/index');
  await runMigrations();
  await closeDb();

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}

