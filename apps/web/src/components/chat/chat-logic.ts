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

/**
 * The text a refused send hands back to the composer, or null. When the running turn is answering that very
 * message, it is already stored and will show up with its reply, so nothing is restored.
 */
export function draftToRestore(refused: { id: string; text: string } | null, activeTurn: ActiveTurn): string | null {
  if (!refused || !refused.text.trim()) return null;
  if (activeTurn?.requestMessageId === refused.id) return null;
  return refused.text;
}

/** Refused before the turn started (4xx other than the turn conflicts): the message wasn't stored. */
export function restoresDraft(err: unknown): boolean {
  return err instanceof ChatRequestError && err.status >= 400 && err.status < 500;
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

/**
 * Polls the stored chat until no turn is running, then returns it. Reports the running turn on every poll
 * (Stop needs its run id). Returns null when aborted or after `capMs`.
 */
export async function pollUntilIdle<M>({
  load,
  onActive,
  sleep,
  signal,
  now = Date.now,
  capMs = RECOVERY_CAP_MS,
}: {
  load: () => Promise<StoredChat<M> | null>;
  onActive?: (turn: NonNullable<ActiveTurn>) => void;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
  now?: () => number;
  capMs?: number;
}): Promise<StoredChat<M> | null> {
  const start = now();
  for (let attempt = 0; ; attempt++) {
    const stored = await load();
    if (signal?.aborted) return null;
    if (stored && !stored.activeTurn) return stored;
    if (stored?.activeTurn) onActive?.(stored.activeTurn);
    if (now() - start >= capMs) return null;
    await sleep(recoveryDelay(attempt));
    if (signal?.aborted) return null;
  }
}
