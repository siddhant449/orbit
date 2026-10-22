/**
 * Per-profile rate limits and a daily cost cap, shared by chat and image generation. Counters live in Upstash Redis
 * over REST (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN, plain fetch) or, without them or in tests, in memory.
 * A store that errors never blocks a request: the limiter logs and lets it through.
 */
export type CounterStore = {
  /** Adds `by` to the counter (creating it with a TTL) and returns the new value. */
  incr(key: string, by: number, ttlSec: number): Promise<number>;
  get(key: string): Promise<number>;
};

export function memoryStore(now: () => number = Date.now): CounterStore {
  const map = new Map<string, { value: number; expires: number }>();
  const live = (key: string) => {
    const e = map.get(key);
    if (e && e.expires <= now()) map.delete(key);
    return map.get(key);
  };
  return {
    async incr(key, by, ttlSec) {
      const e = live(key);
      const value = (e?.value ?? 0) + by;
      map.set(key, { value, expires: e?.expires ?? now() + ttlSec * 1000 });
      return value;
    },
    async get(key) {
      return live(key)?.value ?? 0;
    },
  };
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function upstashStore({ url, token, fetchImpl }: { url: string; token: string; fetchImpl?: FetchLike }): CounterStore {
  const f: FetchLike = fetchImpl ?? ((u, init) => fetch(u, init));
  const call = async (commands: (string | number)[][]) => {
    const res = await f(`${url.replace(/\/$/, "")}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!res.ok) throw new Error("upstash request failed");
    return (await res.json()) as { result?: unknown; error?: string }[];
  };
  return {
    async incr(key, by, ttlSec) {
      const out = await call([["INCRBY", key, by], ["EXPIRE", key, ttlSec, "NX"]]);
      return Number(out[0]?.result ?? 0);
    },
    async get(key) {
      const out = await call([["GET", key]]);
      return Number(out[0]?.result ?? 0) || 0;
    },
  };
}

let shared: CounterStore | null = null;

/** Upstash when both REST variables are set (and not under vitest), else one in-memory store per process. */
export function defaultCounterStore(env: Record<string, string | undefined> = process.env): CounterStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token && !env.VITEST && env.AI_MOCK_MODEL !== "1") return upstashStore({ url, token });
  return (shared ??= memoryStore());
}

export type LimitResult = { ok: true } | { ok: false; kind: "rate" | "daily"; retryAfterSec: number };

export type UsageLimiter = {
  /** Counts one action in a fixed window; denies once `limit` is passed. */
  take(scope: string, profileId: string, opts: { limit: number; windowSec: number }): Promise<LimitResult>;
  /** Denies when today's (UTC) recorded cost has reached `capMicroUsd`. */
  checkBudget(scope: string, profileId: string, capMicroUsd: number): Promise<LimitResult>;
  /** Adds to today's cost for the profile. */
  recordCost(scope: string, profileId: string, microUsd: number): Promise<void>;
  /** Counts one operation against a UTC-day counter with a ceiling (team or global). */
  takeDaily(scope: string, id: string, limit: number): Promise<LimitResult>;
};

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const secondsToUtcMidnight = (ms: number) => Math.max(1, Math.ceil((Date.parse(`${day(ms)}T00:00:00Z`) + 86_400_000 - ms) / 1000));

export function createUsageLimiter({ store, now = Date.now, onError = (e: unknown) => console.error(`[limits] store unavailable, letting the request through: ${e instanceof Error ? e.message : String(e)}`) }: { store: CounterStore; now?: () => number; onError?: (e: unknown) => void }): UsageLimiter {
  const guard = async <T>(fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      onError(e);
      return fallback;
    }
  };
  return {
    take: (scope, profileId, { limit, windowSec }) =>
      guard<LimitResult>({ ok: true }, async () => {
        const t = now();
        const bucket = Math.floor(t / (windowSec * 1000));
        const n = await store.incr(`rl:${scope}:${profileId}:${bucket}`, 1, windowSec);
        if (n <= limit) return { ok: true };
        return { ok: false, kind: "rate", retryAfterSec: Math.max(1, Math.ceil(((bucket + 1) * windowSec * 1000 - t) / 1000)) };
      }),
    checkBudget: (scope, profileId, cap) =>
      guard<LimitResult>({ ok: true }, async () => {
        const t = now();
        const spent = await store.get(`cost:${scope}:${profileId}:${day(t)}`);
        return spent >= cap ? { ok: false, kind: "daily", retryAfterSec: secondsToUtcMidnight(t) } : { ok: true };
      }),
    recordCost: (scope, profileId, microUsd) =>
      guard(undefined, async () => {
        if (microUsd <= 0) return;
        const t = now();
        await store.incr(`cost:${scope}:${profileId}:${day(t)}`, Math.round(microUsd), secondsToUtcMidnight(t) + 3600);
      }),
    takeDaily: (scope, id, limit) =>
      guard<LimitResult>({ ok: true }, async () => {
        const t = now();
        const n = await store.incr(`ops:${scope}:${id}:${day(t)}`, 1, secondsToUtcMidnight(t) + 3600);
        return n <= limit ? { ok: true } : { ok: false, kind: "daily", retryAfterSec: secondsToUtcMidnight(t) };
      }),
  };
}

/** [input, output] dollars per million tokens. Estimates for the cost cap, not billing. Override with AI_PRICE_<ID>="in,out". */
const PRICES: Record<string, [number, number]> = {
  "gpt-6.1-sol": [2.5, 10],
  "gpt-6-sol": [2.5, 10],
  "gpt-6-luna": [0.3, 1.2],
  "gpt-5.5": [2, 8],
};
const DEFAULT_PRICE: [number, number] = [2.5, 10];

/** Estimated cost in millionths of a dollar: tokens times dollars per million tokens. */
export function estimateCostMicroUsd(modelId: string, usage: { inputTokens?: number | undefined; outputTokens?: number | undefined }, env: Record<string, string | undefined> = process.env): number {
  const override = env[`AI_PRICE_${modelId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`]?.split(",").map(Number);
  const [inRate, outRate] = override && override.length === 2 && override.every(Number.isFinite) ? (override as [number, number]) : (PRICES[modelId] ?? DEFAULT_PRICE);
  return (usage.inputTokens ?? 0) * inRate + (usage.outputTokens ?? 0) * outRate;
}

export const CHAT_LIMITS = {
  turns: 20,
  windowSec: 600,
  dailyUsd: 3,
} as const;

export const chatDailyCapMicroUsd = (env: Record<string, string | undefined> = process.env): number => {
  const v = Number(env.CHAT_DAILY_COST_USD);
  return (Number.isFinite(v) && v > 0 ? v : CHAT_LIMITS.dailyUsd) * 1_000_000;
};

/** Friendly text for a denied request, with the wait. */
export function limitMessage(r: Extract<LimitResult, { ok: false }>): string {
  const mins = Math.ceil(r.retryAfterSec / 60);
  if (r.kind === "rate") return `You're going faster than Orbit can keep up with. Give it ${mins <= 1 ? "a minute" : `${mins} minutes`} and try again.`;
  return "You've reached today's AI usage limit for this profile. It resets at midnight UTC.";
}
