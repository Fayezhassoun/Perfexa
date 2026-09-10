import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { users, organizations, orgMembers } from '@growthcrew/db';
import { registerUser } from '../../../apps/web/server/auth-service';
import { db, truncateAll } from './helpers';

beforeEach(async () => { await truncateAll(db); });

describe('atomic workspace registration', () => {
  it('creates the user, chosen plan, and owner membership together without exposing the password hash', async () => {
    const result = await registerUser({ name: 'Test Owner', email: 'OWNER@example.test', password: 'local-test-password', plan: 'agency' });
    expect(result.email).toBe('owner@example.test');
    expect(result).not.toHaveProperty('passwordHash');
    const [org] = await db.select().from(organizations);
    expect(org?.settings?.plan).toBe('agency');
    const [member] = await db.select().from(orgMembers);
    expect(member).toMatchObject({ userId: result.id, orgId: org?.id, role: 'owner' });
  });
  it('rolls back both user and workspace if owner membership creation fails, permitting a clean retry', async () => {
    await db.execute(sql`ALTER TABLE org_members ADD CONSTRAINT test_reject_owner CHECK (role <> 'owner')`);
    const input = { name: 'Test Owner', email: 'retry@example.test', password: 'local-test-password' };
    try {
      await expect(registerUser(input)).rejects.toThrow();
      expect(await db.select().from(users)).toHaveLength(0);
      expect(await db.select().from(organizations)).toHaveLength(0);
    } finally {
      await db.execute(sql`ALTER TABLE org_members DROP CONSTRAINT test_reject_owner`);
    }
    await expect(registerUser(input)).resolves.toMatchObject({ email: input.email });
  });
});
