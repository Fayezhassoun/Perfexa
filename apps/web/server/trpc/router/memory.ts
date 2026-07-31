import { z } from 'zod';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';

export const memoryRouter = router({
  list: orgProcedure
    .input(
      z
        .object({
          kind: z.string().optional(),
          tag: z.string().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => services.memory.listMemory(ctx.agentCtx, input)),

  add: orgProcedure
    .input(
      z.object({
        title: z.string().optional(),
        text: z.string().min(1),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.memory.importText(ctx.agentCtx, input)),

  importUrl: orgProcedure
    .input(
      z.object({
        url: z.string().url(),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.memory.importUrl(ctx.agentCtx, input)),

  importFile: orgProcedure
    .input(
      z.object({
        filename: z.string().min(1),
        mimeType: z.string().min(1),
        text: z.string().min(1),
        tags: z.array(z.string()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => services.memory.importFile(ctx.agentCtx, input)),

  search: orgProcedure
    .input(z.object({ q: z.string().min(1).max(500) }))
    .query(({ ctx, input }) => services.memory.searchMemory(ctx.agentCtx, input.q)),

  remove: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) => services.memory.deleteMemory(ctx.agentCtx, input.id)),
});
