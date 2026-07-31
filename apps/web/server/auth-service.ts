// Registration (CONTRACTS §5 auth.register): creates the user, an org shell,
// and the owner membership in one go. Logic lives here (not in the router).

import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db, users, organizations, orgMembers } from '@growthcrew/db';

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export async function registerUser(input: RegisterInput): Promise<{ id: string; email: string | null; name: string | null }> {
  const email = input.email.toLowerCase().trim();

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists' });
  }

  const passwordHash = bcrypt.hashSync(input.password, 10);
  const [user] = await db
    .insert(users)
    .values({ name: input.name, email, passwordHash })
    .returning({ id: users.id, email: users.email, name: users.name });

  const [org] = await db
    .insert(organizations)
    .values({
      name: `${input.name}'s business`,
      onboardingStep: 'welcome',
      monthlyBudgetCeilingCents: 50000,
      settings: {},
    })
    .returning({ id: organizations.id });

  await db.insert(orgMembers).values({ orgId: org!.id, userId: user!.id, role: 'owner' });

  // Never return the password hash.
  return user!;
}
