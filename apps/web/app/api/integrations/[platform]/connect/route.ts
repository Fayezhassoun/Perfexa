// OAuth connect start (Phase 2): redirects to the provider's consent screen
// with a signed state. Requires a session + org; when the app credentials
// aren't configured, bounces back to Settings with an explanatory error.

import { NextResponse, type NextRequest } from 'next/server';
import { createAgentContext, services } from '@sayso/agents';
import { isConnectablePlatform } from '@sayso/integrations';
import { createContext } from '@/server/trpc/context';

export async function GET(req: NextRequest, { params }: { params: { platform: string } }) {
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url));
  const { db, userId, orgId } = await createContext();

  if (!userId) return back('/login');
  if (!orgId) return back('/onboarding');
  if (!isConnectablePlatform(params.platform)) {
    return back(`/settings?error=${encodeURIComponent('Unknown integration.')}`);
  }

  const agentCtx = createAgentContext({ db, orgId, userId });
  try {
    const { url } = services.oauth.startOAuthFlow(agentCtx, params.platform);
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'OAuth is not configured yet';
    return back(`/settings?error=${encodeURIComponent(message)}`);
  }
}
