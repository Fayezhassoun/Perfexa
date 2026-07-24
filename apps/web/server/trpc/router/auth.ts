import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { organizations, orgMembers, users } from '@voxmarketer/db';
import { router, publicProcedure } from '../trpc';
import { registerUser } from '@/server/auth-service';

export const authRouter = router({
  register: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }),
    )
    .mutation(({ input }) => registerUser(input)),

  // Nullable per CONTRACTS §5: returns null when signed out.
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;
    const [user] = await ctx.db
      .select({ id: users.id, name: users.name, email: users.email, image: users.image })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);
    if (!user) return null;
    // Memberships come from active-org resolution (vox_org cookie, §5).
    const membership = ctx.memberships.find((m) => m.orgId === ctx.orgId) ?? null;
    const org = ctx.orgId
      ? ((await ctx.db.select().from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1))[0] ?? null)
      : null;
    return { user, org, membership, memberships: ctx.memberships };
  }),
});
