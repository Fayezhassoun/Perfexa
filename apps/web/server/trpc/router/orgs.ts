// Orgs router (CONTRACTS §5): list the user's orgs, create additional org
// shells (agency mode), accept invites. Thin — logic lives in
// packages/agents/src/services/orgs.ts.

import { z } from 'zod';
import { cookies } from 'next/headers';
import { services } from '@voxmarketer/agents';
import { router, protectedProcedure } from '../trpc';
import { ACTIVE_ORG_COOKIE } from '@/server/org-resolution';

export const orgsRouter = router({
  list: protectedProcedure.query(({ ctx }) => services.orgs.listUserOrgs(ctx.db, ctx.userId, ctx.orgId)),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.orgs.createOrg(ctx.db, ctx.userId, input.name)),

  acceptInvite: protectedProcedure
    .input(z.object({ token: z.string().min(1), idempotencyKey: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const result = await services.orgs.acceptInvite(ctx.db, ctx.userId, input.token);
      // The new org becomes active immediately.
      cookies().set(ACTIVE_ORG_COOKIE, result.orgId, { httpOnly: true, sameSite: 'lax', path: '/' });
      return result;
    }),
});
