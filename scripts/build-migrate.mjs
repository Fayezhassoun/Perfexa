/**
 * Bundle scripts/migrate-standalone.mjs into a single CJS file for the runtime
 * image. Run from repo root: node scripts/build-migrate.mjs
 * Output: scripts/dist/migrate.cjs (copied into the image by the Dockerfile).
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

await build({
  entryPoints: [path.join(root, 'scripts/migrate-standalone.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(root, 'scripts/dist/migrate.cjs'),
  // drizzle-orm + postgres live in packages/db's node_modules (pnpm isolation)
  absWorkingDir: path.join(root, 'packages/db'),
  nodePaths: [path.join(root, 'packages/db/node_modules')],
  logLevel: 'info',
});

console.log('[build-migrate] wrote scripts/dist/migrate.cjs');
