import { z } from 'zod';
import { router, orgProcedure } from '../trpc';
import { services } from '@growthcrew/agents';

// In-app weekly performance report (the /reports surface). Logic lives in
// @growthcrew/agents services.reports — this router stays thin (auth + zod).
const weeklyRouter = router({
  /** Generate (or regenerate) this week's report. Metered LLM, deterministic fallback. */
  generate: orgProcedure.mutation(({ ctx }) => services.reports.generateWeeklyReport(ctx.agentCtx)),

  /** All of the org's weekly reports, newest week first. */
  list: orgProcedure.query(({ ctx }) => services.reports.listReports(ctx.agentCtx)),

  /** A single report, scoped to the org. */
  get: orgProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) =>
    services.reports.getReport(ctx.agentCtx, input.id),
  ),
});

export const reportsRouter = router({
  weekly: weeklyRouter,
});
