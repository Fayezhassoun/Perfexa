import { sql } from 'drizzle-orm';
import { getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import * as schema from './schema/index';
import type { Db } from './index';

/** All table names declared in the drizzle schema (in declaration order). */
export function listTableNames(): string[] {
  const names: string[] = [];
  for (const value of Object.values(schema)) {
    if (is(value, PgTable)) {
      names.push(getTableName(value));
    }
  }
  return names;
}

/** Truncate every table (CASCADE + restart identity). Test-only helper. */
export async function truncateAll(db: Db): Promise<void> {
  const tables = listTableNames()
    .map((t) => `"${t}"`)
    .join(', ');
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`));
}

function assertSafeSchemaName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error(`unsafe schema name: ${name}`);
  }
}

/**
 * Create a throwaway postgres schema for an isolated test.
 * Caller is expected to run migrations with `search_path` set to this schema
 * (e.g. a dedicated connection with `{ connection: { search_path: name } }`).
 */
export async function createTestSchema(db: Db, name: string): Promise<void> {
  assertSafeSchemaName(name);
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${name}" CASCADE`));
  await db.execute(sql.raw(`CREATE SCHEMA "${name}"`));
}

/** Drop a throwaway schema created by createTestSchema. */
export async function dropTestSchema(db: Db, name: string): Promise<void> {
  assertSafeSchemaName(name);
  await db.execute(sql.raw(`DROP SCHEMA IF EXISTS "${name}" CASCADE`));
}
