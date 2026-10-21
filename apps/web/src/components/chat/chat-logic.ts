import { ChatRequestError, type ActiveTurn } from "./chat-fetch";

/** Pure pieces of the chat session, kept out of React so they can be tested directly. */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

/**
 * Only absolute http(s) and mailto links survive. Anything else (javascript:, data:, vbscript:, relative paths,
 * fragments, protocol-relative URLs) becomes "", which the renderer shows as plain text. The check runs on the
 * trimmed string, so control characters inside a scheme ("JaVa\nscript:") can't sneak past it.
 */
export function safeUrl(url: string): string {
  const u = url.trim();
  return SAFE_URL.test(u) ? u : "";
}

type Role = { id: string; role: string };

/** The stored history holds an assistant reply to the user message `requestId`. */
export function hasReplyTo(messages: Role[], requestId: string | null): boolean {
  if (!requestId) return false;
  const at = messages.findIndex((m) => m.id === requestId && m.role === "user");
  return at !== -1 && messages.slice(at + 1).some((m) => m.role === "assistant");
}

/** Refused before the turn started (4xx other than the turn conflicts): the message wasn't stored. */
export function restoresDraft(err: unknown): boolean {
  return err instanceof ChatRequestError && err.status >= 400 && err.status < 500;
}

/** On retry, the failed message leaves the screen: a refused request or a network failure may never have stored it. */
export function dropsOnRetry(err: unknown): boolean {
  return err instanceof ChatRequestError || (err instanceof TypeError && NETWORK.test(err.message));
}

const NETWORK = /failed to fetch|networkerror|load failed|network request failed/i;
const FALLBACK = "Something went wrong while answering. Try again.";

export function friendlyError(err: unknown): string {
  if (err instanceof TypeError && NETWORK.test(err.message)) {
    return "Brandloop couldn't be reached. Check your connection, then try again.";
  }
  if (err instanceof Error) return err.message || FALLBACK;
  return FALLBACK;
}

/** Recovery polling: patient enough for a long reply on another instance, then it gives up. */
export const RECOVERY_CAP_MS = 6 * 60_000;
const DELAYS = [500, 1000, 2000, 3000, 5000, 8000];

export function recoveryDelay(attempt: number): number {
  return DELAYS[attempt] ?? 10_000;
}

export type StoredChat<M = unknown> = { messages: M[]; activeTurn: ActiveTurn };

/** Why polling can't go on: the chat is gone (404) or the session ended (401, 403). */
export type Terminal = "gone" | "signed-out";
export type LoadResult<M = unknown> = { ok: true; chat: StoredChat<M> } | { ok: false; terminal: Terminal | null };

/** A failed `GET …/messages`: 401/403/404 end polling; anything else is worth another try. */
export function loadOutcome(status: number): { ok: false; terminal: Terminal | null } {
  if (status === 401 || status === 403) return { ok: false, terminal: "signed-out" };
  if (status === 404) return { ok: false, terminal: "gone" };
  return { ok: false, terminal: null };
}

export type PollResult<M = unknown> =
  | { status: "idle"; chat: StoredChat<M> }
  | { status: "terminal"; reason: Terminal }
  | { status: "timeout" }
  | { status: "aborted" };

/** What the chat says when recovery ends without a reply to show, or null. */
export function recoveryMessage(result: PollResult): string | null {
  if (result.status === "terminal") {
    return result.reason === "gone" ? "This chat is no longer available." : "Your session ended. Sign in again to see this chat.";
  }
  if (result.status === "timeout") return "The reply is taking longer than expected. Reload to check on it.";
  return null;
}

/**
 * Polls the stored chat until no turn is running. Reports the running turn on every poll (Stop needs its run
 * id). Transient failures back off and retry; a terminal answer, the cap or an abort ends it.
 */
export async function pollUntilIdle<M>({
  load,
  onActive,
  sleep,
  signal,
  now = Date.now,
  capMs = RECOVERY_CAP_MS,
}: {
  load: () => Promise<LoadResult<M>>;
  onActive?: (turn: NonNullable<ActiveTurn>) => void;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  now?: () => number;
  capMs?: number;
}): Promise<PollResult<M>> {
  const start = now();
  for (let attempt = 0; ; attempt++) {
    const res = await load();
    if (signal?.aborted) return { status: "aborted" };
    if (res.ok && !res.chat.activeTurn) return { status: "idle", chat: res.chat };
    if (!res.ok && res.terminal) return { status: "terminal", reason: res.terminal };
    if (res.ok && res.chat.activeTurn) onActive?.(res.chat.activeTurn);
    if (now() - start >= capMs) return { status: "timeout" };
    await sleep(recoveryDelay(attempt));
    if (signal?.aborted) return { status: "aborted" };
  }
}
