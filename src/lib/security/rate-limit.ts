// A sliding-window limit kept in memory (ADR-066). It is per server
// instance, so on a platform that runs several instances it slows a flood
// down rather than capping it exactly; it needs no database or vendor.

export type RateLimit = {
  /** True when this key may go ahead now, and counts the attempt. */
  allow(key: string, now?: number): boolean;
};

export function createRateLimit(options: {
  /** Attempts allowed per key inside the window. */
  limit: number;
  windowMs: number;
  /** Keys remembered at most, so a flood of new keys cannot grow memory. */
  maxKeys?: number;
}): RateLimit {
  const { limit, windowMs, maxKeys = 10_000 } = options;
  const seen = new Map<string, number[]>();

  return {
    allow(key, now = Date.now()) {
      const since = now - windowMs;
      const recent = (seen.get(key) ?? []).filter((at) => at > since);
      if (recent.length >= limit) {
        seen.set(key, recent);
        return false;
      }
      recent.push(now);
      // Re-inserted, so the oldest key is first when one has to go.
      seen.delete(key);
      seen.set(key, recent);
      if (seen.size > maxKeys) {
        const oldest = seen.keys().next().value;
        if (oldest !== undefined) seen.delete(oldest);
      }
      return true;
    },
  };
}
