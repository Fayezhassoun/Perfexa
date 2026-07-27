import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { services } from '@sayso/agents';
import { router, orgProcedure } from '../trpc';
import { rateLimit } from '@/lib/rate-limit';

export const conversationsRouter = router({
  list: orgProcedure.query(({ ctx }) => services.conversations.listConversations(ctx.agentCtx)),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) => services.conversations.getConversation(ctx.agentCtx, input.id)),

  create: orgProcedure
    .input(z.object({ title: z.string().max(120).optional() }).optional())
    .mutation(({ ctx, input }) => services.conversations.createConversation(ctx.agentCtx, input?.title)),

  // Core entry (CONTRACTS §5): persists the user message, runs the orchestrator,
  // returns the assistant reply (+ proposal when one is emitted).
  sendMessage: orgProcedure
    .input(
      z.object({
        conversationId: z.string().uuid().optional(),
        content: z.string().min(1).max(4000),
        modality: z.enum(['voice', 'text']),
        idempotencyKey: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const limit = rateLimit(`sendMessage:${ctx.userId}`, 30, 60_000);
      if (!limit.ok) {
        throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Slow down — too many messages' });
      }
      return services.conversations.sendChatMessage(ctx.agentCtx, input);
    }),
});
