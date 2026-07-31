import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { organizations } from '@growthcrew/db';
import { LLM_PROVIDERS } from '@growthcrew/llm';
import { router, orgProcedure } from '../trpc';

function readSelectedLLM(settings: unknown): { provider: string; model?: string } | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const llm = (settings as Record<string, unknown>).llm;
  if (!llm || typeof llm !== 'object' || Array.isArray(llm)) return null;
  const rec = llm as Record<string, unknown>;
  const provider = typeof rec.provider === 'string' ? rec.provider : undefined;
  const model = typeof rec.model === 'string' ? rec.model : undefined;
  if (!provider) return null;
  return { provider, model };
}

export const modelsRouter = router({
  listProviders: orgProcedure.query(() => {
    return LLM_PROVIDERS.map((p) => {
      let configured = true;
      if (p.envKey) {
        configured = Boolean(process.env[p.envKey]);
      }
      return {
        id: p.id,
        label: p.label,
        defaultModel: p.defaultModel,
        configured,
      };
    });
  }),

  getSelected: orgProcedure.query(async ({ ctx }) => {
    const [org] = await ctx.agentCtx.db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId))
      .limit(1);

    return readSelectedLLM(org?.settings);
  }),

  setSelected: orgProcedure
    .input(
      z.object({
        provider: z.string(),
        model: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const providerInfo = LLM_PROVIDERS.find((p) => p.id === input.provider);
      if (!providerInfo) {
        throw new Error(`Unknown LLM provider: ${input.provider}`);
      }

      const [org] = await ctx.agentCtx.db
        .select({ settings: organizations.settings })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .limit(1);

      const existingSettings = (org?.settings as Record<string, unknown> | undefined) ?? {};
      const newLlm = {
        provider: input.provider,
        model: input.model && input.model.trim() ? input.model.trim() : providerInfo.defaultModel,
      };

      const newSettings = {
        ...existingSettings,
        llm: newLlm,
      };

      await ctx.agentCtx.db
        .update(organizations)
        .set({ settings: newSettings })
        .where(eq(organizations.id, ctx.orgId));

      return newLlm;
    }),
});
