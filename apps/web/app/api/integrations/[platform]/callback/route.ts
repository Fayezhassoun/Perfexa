// OAuth callback (Phase 2): verifies the signed state, exchanges the code,
// discovers the platform account, and stores tokens encrypted — all inside
// services.oauth.completeOAuthFlow. The account lands in sandbox mode; going
// live still needs the explicit LIVE-confirm switch in Settings.

import { NextResponse, type NextRequest } from 'next/server';
import { createAgentContext, services } from '@sayso/agents';
import { isConnectablePlatform } from '@sayso/integrations';
import { createContext } from '@/server/trpc/context';

export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const url = new URL(req.url);
  const fail = (message: string) =>
    NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(message)}`, url.origin));

  const { db, userId, orgId } = await createContext();
  if (!userId) return NextResponse.redirect(new URL('/login', url.origin));
  if (!orgId) return fail('Finish onboarding before connecting integrations.');
  if (!isConnectablePlatform(params.platform)) return fail('Unknown integration.');

  const providerError = url.searchParams.get('error');
  if (providerError) return fail(`The connection was cancelled or failed (${providerError}).`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return fail('The provider response was incomplete — please try again.');

  const agentCtx = createAgentContext({ db, orgId, userId });
  try {
    await services.oauth.completeOAuthFlow(agentCtx, params.platform, { code, state });
    return NextResponse.redirect(new URL(`/settings?connected=${params.platform}`, url.origin));
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'The connection failed — please try again.');
  }
}
