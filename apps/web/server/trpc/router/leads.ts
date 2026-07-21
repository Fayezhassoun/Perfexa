import { z } from 'zod';
import { services, leadsToCsv } from '@voxmarketer/agents';
import { router, orgProcedure } from '../trpc';

const leadField = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'email', 'phone', 'textarea']),
  required: z.boolean(),
});

const formsRouter = router({
  list: orgProcedure.query(({ ctx }) => services.leads.listForms(ctx.agentCtx)),

  create: orgProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        fields: z.array(leadField).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.leads.createForm(ctx.agentCtx, input.name, input.fields)),

  update: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        fields: z.array(leadField).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      services.leads.updateForm(ctx.agentCtx, input.id, { name: input.name, fields: input.fields }),
    ),

  embedSnippet: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.leads.embedSnippet(ctx.agentCtx, input.id)),
});

export const leadsRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
          q: z.string().max(200).optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => services.leads.listLeads(ctx.agentCtx, input ?? undefined)),

  update: orgProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.enum(['new', 'contacted', 'won', 'lost']).optional(),
        notes: z.string().max(4000).optional(),
        score: z.number().int().min(0).max(100).optional(),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, idempotencyKey: _key, ...patch } = input;
      return services.leads.updateLead(ctx.agentCtx, id, patch);
    }),

  exportCsv: orgProcedure.query(async ({ ctx }) => {
    const rows = await services.leads.listLeads(ctx.agentCtx);
    return { csv: leadsToCsv(rows) };
  }),

  forms: formsRouter,
});
