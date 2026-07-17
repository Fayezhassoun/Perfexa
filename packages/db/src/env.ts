import { fileURLToPath } from 'node:url';

/**
 * Load the repo-root .env if present (zero-config local dev).
 * Does not override variables already set in the environment.
 */
export function loadRootEnv(): void {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // .env is optional — rely on real environment variables
  }
}
