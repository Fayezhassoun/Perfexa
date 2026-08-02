import { randomBytes } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { reportShares, weeklyReports } from '@growthcrew/db';
import { publicProcedure, router, orgProcedure } from '../trpc';

const brandColorSchema = z.string().regex(/^#[\da-f]{6}$/i, 'Brand color must be a six-digit hex color');

const shareInput = z.object({
  reportId: z.string().uuid(),
  brandName: z.string().trim().min(1).max(120),
  brandColor: brandColorSchema.optional(),
});

export const shareRouter = router({
  create: orgProcedure.input(shareInput).mutation(async ({ ctx, input }) => {
    const [report] = await ctx.db
      .select({ id: weeklyReports.id })
      .from(weeklyReports)
      .where(and(eq(weeklyReports.id, input.reportId), eq(weeklyReports.orgId, ctx.orgId)))
      .limit(1);

    if (!report) throw new Error('Report not found');

    const [share] = await ctx.db
      .insert(reportShares)
      .values({
        shareId: randomBytes(9).toString('base64url'),
        reportId: report.id,
        orgId: ctx.orgId,
        brandName: input.brandName,
        brandColor: input.brandColor,
      })
      .returning({ shareId: reportShares.shareId });

    if (!share) throw new Error('Unable to create report share');

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
    return {
      shareId: share.shareId,
      url: `${appUrl}/report/${share.shareId}`,
    };
  }),

  getPublic: publicProcedure
    .input(z.object({ shareId: z.string().min(1).max(128) }))
    .query(async ({ ctx, input }) => {
      const [result] = await ctx.db
        .select({ share: reportShares, report: weeklyReports })
        .from(reportShares)
        .innerJoin(
          weeklyReports,
          and(eq(weeklyReports.id, reportShares.reportId), eq(weeklyReports.orgId, reportShares.orgId)),
        )
        .where(
          and(
            eq(reportShares.shareId, input.shareId),
            or(isNull(reportShares.expiresAt), gt(reportShares.expiresAt, new Date())),
          ),
        )
        .limit(1);

      if (!result) throw new Error('Report share not found');

      return {
        report: result.report,
        branding: {
          brandName: result.share.brandName,
          brandColor: result.share.brandColor,
        },
      };
    }),
});
