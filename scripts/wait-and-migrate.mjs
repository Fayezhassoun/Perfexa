#!/usr/bin/env node
/**
 * wait-and-migrate.mjs — wait for Postgres to accept connections, then run
 * db:migrate (and db:seed when DEMO_SEED=true). Used by the compose `migrate`
 * service; also handy locally. No db driver imports — a TCP probe is enough,
 * drizzle's migrator does the rest.
 */
import net from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/voxmarketer';
const TIMEOUT_MS = Number(process.env.WAIT_TIMEOUT_MS ?? 60_000);

function parseHostPort(url) {
  const u = new URL(url);
  return { host: u.hostname, port: Number(u.port || 5432) };
}

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket
      .once('connect', () => {
        socket.destroy();
        resolve(true);
      })
      .once('timeout', () => {
        socket.destroy();
        resolve(false);
      })
      .once('error', () => {
        socket.destroy();
        resolve(false);
      })
      .connect(port, host);
  });
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: false });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
    child.on('error', reject);
  });
}

const { host, port } = parseHostPort(DATABASE_URL);
console.log(`[wait-and-migrate] waiting for postgres at ${host}:${port}...`);

const deadline = Date.now() + TIMEOUT_MS;
for (;;) {
  if (await probe(host, port)) break;
  if (Date.now() > deadline) {
    console.error('[wait-and-migrate] timed out waiting for postgres');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 1000));
}

console.log('[wait-and-migrate] postgres reachable — running db:migrate');
await run('pnpm', ['--filter', '@voxmarketer/db', 'db:migrate']);

if ((process.env.DEMO_SEED ?? 'true') === 'true') {
  console.log('[wait-and-migrate] DEMO_SEED=true — running db:seed');
  await run('pnpm', ['--filter', '@voxmarketer/db', 'db:seed']);
}

console.log('[wait-and-migrate] done');
process.exit(0);
