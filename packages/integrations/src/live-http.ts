// Shared HTTP plumbing for live adapters (Phase 2): injectable fetch, bearer
// auth, typed AdapterError mapping. Errors carry `.status` so withRetry can
// tell permanent 4xx from transient failures — except 429, which is left
// retriable on purpose.

import { AdapterError } from './errors.js';
import type { FetchLike } from './types.js';

export interface LiveHttpDeps {
  getAccessToken: () => Promise<string>;
  fetchImpl?: FetchLike;
  /** Google Ads API developer token — sent on every google_ads call. */
  developerToken?: string;
  /** Bearer header (default) or TikTok's `Access-Token` header. */
  tokenHeader?: 'authorization' | 'access-token';
}

const LABELS: Record<string, string> = {
  google_ads: 'Google Ads',
  meta: 'Meta',
  tiktok: 'TikTok',
  ga4: 'Google Analytics 4',
  gsc: 'Search Console',
  google: 'Google',
};

export function platformLabel(platform: string): string {
  return LABELS[platform] ?? platform;
}

export async function liveFetchJson<T>(
  platform: string,
  deps: LiveHttpDeps,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown },
): Promise<T> {
  const label = platformLabel(platform);
  const headers: Record<string, string> = { ...(init?.headers ?? {}) };
  const token = await deps.getAccessToken();
  if (token && deps.tokenHeader === 'access-token') headers['Access-Token'] ??= token;
  else if (token && !headers.authorization) headers.authorization = `Bearer ${token}`;
  if (init?.body !== undefined) headers['content-type'] ??= 'application/json';
  if (deps.developerToken) headers['developer-token'] ??= deps.developerToken;

  const f = deps.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (!f) throw new AdapterError('No fetch implementation available.', platform);

  let res;
  try {
    res = await f(url, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (cause) {
    throw new AdapterError(`Could not reach ${label} — check your network connection.`, platform, cause);
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* best effort */
    }
    const message =
      res.status === 401
        ? `${label} rejected the access token — reconnect the account in Settings.`
        : res.status === 403
          ? `${label} denied access — check the account permissions and API tokens.`
          : `${label} API error (HTTP ${res.status}).`;
    const err = new AdapterError(message, platform, detail);
    if (res.status !== 429) (err as { status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}
