/**
 * The chat transport's fetch. It turns the server's 409s into typed errors the session can act on: a turn
 * still running (resume it) or a request that already has its reply (adopt it from the stored messages).
 */

export type ActiveTurn = { runId: string; requestMessageId: string | null } | null;

export class ChatTurnActiveError extends Error {
  constructor(readonly activeTurn: ActiveTurn) {
    super("This chat is still finishing its last reply.");
    this.name = "ChatTurnActiveError";
  }
}

export class ChatTurnCompleteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatTurnCompleteError";
  }
}

/** Any other refused request, carrying the server's `cause` for the error line. */
export class ChatRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

const FALLBACK = "That message didn't go through. Try again.";

export const chatFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  // Only the POST carries the turn; reconnects (GET …/stream) keep the SDK's own handling.
  if (res.ok || (init?.method ?? "GET").toUpperCase() !== "POST") return res;
  const body = (await res.json().catch(() => null)) as { code?: string; cause?: string; activeTurn?: ActiveTurn } | null;
  if (res.status === 409 && body?.code === "chat_turn_active") throw new ChatTurnActiveError(body.activeTurn ?? null);
  if (res.status === 409 && body?.code === "chat_turn_complete") throw new ChatTurnCompleteError(body.cause ?? FALLBACK);
  throw new ChatRequestError(body?.code ?? "request_failed", body?.cause ?? FALLBACK, res.status);
};
