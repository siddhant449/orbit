/**
 * A fixed-window rate limit kept in this server process's memory. Good enough for one instance; it resets on deploy
 * and isn't shared between instances.
 * TODO(rate-limit): move to Upstash Redis (`@upstash/ratelimit`) once it's provisioned, so limits hold across instances.
 */
export type Throttle = { take(key: string): { ok: true } | { ok: false; retryAfterSec: number } };

export function createThrottle({ limit, windowMs, now = Date.now }: { limit: number; windowMs: number; now?: () => number }): Throttle {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    take(key) {
      const t = now();
      // Drop stale windows now and then so the map can't grow without bound.
      if (windows.size > 10_000) for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        return { ok: true };
      }
      if (w.count < limit) {
        w.count++;
        return { ok: true };
      }
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((w.start + windowMs - t) / 1000)) };
    },
  };
}
