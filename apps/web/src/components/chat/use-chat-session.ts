"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { mutate } from "swr";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { chatFetch, ChatRequestError, ChatTurnActiveError, ChatTurnCompleteError, type ActiveTurn } from "./chat-fetch";
import { draftToRestore, friendlyError, hasReplyTo, pollUntilIdle, restoresDraft, type StoredChat } from "./chat-logic";
import { HISTORY_KEY } from "./history-key";

export type ChatSelections = {
  selectedKnowledgeBaseIds: string[];
  selectedWritingStyleId: string | null;
  webSearchEnabled: boolean;
};

const POLL_FIRST_MS = 15_000;
const POLL_EVERY_MS = 10_000;
export const TURN_ACTIVE_TOAST = "This chat is still finishing its last reply.";

async function loadMessages(chatId: string): Promise<StoredChat<ChatUIMessage> | null> {
  try {
    const res = await fetch(`/api/chat/${encodeURIComponent(chatId)}/messages`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as StoredChat<ChatUIMessage>) : null;
  } catch {
    return null;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
  });
}

const textOf = (m: ChatUIMessage | undefined) =>
  (m?.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("")
    .trim();

/**
 * What the transport needs between renders: the latest selections (written after each render) and the ids
 * of the request in flight (written by the transport itself). Plain mutable state, outside React's render.
 */
class TurnState {
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
    if (turn?.requestMessageId) this.pendingId = turn.requestMessageId;
  }

  /** Our request ended: its run id is no longer the live one. */
  finished() {
    this.runId = null;
  }

  /** Sends only the newest message plus the composer's selections, with a fresh run id per request. */
  transport() {
    return new DefaultChatTransport<ChatUIMessage>({
      api: "/api/chat",
      fetch: chatFetch,
      prepareSendMessagesRequest: ({ id, messages, body }) => {
        const message = messages.at(-1)!;
        this.runId = crypto.randomUUID();
        this.pendingId = message.id;
        return { body: { id, runId: this.runId, message, ...this.selections, ...body } };
      },
    });
  }
}

/**
 * `useChat` wired to our routes (design section 12): last-message-only POSTs with the composer's selections,
 * resume on a dangling user message, stop on both ends, 409 recovery, and poll recovery that adopts a stored
 * reply when the stream died.
 */
