// Playwright global setup: throwaway embedded Postgres + migrations.
// The web server (playwright.config webServer) points at this database.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 5601;
const DB = 'sayso_e2e';

export default async function globalSetup(): Promise<() => Promise<void>> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sayso-e2e-pg-'));
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
  await pg.createDatabase(DB);

  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/${DB}`;
  const { runMigrations } = await import('../packages/db/src/migrate');
  const { closeDb } = await import('../packages/db/src/index');
  await runMigrations();
  await closeDb();

  return async () => {
    await pg.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
}
