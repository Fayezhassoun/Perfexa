import { z } from 'zod';
import { router, orgProcedure } from '../trpc';
import { runAnomalyDetection, listAlerts, acknowledgeAlert } from '@growthcrew/agents';

export const alertsRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          unacknowledgedOnly: z.boolean().optional(),
          limit: z.number().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => listAlerts(ctx.agentCtx, input)),

  runDetection: orgProcedure.mutation(({ ctx }) => runAnomalyDetection(ctx.agentCtx)),

  acknowledge: orgProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(({ ctx, input }) => acknowledgeAlert(ctx.agentCtx, input.alertId)),
});
