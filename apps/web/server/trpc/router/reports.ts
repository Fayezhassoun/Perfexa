import { z } from 'zod';
import { router, orgProcedure } from '../trpc';
import { services } from '@growthcrew/agents';
import { sendWeeklyReportForOrg } from '@/server/cron/weekly-report';

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

  /** Email this week's report to the org's owners. Idempotent per ISO week. */
  sendEmail: orgProcedure.mutation(({ ctx }) => sendWeeklyReportForOrg(ctx.agentCtx)),
});

export const reportsRouter = router({
  weekly: weeklyRouter,
});
