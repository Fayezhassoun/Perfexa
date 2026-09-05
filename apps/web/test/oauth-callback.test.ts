import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ context: vi.fn(), complete: vi.fn() }));
vi.mock('@/server/trpc/context', () => ({ createContext: mocks.context }));
vi.mock('@growthcrew/agents', () => ({ createAgentContext: (ctx: unknown) => ctx, services: { oauth: { completeOAuthFlow: mocks.complete } } }));
import { GET } from '../app/api/integrations/[platform]/callback/route';
beforeEach(() => { vi.clearAllMocks(); mocks.context.mockResolvedValue({ db: {}, userId: 'user', orgId: 'org' }); });
describe('OAuth callback handoff', () => {
  it('returns to integrations with the successful provider result', async () => {
    mocks.complete.mockResolvedValue({});
    const response = await GET(new NextRequest('https://example.test/api/integrations/meta/callback?code=test&state=signed'), { params: { platform: 'meta' } });
    const redirect = new URL(response.headers.get('location')!);
    expect(redirect.pathname).toBe('/settings');
    expect(redirect.searchParams.get('tab')).toBe('integrations');
    expect(redirect.searchParams.get('connected')).toBe('meta');
    expect(mocks.complete).toHaveBeenCalledOnce();
  });
  it('returns provider cancellation to the visible integrations error banner', async () => {
    const response = await GET(new NextRequest('https://example.test/api/integrations/meta/callback?error=access_denied'), { params: { platform: 'meta' } });
    const redirect = new URL(response.headers.get('location')!);
    expect(redirect.searchParams.get('tab')).toBe('integrations');
    expect(redirect.searchParams.get('error')).toContain('access_denied');
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('returns exchange failure without a false connected handoff', async () => {
    mocks.complete.mockRejectedValue(new Error('The connection expired. Please retry.'));
    const response = await GET(new NextRequest('https://example.test/api/integrations/meta/callback?code=test&state=signed'), { params: { platform: 'meta' } });
    const redirect = new URL(response.headers.get('location')!);
    expect(redirect.searchParams.get('error')).toContain('connection expired');
    expect(redirect.searchParams.has('connected')).toBe(false);
  });
});
