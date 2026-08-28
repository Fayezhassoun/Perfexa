import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Component regression tests render to static markup (react-dom/server) — no
// browser environment needed. tsconfig uses `jsx: preserve` for Next, so force
// automatic JSX transformation here.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
