import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb, closeDb } from './index';
import { loadRootEnv } from './env';

/**
 * Programmatic migrator — importable from apps/web (compose `migrate` service,
 * server startup, tests) and runnable as a CLI via `pnpm db:migrate`.
 */
export async function runMigrations(): Promise<void> {
  loadRootEnv();
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
  await migrate(getDb(), { migrationsFolder });
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runMigrations()
    .then(async () => {
      console.log('[db] migrations applied');
      await closeDb();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('[db] migration failed:', err);
      await closeDb();
      process.exit(1);
    });
}
