// admin.health redis semantics: an unconfigured REDIS_URL is healthy
// ("not-configured") — pilots run single-instance without Redis. Only a
// configured-but-unreachable Redis may report "error".

import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { systemHealth } from '../src/services/admin.js';
import { db, freshOrg, truncateAll } from './helpers.js';

/** Listen on an ephemeral port, then close — leaves a reliably-closed port behind. */
async function takePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return port;
}

describe('admin.health (systemHealth)', () => {
  let savedRedisUrl: string | undefined;

  beforeEach(async () => {
    await truncateAll(db);
    savedRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
  });

  afterEach(() => {
    if (savedRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = savedRedisUrl;
  });

  it('reports redis "not-configured" (healthy) when REDIS_URL is absent', async () => {
    const org = await freshOrg();
    const health = await systemHealth(org.ctx);
    expect(health.redis).toBe('not-configured');
    expect(health.db).toBe('ok');
  });

  it('reports redis "ok" when the configured Redis is reachable', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    try {
      const org = await freshOrg();
      const health = await systemHealth(org.ctx);
      expect(health.redis).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    }
  });

  it('reports redis "error" only when configured but unreachable', async () => {
    const closedPort = await takePort();
    process.env.REDIS_URL = `redis://127.0.0.1:${closedPort}`;
    const org = await freshOrg();
    const health = await systemHealth(org.ctx);
    expect(health.redis).toBe('error');
  });
});
