/**
 * A sliding-window limiter kept in this process's memory.
 * TODO: move to a shared store (Upstash Redis `@upstash/ratelimit`) before running more than one server instance;
 * in memory, each instance counts on its own and a restart resets the counts.
 */
export type RateLimiter = { take(key: string): { ok: true } | { ok: false; retryAfterMs: number } };

export function createRateLimiter({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterMs: recent[0]! + windowMs - t };
      }
      recent.push(t);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
