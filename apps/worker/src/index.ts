import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { db, organizations } from '@growthcrew/db';
import { createAgentContext, services } from '@growthcrew/agents';

// zero-config local dev: pick up repo-root .env when present
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // .env optional
}

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, service: 'worker' }));

async function eachOrg(fn: (ctx: ReturnType<typeof createAgentContext>, orgId: string) => Promise<void>): Promise<void> {
  const orgs = await db.select({ id: organizations.id }).from(organizations);
  for (const org of orgs) {
    await fn(createAgentContext({ db, orgId: org.id }), org.id);
  }
}

/** CONTRACTS §11 consumers — web keeps working when the worker is down. */
const processors = {
  // metrics-poll (5 min): adapter.getMetrics → campaigns_mirror → guardian tick.
  'metrics-poll': async () => {
    await eachOrg(async (ctx) => {
      await services.dashboard.simulateTick(ctx);
    });
  },
  // optimize (hourly): metrics → PENDING approvals only; nothing auto-executes.
  optimize: async () => {
    await eachOrg(async (ctx) => {
      await services.optimize.generateOptimizationApprovals(ctx);
    });
  },
  // email (weekly, Mon 09:00): weekly report per org (+ Resend when configured).
  email: async () => {
    await services.reports.runWeeklyReportsForAllOrgs(db);
  },
} as const;

/**
 * BullMQ queue registration + consumers (CONTRACTS §11). The worker must boot
 * even when redis is down — queues/consumers are skipped with a warning.
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
  const optimize = new Queue('optimize', { connection });
  const email = new Queue('email', { connection });
  const workers: Worker[] = [];

  try {
    await Promise.race([
      (async () => {
        await metricsPoll.add('poll', {}, { repeat: { every: 5 * 60 * 1000 } });
        await optimize.add('tick', {}, { repeat: { every: 60 * 60 * 1000 } });
        await email.add('weekly-report', {}, { repeat: { pattern: '0 9 * * 1' } });
        for (const [name, fn] of Object.entries(processors)) {
          workers.push(
            new Worker(
              name,
              async () => {
                try {
                  await fn();
                } catch (err) {
                  console.error(`[worker] ${name} failed:`, err instanceof Error ? err.message : err);
                }
              },
              { connection },
            ),
          );
        }
        console.log('[worker] bullmq queues live: metrics-poll (5min), optimize (1h), email (weekly)');
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
    await Promise.allSettled(workers.map((w) => w.close()));
    metricsPoll.close().catch(() => {});
    optimize.close().catch(() => {});
    email.close().catch(() => {});
    connection.disconnect();
  }
}

const port = Number(process.env.PORT ?? 3001);

await registerQueues();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[worker] listening on http://localhost:${info.port}`);
});
