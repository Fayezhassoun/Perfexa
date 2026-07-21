import { services } from '@voxmarketer/agents';
import { router, orgProcedure } from '../trpc';

export const adminRouter = router({
  // Platform admins (ADMIN_EMAILS env csv) see all orgs; others see their own.
  users: orgProcedure.query(({ ctx }) =>
    services.admin.listUsers(ctx.agentCtx, ctx.session?.user?.email),
  ),

  health: orgProcedure.query(({ ctx }) => services.admin.systemHealth(ctx.agentCtx)),
});