export function useChatSession({
  chatId,
  initialMessages,
  selections,
  onRestoreDraft,
  onFirstFinish,
}: {
  chatId: string;
  initialMessages: ChatUIMessage[];
  selections: ChatSelections;
  /** A refused send hands its text back to the composer. */
  onRestoreDraft?: (text: string) => void;
  /** Runs once, after the first turn of this view ends. */
  onFirstFinish?: () => void;
}) {
  // `pendingId`: the user message the current request answers, polled for and dropped again when refused.
  const [turn] = useState(() => new TurnState(initialMessages.at(-1)?.role === "user" ? initialMessages.at(-1)!.id : null));
  const [transport] = useState(() => turn.transport());
  const lastErrorRef = useRef<Error | null>(null);
  const callbacks = useRef({ onRestoreDraft, onFirstFinish });
  const finishedOnce = useRef(false);
  useEffect(() => {
    turn.update(selections);
    callbacks.current = { onRestoreDraft, onFirstFinish };
  });

  const dangling = initialMessages.at(-1)?.role === "user";
  const chat = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    generateId: () => crypto.randomUUID(),
    throttle: 50,
    onFinish: () => {
      turn.finished();
      void mutate(HISTORY_KEY);
      // The title is written just after the reply; pick it up a moment later.
      setTimeout(() => void mutate(HISTORY_KEY), 1500);
      if (!finishedOnce.current) {
        finishedOnce.current = true;
        callbacks.current.onFirstFinish?.();
      }
    },
    onError: (err) => {
      lastErrorRef.current = err;
      if (err instanceof ChatTurnActiveError) {
        toast(TURN_ACTIVE_TOAST);
        turn.adopt(err.activeTurn);
        dropRefused(err.activeTurn);
        void resumeThenRecover();
      } else if (err instanceof ChatTurnCompleteError) {
        void recover();
      } else if (restoresDraft(err)) {
        dropRefused(null);
      }
    },
  });
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  });

  /**
   * Removes the optimistic user message of a refused send and hands its text back. When the running turn is
   * answering that very message it is already stored, so it stays on screen and nothing is restored.
   */
  function dropRefused(activeTurn: ActiveTurn) {
    const id = turn.pending();
    const current = chatRef.current;
    const refused = current.messages.find((m) => m.id === id && m.role === "user");
    if (!refused || activeTurn?.requestMessageId === refused.id) return;
    const draft = draftToRestore({ id: refused.id, text: textOf(refused) }, activeTurn);
    current.setMessages((ms) => ms.filter((m) => m.id !== refused.id));
    if (draft) callbacks.current.onRestoreDraft?.(draft);
    turn.clearPending();
  }

  // Recovery: poll the stored chat (with backoff, up to six minutes) until no turn runs, then adopt it.
  const [recovering, setRecovering] = useState(false);
  const recoveryRef = useRef<AbortController | null>(null);
  useEffect(() => () => recoveryRef.current?.abort(), []);

  async function recover() {
    recoveryRef.current?.abort();
    const ctrl = new AbortController();
    recoveryRef.current = ctrl;
    setRecovering(true);
    const stored = await pollUntilIdle({
      load: () => loadMessages(chatId),
      onActive: (t) => turn.adopt(t),
      sleep: (ms) => sleep(ms, ctrl.signal),
      signal: ctrl.signal,
    });
    if (ctrl.signal.aborted) return;
    setRecovering(false);
    turn.finished();
    if (stored) chatRef.current.setMessages(stored.messages);
    void mutate(HISTORY_KEY);
  }

  /** Replays the live run if this instance has it; a 204 (run elsewhere, or already over) falls to polling. */
  async function resumeThenRecover() {
    await chatRef.current.resumeStream().catch(() => {});
    await recover();
  }

  // Opened on a dangling user message: resume, then recover. Deferred, so a StrictMode remount can't abort it.
  const resumed = useRef(false);
  useEffect(() => {
    if (!dangling || resumed.current) return;
    const timer = setTimeout(() => {
      resumed.current = true;
      void resumeThenRecover();
    }, 0);
    return () => clearTimeout(timer);
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { status } = chat;

  // A new chat shows up in the sidebar as soon as its first reply starts.
  const announced = useRef(initialMessages.length > 0);
  useEffect(() => {
    if (status === "streaming" && !announced.current) {
      announced.current = true;
      void mutate(HISTORY_KEY);
    }
  }, [status]);

  // Poll recovery: while a turn streams, check the stored history; adopt the reply if it landed without us.
  useEffect(() => {
    if (status !== "submitted" && status !== "streaming") return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      const stored = await loadMessages(chatId);
      if (cancelled) return;
      if (stored && hasReplyTo(stored.messages, turn.pending())) {
        await chatRef.current.stop();
        chatRef.current.setMessages(stored.messages);
        void mutate(HISTORY_KEY);
        return;
      }
      timer = setTimeout(tick, POLL_EVERY_MS);
    };
    timer = setTimeout(tick, POLL_FIRST_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, chatId, turn]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    lastErrorRef.current = null;
    await chatRef.current.sendMessage({ text: t, metadata: { createdAt: new Date().toISOString() } });
  }, []);

  /** Stops the live run on the server (its real run id, asked for if unknown) and the local stream. */
  const stop = useCallback(async () => {
    const local = chatRef.current.stop();
    const runId = turn.run() ?? (await loadMessages(chatId))?.activeTurn?.runId ?? null;
    if (runId) {
      void fetch("/api/chat/stop", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, runId }),
      }).catch(() => {});
    }
    await local;
  }, [chatId, turn]);

  /** A user-initiated retry: always a new message id (the old one may already have its reply). */
  const retry = useCallback(async () => {
    const current = chatRef.current;
    const lastUser = [...current.messages].reverse().find((m) => m.role === "user");
    const text = textOf(lastUser);
    if (!text) return;
    // Refused by the server before the turn started: that message was never stored.
    if (lastErrorRef.current instanceof ChatRequestError && lastUser) {
      current.setMessages((ms) => ms.filter((m) => m.id !== lastUser.id));
    }
    current.clearError();
    await send(text);
  }, [send]);

  const err = chat.error;
  const conflict = err instanceof ChatTurnActiveError || err instanceof ChatTurnCompleteError;
  const errorText = err && !conflict ? friendlyError(err) : null;
  // A refused message is back in the composer: edit and send it again rather than retrying as is.
  const canRetry = errorText !== null && !restoresDraft(err);
  // While recovering, the view reads as waiting on the reply.
  const viewStatus = recovering && status !== "streaming" && status !== "submitted" ? "submitted" : status;

  return { messages: chat.messages, status: viewStatus, errorText, canRetry, send, stop, retry };
}
