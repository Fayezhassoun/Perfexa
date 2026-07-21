// In-memory fixed-window rate limiter. Per-process only (fine for dev /
// single-instance deploys; swap for Redis when scaling out).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 30, windowMs = 60_000): { ok: boolean } {
  const now = Date.now();

  // Lazy cleanup so the map doesn't grow unbounded.
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  return { ok: bucket.count <= limit };
}

/** Client IP from proxy headers, for keying public-route limits. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
