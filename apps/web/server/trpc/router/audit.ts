import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

export const auditRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(200).optional(),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => services.auditLog.listAuditLogs(ctx.agentCtx, input ?? undefined)),
});
