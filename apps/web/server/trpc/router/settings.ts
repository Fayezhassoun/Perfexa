import { z } from 'zod';
import { services } from '@voxmarketer/agents';
import { router, orgProcedure } from '../trpc';

const platform = z.enum(['google_ads', 'meta', 'tiktok', 'ga4', 'gsc']);

const budgetsRouter = router({
  list: orgProcedure.query(({ ctx }) => services.settings.listBudgetCaps(ctx.agentCtx)),

  // >20% change vs current cap creates a pending approval instead of applying (§5).
  update: orgProcedure
    .input(
      z.object({
        scope: z.string().min(1),
        capCents: z.number().int().positive(),
        period: z.enum(['daily', 'monthly']),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { idempotencyKey: _key, ...cap } = input;
      return services.settings.updateBudgetCap(ctx.agentCtx, cap);
    }),
});

const membersRouter = router({
  list: orgProcedure.query(({ ctx }) => services.settings.listMembers(ctx.agentCtx)),

  invite: orgProcedure
    .input(z.object({ email: z.string().email(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.settings.inviteMember(ctx.agentCtx, input.email)),

  remove: orgProcedure
    .input(z.object({ id: z.string().uuid(), idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.settings.removeMember(ctx.agentCtx, input.id)),
});

const notificationsRouter = router({
  update: orgProcedure
    .input(
      z.object({
        prefs: z.record(z.unknown()),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.settings.updateNotifications(ctx.agentCtx, input.prefs)),
});

export const settingsRouter = router({
  integrations: orgProcedure.query(({ ctx }) => services.settings.listIntegrations(ctx.agentCtx)),

  // sandbox→live requires an OAuth-connected account + confirmText 'LIVE' (§5).
  setMode: orgProcedure
    .input(
      z.object({
        platform,
        mode: z.enum(['sandbox', 'live']),
        confirmText: z.string().optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.settings.setIntegrationMode(ctx.agentCtx, input.platform, input.mode, input.confirmText),
    ),

  // Phase-1 OAuth stand-in: simulates a connected sandbox account.
  connect: orgProcedure
    .input(z.object({ platform, idempotencyKey: z.string().optional() }))
    .mutation(({ ctx, input }) => services.settings.connectSandboxAccount(ctx.agentCtx, input.platform)),

  budgets: budgetsRouter,
  members: membersRouter,
  notifications: notificationsRouter,
});
