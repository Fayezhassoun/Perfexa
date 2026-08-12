// CRON_SECRET guard for POST /api/cron/geo (CONTRACTS §6/§11): the HTTP path
// that makes the weekly GEO + SEO pass fire in the web process without the
// worker. 401 without a matching bearer secret, 200 + run result with it.
// The service call is mocked — no engines, no network, no LLM spend.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@growthcrew/db';
import { handleGeoCron } from '../src/cron.js';
import {
  runGeoScansAndSeoAuditsForAllOrgs,
  type WeeklyVisibilityRun,
} from '../src/services/seo-audit.js';

vi.mock('../src/services/seo-audit.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/seo-audit.js')>();
  return { ...actual, runGeoScansAndSeoAuditsForAllOrgs: vi.fn() };
});

const runGeoScans = vi.mocked(runGeoScansAndSeoAuditsForAllOrgs);

const RUN: WeeklyVisibilityRun = {
  geo: { orgs: 2, scanned: 1, skipped: 1, errors: [] },
  seo: { orgs: 2, audited: 2, skipped: 0, errors: [] },
};

function post(headers: Record<string, string> = {}): Promise<Response> {
  return handleGeoCron(
    new Request('http://localhost/api/cron/geo', { method: 'POST', headers }),
  );
}

describe('POST /api/cron/geo', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    runGeoScans.mockReset();
  });

  it('401 when CRON_SECRET is not set (cron disabled)', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const res = await post({ authorization: 'Bearer whatever' });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(runGeoScans).not.toHaveBeenCalled();
  });

  it('401 when the authorization header is missing', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-horse');
    const res = await post();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(runGeoScans).not.toHaveBeenCalled();
  });

  it('401 when the bearer secret does not match', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-horse');
    const res = await post({ authorization: 'Bearer wrong-horse' });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'unauthorized' });
    expect(runGeoScans).not.toHaveBeenCalled();
  });

  it('200 with the run result when the secret matches', async () => {
    vi.stubEnv('CRON_SECRET', 'correct-horse');
    runGeoScans.mockResolvedValue(RUN);
    const res = await post({ authorization: 'Bearer correct-horse' });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual(RUN);
    expect(runGeoScans).toHaveBeenCalledTimes(1);
    expect(runGeoScans).toHaveBeenCalledWith(db);
  });
});
