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
    const [membership] = await ctx.db
      .select()
      .from(orgMembers)
      .where(eq(orgMembers.userId, ctx.userId))
      .limit(1);
    const org = membership
      ? ((await ctx.db.select().from(organizations).where(eq(organizations.id, membership.orgId)).limit(1))[0] ??
        null)
      : null;
    return { user, org, membership: membership ?? null };
  }),
});
