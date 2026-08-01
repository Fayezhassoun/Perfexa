import { z } from 'zod';
import { router, orgProcedure } from '../trpc';
import {
  getPortalConfig,
  updatePortalConfig,
  createShareLink,
  listShareLinks,
  revokeShareLink,
} from '@growthcrew/agents';

export const portalRouter = router({
  get: orgProcedure.query(({ ctx }) => getPortalConfig(ctx.agentCtx.orgId)),

  update: orgProcedure
    .input(
      z.object({
        config: z
          .object({
            portalName: z.string().optional(),
            logoUrl: z.string().url().optional(),
            faviconUrl: z.string().url().optional(),
            primaryColor: z.string().optional(),
            accentColor: z.string().optional(),
            customDomain: z.string().optional(),
            footerText: z.string().optional(),
            showGrowthCrewBranding: z.boolean().optional(),
            allowedEmailDomains: z.array(z.string()).optional(),
          })
          .optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => updatePortalConfig(ctx.agentCtx.orgId, input.config ?? {}, input.enabled)),

  shareLinks: orgProcedure.query(({ ctx }) => listShareLinks(ctx.agentCtx.orgId)),

  createShareLink: orgProcedure
    .input(
      z.object({
        label: z.string().min(1),
        scopes: z.array(z.string()).min(1).default(['dashboard']),
        expiresInDays: z.number().min(1).max(365).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createShareLink(ctx.agentCtx.orgId, input.label, input.scopes, input.expiresInDays),
    ),

  revokeShareLink: orgProcedure
    .input(z.object({ linkId: z.string().uuid() }))
    .mutation(({ ctx, input }) => revokeShareLink(ctx.agentCtx.orgId, input.linkId)),
});
