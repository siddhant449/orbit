import { DefaultChatTransport } from "ai";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { chatFetch, type ActiveTurn } from "./chat-fetch";

export type ChatSelections = {
  selectedKnowledgeBaseIds: string[];
  selectedWritingStyleId: string | null;
  webSearchEnabled: boolean;
};

/**
 * What the transport needs between renders: the latest selections (written after each render) and the ids of
 * the request in flight (written when a request is prepared). Plain mutable state, outside React's render.
 */
export class TurnState {
  selections: ChatSelections = { selectedKnowledgeBaseIds: [], selectedWritingStyleId: null, webSearchEnabled: true };
  runId: string | null = null;
  constructor(public pendingId: string | null) {}

  update(selections: ChatSelections) {
    this.selections = selections;
  }

  pending() {
    return this.pendingId;
  }

  run() {
    return this.runId;
  }

  clearPending() {
    this.pendingId = null;
  }

  /** The run that is really live on the server (from a 409 or the messages route): Stop must target it. */
  adopt(turn: ActiveTurn) {
    this.runId = turn?.runId ?? null;
  }

  /** Our request ended: its run id is no longer the live one. */
  finished() {
    this.runId = null;
  }

  /** The POST body: only the newest message plus the selections, with a fresh run id per request. */
  prepare({ id, messages, body }: { id: string; messages: { id: string }[]; body: Record<string, unknown> | undefined }) {
    const message = messages.at(-1)!;
    this.runId = crypto.randomUUID();
    this.pendingId = message.id;
    return { body: { id, runId: this.runId, message, ...this.selections, ...body } };
  }

  transport() {
    return new DefaultChatTransport<ChatUIMessage>({
      api: "/api/chat",
      fetch: chatFetch,
      prepareSendMessagesRequest: (opts) => this.prepare(opts),
    });
  }
}

type Msg = { id: string; role: string; parts: { type: string; text?: string }[] };

const textOf = (m: Msg) =>
  m.parts
    .map((p) => (p.type === "text" ? (p.text ?? "") : ""))
    .join("")
    .trim();

/**
 * A send refused with 409 `chat_turn_active`. The refused id is read before the live run is adopted. When the
 * running turn answers that very message it is already stored and stays; otherwise it leaves the screen and its
 * text goes back to the composer.
 */
export function handleTurnActive<M extends Msg>(turn: TurnState, messages: M[], activeTurn: ActiveTurn): { messages: M[]; draft: string | null } {
  const refusedId = turn.pending();
  turn.adopt(activeTurn);
  const refused = messages.find((m) => m.id === refusedId && m.role === "user");
  if (!refused || activeTurn?.requestMessageId === refused.id) return { messages, draft: null };
  turn.clearPending();
  const text = textOf(refused);
  return { messages: messages.filter((m) => m.id !== refused.id), draft: text || null };
}
