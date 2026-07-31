import { z } from 'zod';
import { services } from '@growthcrew/agents';
import { router, orgProcedure } from '../trpc';

export const onboardingRouter = router({
  get: orgProcedure.query(({ ctx }) => services.onboarding.getOnboarding(ctx.agentCtx)),

  update: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        websiteUrl: z.string().url().optional(),
        goals: z.array(z.enum(['visibility', 'leads', 'sales'])).optional(),
        monthlyBudgetCeilingCents: z.number().int().positive().optional(),
        onboardingStep: z.enum(['welcome', 'business', 'goals', 'budget', 'connect', 'done']).optional(),
        businessBrain: z
          .object({
            offer: z.string().max(600).optional(),
            idealCustomer: z.string().max(600).optional(),
            location: z.string().max(600).optional(),
            tone: z.enum(['friendly', 'expert', 'premium', 'direct']).optional(),
            channels: z
              .array(z.enum(['seo', 'google_ads', 'meta', 'email', 'social', 'reviews']))
              .optional(),
            constraints: z.string().max(600).optional(),
            proofPoints: z.string().max(600).optional(),
          })
          .optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { idempotencyKey: _key, ...patch } = input;
      return services.onboarding.updateOnboarding(ctx.agentCtx, patch);
    }),

  complete: orgProcedure
    .input(z.object({ idempotencyKey: z.string().optional() }).optional())
    .mutation(({ ctx }) => services.onboarding.completeOnboarding(ctx.agentCtx)),
});
