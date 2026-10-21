"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";
import { mutate } from "swr";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { chatFetch, ChatRequestError, ChatTurnActiveError, ChatTurnCompleteError } from "./chat-fetch";

export type ChatSelections = {
  selectedKnowledgeBaseIds: string[];
  selectedWritingStyleId: string | null;
  webSearchEnabled: boolean;
};

type StoredMessages = { messages: ChatUIMessage[]; activeTurn: { runId: string; requestMessageId: string | null } | null };

export const HISTORY_KEY = "/api/history";
const POLL_FIRST_MS = 15_000;
const POLL_EVERY_MS = 10_000;
export const TURN_ACTIVE_TOAST = "This chat is still finishing its last reply.";

async function loadMessages(chatId: string): Promise<StoredMessages | null> {
  try {
    const res = await fetch(`/api/chat/${encodeURIComponent(chatId)}/messages`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as StoredMessages) : null;
  } catch {
    return null;
  }
}

/** The stored history holds an assistant reply to the user message `requestId`. */
function hasReplyTo(messages: ChatUIMessage[], requestId: string | null): boolean {
  if (!requestId) return false;
  const at = messages.findIndex((m) => m.id === requestId && m.role === "user");
  return at !== -1 && messages.slice(at + 1).some((m) => m.role === "assistant");
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

  const chat = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    generateId: () => crypto.randomUUID(),
    resume: initialMessages.at(-1)?.role === "user",
    throttle: 50,
    onFinish: () => {
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
        dropRefused();
        void (async () => {
          await chatRef.current.resumeStream().catch(() => {});
          await syncFromServer();
        })();
      } else if (err instanceof ChatTurnCompleteError) {
        void syncFromServer();
      }
    },
  });
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  });

  /** Removes the optimistic user message of a refused send and hands its text back. */
  function dropRefused() {
    const id = turn.pending();
    const current = chatRef.current;
    const refused = current.messages.find((m) => m.id === id && m.role === "user");
    if (!refused) return;
    current.setMessages((ms) => ms.filter((m) => m.id !== id));
    callbacks.current.onRestoreDraft?.(textOf(refused));
    turn.clearPending();
  }

  async function syncFromServer() {
    const stored = await loadMessages(chatId);
    if (stored) chatRef.current.setMessages(stored.messages);
    void mutate(HISTORY_KEY);
  }

  const { status } = chat;

  // A new chat shows up in the sidebar as soon as its first reply starts.
  const announced = useRef(initialMessages.length > 0);
  useEffect(() => {
    if (status === "streaming" && !announced.current) {
      announced.current = true;
      void mutate(HISTORY_KEY);
    }
  }, [status]);

  // Poll recovery: while a turn runs, check the stored history; adopt the reply if it landed without us.
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

  // Opened on a dangling user message and nothing to resume here (204): the reply may still be saving.
  const settled = useRef(false);
  useEffect(() => {
    if (status !== "ready" || settled.current) return;
    if (chat.messages.at(-1)?.role !== "user" || initialMessages.at(-1)?.role !== "user") return;
    settled.current = true;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const stored = await loadMessages(chatId);
      if (stored && hasReplyTo(stored.messages, turn.pending())) chatRef.current.setMessages(stored.messages);
      else if (++tries < 5) timer = setTimeout(check, 1000);
    };
    timer = setTimeout(check, 300);
    return () => clearTimeout(timer);
  }, [status, chat.messages, chatId, initialMessages, turn]);

  const send = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    lastErrorRef.current = null;
    await chatRef.current.sendMessage({ text: t, metadata: { createdAt: new Date().toISOString() } });
  }, []);

  const stop = useCallback(async () => {
    const runId = turn.run();
    if (runId) {
      void fetch("/api/chat/stop", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, runId }),
      }).catch(() => {});
    }
    await chatRef.current.stop();
  }, [chatId, turn]);

  /** A user-initiated retry: always a new message id (the old one may already have its reply). */
  const retry = useCallback(async () => {
    const current = chatRef.current;
    const lastUser = [...current.messages].reverse().find((m) => m.role === "user");
    const text = textOf(lastUser);
    if (!text) return;
    // Refused before the turn started: that message was never stored, so it shouldn't stay on screen.
    if (lastErrorRef.current instanceof ChatRequestError && lastUser) {
      current.setMessages((ms) => ms.filter((m) => m.id !== lastUser.id));
    }
    current.clearError();
    await send(text);
  }, [send]);

  const errorText =
    chat.error && !(chat.error instanceof ChatTurnActiveError) && !(chat.error instanceof ChatTurnCompleteError)
      ? chat.error instanceof ChatRequestError
        ? chat.error.message
        : chat.error.message || "Something went wrong while answering. Try again."
      : null;

  return { messages: chat.messages, status, errorText, send, stop, retry };
}
