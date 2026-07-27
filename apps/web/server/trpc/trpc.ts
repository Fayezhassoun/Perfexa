// tRPC plumbing (CONTRACTS §5): superjson transformer + the three procedure
// levels. Routers stay thin — auth + zod here, logic in @sayso/agents.

import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { createAgentContext, type AgentContext } from '@sayso/agents';
import type { Context } from './context';

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;

/**
 * Plain Errors thrown by service functions arrive here wrapped as
 * INTERNAL_SERVER_ERROR with the original as `cause`. Map them to user-safe
 * codes (CONTRACTS §13): 'not found' → NOT_FOUND, everything else BAD_REQUEST.
 */
const mapServiceErrors = t.middleware(async ({ next }) => {
  const result = await next();
  if (result.ok) return result;
  const error = result.error;
  if (error.code === 'INTERNAL_SERVER_ERROR' && error.cause instanceof Error) {
    const message = error.cause.message;
    const code = /not found/i.test(message) ? ('NOT_FOUND' as const) : ('BAD_REQUEST' as const);
    throw new TRPCError({ code, message, cause: error.cause });
  }
  throw error;
});

export const publicProcedure = t.procedure.use(mapServiceErrors);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id || !ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to continue' });
  }
  const userId = ctx.userId;
  return next({ ctx: { ...ctx, userId } });
});

/** Requires an org membership and attaches a ready AgentContext. */
export const orgProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.orgId) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'No organization found for this account — finish onboarding first',
    });
  }
  const orgId = ctx.orgId;
  const agentCtx: AgentContext = createAgentContext({ db: ctx.db, orgId, userId: ctx.userId });
  return next({ ctx: { ...ctx, orgId, agentCtx } });
});
