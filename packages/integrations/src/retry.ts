// Retry with exponential backoff + jitter (CONTRACTS §7).

interface RetryOptions {
  retries?: number;
  baseMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries fn on transient failures. Immediately rethrows errors that look
 * permanent: `err.noRetry === true` or an HTTP-ish `err.status` in 400–499.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseMs = opts?.baseMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const e = err as { noRetry?: boolean; status?: number };
      if (e?.noRetry === true) throw err;
      if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) throw err;
      if (attempt === retries) break;
      const backoff = baseMs * 2 ** attempt;
      const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
      await sleep(Math.max(10, backoff + jitter));
    }
  }
  throw lastErr;
}
