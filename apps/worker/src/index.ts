import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

// zero-config local dev: pick up repo-root .env when present
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // .env optional
}

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'worker' }));

/**
 * BullMQ queue registration (CONTRACTS §11). No-op consumers land in wave 2;
 * wave 1 only registers the queues and must boot even when redis is down.
 */
async function registerQueues(): Promise<void> {
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6380';
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    lazyConnect: true,
  });
  connection.on('error', () => {
    // swallowed — the timeout below turns unavailability into a warning
  });

  const metricsPoll = new Queue('metrics-poll', { connection });
  const email = new Queue('email', { connection });

  try {
    await Promise.race([
      (async () => {
        // repeatable every 5 min per CONTRACTS §11
        await metricsPoll.add('poll', {}, { repeat: { every: 5 * 60 * 1000 } });
        console.log('[worker] bullmq queues registered: metrics-poll (5min), email');
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('redis connection timed out')), 5000),
      ),
    ]);
  } catch (err) {
    console.warn(
      `[worker] redis unavailable — BullMQ queues disabled (${(err as Error).message}). ` +
        'Web app keeps working without the worker.',
    );
    metricsPoll.close().catch(() => {});
    email.close().catch(() => {});
    connection.disconnect();
  }
}

const port = Number(process.env.PORT ?? 3001);

await registerQueues();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[worker] listening on http://localhost:${info.port}`);
});
