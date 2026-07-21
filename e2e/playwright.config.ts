import { defineConfig } from '@playwright/test';

// Fresh embedded Postgres per run (global-setup) + the Next dev server started
// here with mock providers — no external network, no docker (CONTRACTS §12).

const DATABASE_URL = 'postgres://postgres:postgres@localhost:5601/voxmarketer_e2e';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @voxmarketer/web exec next dev -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      AUTH_URL: 'http://localhost:3100',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3100',
      LLM_PROVIDER: 'mock',
      SEO_AUDIT_MODE: 'mock',
      STT_PROVIDER: 'mock',
      TTS_PROVIDER: 'mock',
      NEXT_PUBLIC_STT_PROVIDER: 'mock',
      NEXT_PUBLIC_TTS_PROVIDER: 'mock',
      DEMO_SEED: 'false',
    },
  },
});
