import { classifyAiError, isProviderDown, describeAiError, type AiErrorClass } from "./errors";
import { defaultCounterStore, type CounterStore } from "./usage-limits";

/**
 * Admin-facing provider health, kept as timestamped events in the shared counter store (Upstash Redis in production):
 * `ai:fail:<class>` for quota / auth / outage failures and `ai:ok` for successful calls. The banner shows while a failure
 * happened in the last 30 minutes and no call has succeeded since. Nothing here carries user or prompt data.
 */
export type ProviderDownClass = "quota" | "auth" | "outage";
export const ALERT_WINDOW_MS = 30 * 60_000;
const FAIL_TTL_SEC = 3600;
const OK_THROTTLE_MS = 60_000;
const CLASSES: ProviderDownClass[] = ["quota", "auth", "outage"];

export type ProviderAlert = { cls: ProviderDownClass; since: number; lastAt: number };

type Hooks = { store?: CounterStore; now?: () => number };
const g = globalThis as unknown as { __orbitAlert?: { lastOk: number; seen: WeakSet<object> } };
const state = () => (g.__orbitAlert ??= { lastOk: 0, seen: new WeakSet() });

/** Pure: the active alert given failure times per class and success times, or null. Worst class wins (quota, auth, outage). */
export function evaluateAlert(failures: Record<ProviderDownClass, number[]>, oks: number[], now: number): ProviderAlert | null {
  const lastOk = oks.length ? Math.max(...oks) : 0;
  for (const cls of CLASSES) {
    const live = failures[cls].filter((t) => t > lastOk && t >= now - ALERT_WINDOW_MS).sort((a, b) => a - b);
    if (live.length) return { cls, since: live[0]!, lastAt: live.at(-1)! };
  }
  return null;
}

/** Records a provider failure for the admin banner. Fire-and-forget; only quota / auth / outage count. */
export function recordProviderFailure(cls: AiErrorClass, { store = defaultCounterStore(), now = Date.now }: Hooks = {}): void {
  if (!isProviderDown(cls)) return;
  void store.addEvent(`ai:fail:${cls}`, now(), FAIL_TTL_SEC).catch(() => {});
}

/** Records a successful call (at most once a minute per process, so healthy traffic costs almost nothing). */
export function recordProviderSuccess({ store = defaultCounterStore(), now = Date.now }: Hooks = {}): void {
  const s = state();
  const t = now();
  if (t - s.lastOk < OK_THROTTLE_MS) return;
  s.lastOk = t;
  void store.addEvent("ai:ok", t, FAIL_TTL_SEC).catch(() => {});
}

/**
 * Handles one failed provider call: classifies it, logs ONE line (class and status only, once per error object even if
 * several layers report it), and records quota / auth / outage for the admin banner. Returns the class.
 */
export function reportProviderError(err: unknown, where: string, hooks: Hooks = {}): AiErrorClass {
  const cls = classifyAiError(err);
  if (cls === "other") return cls;
  const seen = state().seen;
  if (err && typeof err === "object") {
    if (seen.has(err)) return cls;
    seen.add(err);
  }
  console.error(`[ai] ${where}: ${describeAiError(err)}`);
  recordProviderFailure(cls, hooks);
  return cls;
}

/** The active alert for the admin page, or null. A store failure reads as no alert. */
export async function getProviderAlert({ store = defaultCounterStore(), now = Date.now }: Hooks = {}): Promise<ProviderAlert | null> {
  const t = now();
  const since = t - ALERT_WINDOW_MS;
  try {
    const [quota, auth, outage, ok] = await Promise.all([store.events("ai:fail:quota", since), store.events("ai:fail:auth", since), store.events("ai:fail:outage", since), store.events("ai:ok", since)]);
    return evaluateAlert({ quota, auth, outage }, ok, t);
  } catch {
    return null;
  }
}
