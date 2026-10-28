import { APICallError, RetryError } from "ai";

/**
 * Provider failures, named once for the whole app.
 * - quota: the account is out of credits / over its billing limit (will not heal by retrying).
 * - auth: the key is invalid or revoked (will not heal by retrying).
 * - outage: 5xx, timeouts, network failures (retry is right).
 * - rate_limit: 429 without a quota code (retry is right).
 */
export type AiErrorClass = "quota" | "auth" | "outage" | "rate_limit" | "other";

/** What every user sees when the provider is down, unpaid or rejecting our key. Never provider text, links or billing detail. */
export const AI_UNAVAILABLE_USER_MESSAGE = "Orbit's AI is temporarily unavailable. Please try again in a little while.";

/** Status OpenAI quota errors are rewritten to (see `quotaAwareFetch`): 402 is never retried by the AI SDK. */
const QUOTA_STATUS = 402;

const QUOTA_TEXT = /insufficient_quota|no credits remaining|exceeded your current quota|billing[_ ](hard[_ ])?limit|check your plan and billing|free_tier|limit: 0/i;
const NETWORK_TEXT = /fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network/i;

/** The error itself plus whatever it wraps (RetryError.lastError, `cause`), outermost first. Cycle-safe. */
function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = err;
  while (cur && typeof cur === "object" && out.length < 6 && !out.includes(cur)) {
    out.push(cur);
    cur = RetryError.isInstance(cur) ? cur.lastError : (cur as { cause?: unknown }).cause;
  }
  return out;
}

function bodyCode(body: unknown): { code: string; text: string } {
  let parsed: unknown = body;
  if (typeof body === "string") {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { code: "", text: body.slice(0, 500) };
    }
  }
  const e = (parsed as { error?: { code?: unknown; type?: unknown; message?: unknown } } | null | undefined)?.error;
  const code = typeof e?.code === "string" ? e.code : typeof e?.type === "string" ? e.type : "";
  // Gemini's errors carry a numeric `code` and a `status` string such as PERMISSION_DENIED.
  const status = typeof (e as { status?: unknown } | undefined)?.status === "string" ? (e as { status: string }).status : "";
  return { code, text: `${code} ${status} ${typeof e?.message === "string" ? e.message : ""}` };
}

function classifyOne(err: unknown): AiErrorClass | null {
  if (APICallError.isInstance(err)) {
    const { code, text } = bodyCode(err.responseBody ?? (err.data as unknown));
    const status = err.statusCode;
    if (code === "insufficient_quota" || status === QUOTA_STATUS || (status === 429 && QUOTA_TEXT.test(text))) return "quota";
    if (status === 401 || code === "invalid_api_key" || (status === 403 && /PERMISSION_DENIED/.test(text)) || (status === 400 && /API key not valid|API_KEY_INVALID/i.test(text + String(err.responseBody)))) return "auth";
    if (status === 429) return "rate_limit";
    if (status === undefined || status === 408 || status >= 500) return "outage";
    return null;
  }
  const e = err as { name?: unknown; message?: unknown; code?: unknown };
  if (e.name === "AbortError") return null;
  const text = `${typeof e.code === "string" ? e.code : ""} ${typeof e.message === "string" ? e.message : ""}`;
  if (err instanceof TypeError || (e.name === "TimeoutError") || NETWORK_TEXT.test(text)) return "outage";
  return null;
}

/** Classifies a failure from the AI SDK (looking through RetryError and `cause`). Anything unrecognised is "other". */
export function classifyAiError(err: unknown): AiErrorClass {
  for (const e of chain(err)) {
    const c = classifyOne(e);
    if (c) return c;
  }
  return "other";
}

/** True when the class means AI is down for everyone until someone acts or the provider recovers. */
export const isProviderDown = (c: AiErrorClass): c is "quota" | "auth" | "outage" => c === "quota" || c === "auth" || c === "outage";

/** The user-facing text for a failure, or null when the failure should keep the caller's own generic message. */
export function aiErrorUserMessage(err: unknown): string | null {
  return isProviderDown(classifyAiError(err)) ? AI_UNAVAILABLE_USER_MESSAGE : null;
}

/** A log-safe description: class and HTTP status only. No keys, headers, prompt text or provider message. */
export function describeAiError(err: unknown): string {
  const cls = classifyAiError(err);
  const status = chain(err).map((e) => (APICallError.isInstance(e) ? e.statusCode : undefined)).find((s) => s !== undefined);
  const name = err instanceof Error ? err.name : "unknown";
  return `${cls}${status !== undefined ? ` (status ${status})` : ""} [${name}]`;
}

/**
 * A fetch for the OpenAI provider that makes out-of-credits answers non-retryable. The AI SDK retries 429 (and 5xx)
 * with backoff, and a quota 429 will never succeed. Rewriting it to 402 with the body intact stops the retries while
 * `classifyAiError` still sees the original code. Auth (401) is already not retried by the SDK.
 */
export function quotaAwareFetch(base: typeof fetch = (...a) => fetch(...a)): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const res = await base(input, init);
    if (res.status !== 429) return res;
    let text = "";
    try {
      text = await res.clone().text();
    } catch {
      return res;
    }
    const { code, text: msg } = bodyCode(text);
    if (code !== "insufficient_quota" && !QUOTA_TEXT.test(msg)) return res;
    return new Response(text, { status: QUOTA_STATUS, statusText: "Payment Required", headers: res.headers });
  }) as typeof fetch;
}
