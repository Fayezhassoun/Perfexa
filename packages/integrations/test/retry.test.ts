import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/retry.js';

describe('withRetry', () => {
  it('returns on first success', async () => {
    const fn = vi.fn().mockResolvedValue(42);
    await expect(withRetry(fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures with backoff, then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { retries: 3, baseMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retry budget', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('down'));
    await expect(withRetry(fn, { retries: 2, baseMs: 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('does not retry 4xx errors', async () => {
    const err = Object.assign(new Error('bad request'), { status: 400 });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { retries: 3, baseMs: 1 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry errors flagged noRetry', async () => {
    const err = Object.assign(new Error('fatal'), { noRetry: true });
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { retries: 3, baseMs: 1 })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
