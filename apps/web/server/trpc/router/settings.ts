import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { organizations } from '@growthcrew/db';
import { services } from '@growthcrew/agents';
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
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(['admin', 'member']).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.settings.inviteMember(ctx.agentCtx, input.email, input.role)),

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

  // AI usage metering + cost guardrails (Fox Biz decision #4)
  aiUsage: router({
    stats: orgProcedure.query(({ ctx }) => services.llmUsage.getUsageStats(ctx.agentCtx)),
    setBudget: orgProcedure
      .input(z.object({ cents: z.number().int().min(100).max(100000) }))
      .mutation(({ ctx, input }) => services.llmUsage.setOrgBudgetCents(ctx.agentCtx, input.cents)),
  }),

  // Brand DNA — structured brand profile for AI grounding
  brand: router({
    get: orgProcedure.query(async ({ ctx }) => {
      const [org] = await ctx.agentCtx.db
        .select({ brandProfile: organizations.brandProfile })
        .from(organizations)
        .where(eq(organizations.id, ctx.agentCtx.orgId))
        .limit(1);
      return org?.brandProfile ?? {};
    }),

    update: orgProcedure
      .input(
        z.object({
          companyName: z.string().max(200).optional(),
          tagline: z.string().max(300).optional(),
          industry: z.string().max(200).optional(),
          targetAudience: z.string().max(1000).optional(),
          voiceTone: z.string().max(1000).optional(),
          brandColors: z.array(z.string().max(20)).max(10).optional(),
          doList: z.array(z.string().max(300)).max(20).optional(),
          dontList: z.array(z.string().max(300)).max(20).optional(),
          competitors: z.array(z.string().max(200)).max(20).optional(),
          usp: z.string().max(1000).optional(),
          website: z.string().max(500).optional(),
          products: z.array(z.string().max(300)).max(20).optional(),
          pastWins: z.array(z.string().max(500)).max(20).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        // Merge with existing profile (partial update)
        const [org] = await ctx.agentCtx.db
          .select({ brandProfile: organizations.brandProfile })
          .from(organizations)
          .where(eq(organizations.id, ctx.agentCtx.orgId))
          .limit(1);
        const merged = { ...(org?.brandProfile ?? {}), ...input };
        await ctx.agentCtx.db
          .update(organizations)
          .set({ brandProfile: merged })
          .where(eq(organizations.id, ctx.agentCtx.orgId));
        return merged;
      }),
  }),
});
