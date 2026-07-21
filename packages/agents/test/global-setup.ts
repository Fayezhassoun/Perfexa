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

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxmarketer-test-pg-'));
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
  await pg.createDatabase('voxmarketer_test');

  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/voxmarketer_test`;

  const { runMigrations } = await import('../../db/src/migrate');
  const { closeDb } = await import('../../db/src/index');
  await runMigrations();
  await closeDb();

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
