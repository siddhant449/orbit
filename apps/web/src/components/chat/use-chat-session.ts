"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { toast } from "sonner";
import { mutate } from "swr";
import type { ChatUIMessage, PanelDoc } from "@brandloop/agent/client";
import { ChatTurnActiveError, ChatTurnCompleteError } from "./chat-fetch";
import {
  dropsOnRetry,
  friendlyError,
  hasReplyTo,
  loadOutcome,
  pollUntilIdle,
  recoveryMessage,
  restoresDraft,
  type LoadResult,
} from "./chat-logic";
import { HISTORY_KEY } from "./history-key";
import { handleTurnActive, TurnState, type ChatSelections } from "./turn-state";

export type { ChatSelections } from "./turn-state";

const POLL_FIRST_MS = 15_000;
const POLL_EVERY_MS = 10_000;
export const TURN_ACTIVE_TOAST = "This chat is still finishing its last reply.";
const STOP_FAILED = "The reply couldn't be stopped. Try again.";

async function loadMessages(chatId: string, signal?: AbortSignal): Promise<LoadResult<ChatUIMessage>> {
  try {
    const res = await fetch(`/api/chat/${encodeURIComponent(chatId)}/messages`, { cache: "no-store", signal });
    if (!res.ok) return loadOutcome(res.status);
    return { ok: true, chat: await res.json() };
  } catch {
    return { ok: false, terminal: null };
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

/** What a send tells the server about the open post, so "make it shorter" means this version. */
export type DocumentContext = { id: string; version: number };

/** A stream data part, as `useChat`'s `onData` hands it over. */
export type StreamDataPart = { type: string; data: unknown };

/** A notice under the conversation that isn't a failed send: recovery ended, or Stop failed. */
export type ChatNotice = { text: string; reload?: boolean };

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
  onData,
  onDocument,
  documentContext,
}: {
  chatId: string;
  initialMessages: ChatUIMessage[];
  selections: ChatSelections;
  /** A refused send hands its text back to the composer. */
  onRestoreDraft?: (text: string) => void;
  /** Runs once, after the first turn of this view ends. */
  onFirstFinish?: () => void;
  /** Every `data-*` part as it streams in (transient ones included). */
  onData?: (part: StreamDataPart) => void;
  /** The chat's post as the stored conversation has it, whenever recovery adopts that conversation. */
  onDocument?: (doc: PanelDoc | null) => void;
  /** Sent with every message while a post is open. */
  documentContext?: DocumentContext | null;
}) {
  // `pendingId`: the user message the current request answers, polled for and dropped again when refused.
  const [turn] = useState(() => new TurnState(initialMessages.at(-1)?.role === "user" ? initialMessages.at(-1)!.id : null));
  const [transport] = useState(() => turn.transport());
  const lastErrorRef = useRef<Error | null>(null);
  const callbacks = useRef({ onRestoreDraft, onFirstFinish, onData, onDocument });
  const docContext = useRef(documentContext ?? null);
  const finishedOnce = useRef(false);
  useEffect(() => {
    turn.update(selections);
    callbacks.current = { onRestoreDraft, onFirstFinish, onData, onDocument };
    docContext.current = documentContext ?? null;
  });

  const dangling = initialMessages.at(-1)?.role === "user";
  const chat = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    generateId: () => crypto.randomUUID(),
    throttle: 50,
    onData: (part) => callbacks.current.onData?.(part as StreamDataPart),
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
        const current = chatRef.current;
        const out = handleTurnActive(turn, current.messages, err.activeTurn);
        if (out.messages !== current.messages) current.setMessages(out.messages);
        if (out.draft) callbacks.current.onRestoreDraft?.(out.draft);
        void resumeThenRecover();
      } else if (err instanceof ChatTurnCompleteError) {
        void recover();
      } else if (restoresDraft(err)) {
        dropRefused();
      }
    },
  });
  const chatRef = useRef(chat);
  useEffect(() => {
    chatRef.current = chat;
  });

  /** A request refused before its turn started (4xx): the message wasn't stored, so its text goes back. */
  function dropRefused() {
    const id = turn.pending();
    const current = chatRef.current;
    const refused = current.messages.find((m) => m.id === id && m.role === "user");
    if (!refused) return;
    current.setMessages((ms) => ms.filter((m) => m.id !== refused.id));
    const text = textOf(refused);
    if (text) callbacks.current.onRestoreDraft?.(text);
    turn.clearPending();
  }

  // Recovery: poll the stored chat (with backoff, up to six minutes) until no turn runs, then adopt it.
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState<ChatNotice | null>(null);
  const recoveryRef = useRef<AbortController | null>(null);
  // A different chat (or unmount) ends any recovery still running for this one.
  useEffect(() => () => recoveryRef.current?.abort(), [chatId]);

  async function sync() {
    const res = await loadMessages(chatId);
    if (res.ok) adopt(res.chat);
    void mutate(HISTORY_KEY);
  }

  function adopt(stored: { messages: ChatUIMessage[]; document?: PanelDoc | null }) {
    chatRef.current.setMessages(stored.messages);
    if (stored.document !== undefined) callbacks.current.onDocument?.(stored.document);
  }

  async function recover() {
    recoveryRef.current?.abort();
    const ctrl = new AbortController();
    recoveryRef.current = ctrl;
    setRecovering(true);
    setNotice(null);
    const result = await pollUntilIdle({
      load: () => loadMessages(chatId, ctrl.signal),
      onActive: (t) => turn.adopt(t),
      sleep: (ms) => sleep(ms, ctrl.signal),
      signal: ctrl.signal,
    });
    if (result.status === "aborted") return;
    setRecovering(false);
    turn.finished();
    if (result.status === "idle") adopt(result.chat);
    const text = recoveryMessage(result);
    if (text) setNotice({ text, reload: result.status === "timeout" });
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
      const res = await loadMessages(chatId);
      if (cancelled) return;
      if (res.ok && hasReplyTo(res.chat.messages, turn.pending())) {
        await chatRef.current.stop();
        adopt(res.chat);
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
    const ctx = docContext.current;
    await chatRef.current.sendMessage(
      { text: t, metadata: { createdAt: new Date().toISOString() } },
      ctx ? { body: { documentContext: ctx } } : undefined,
    );
  }, []);

  /** A quick link: a hidden user message that names its key, so the server runs that action on the post. */
  const sendQuickLink = useCallback(async (key: string, prompt: string) => {
    lastErrorRef.current = null;
    const ctx = docContext.current;
    await chatRef.current.sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: prompt }],
        metadata: { createdAt: new Date().toISOString(), hideInUI: true, quickLinkKey: key },
      },
      { body: { quickLinkKey: key, uiAction: "quick-link", ...(ctx ? { documentContext: ctx } : {}) } },
    );
  }, []);

  /**
   * Stops the live run on the server (its real run id, asked for if unknown) and the local stream. Once the
   * server confirms, any recovery poll ends and the stored chat is adopted (the partial reply lands a moment later).
   */
  const stop = useCallback(async () => {
    setNotice(null);
    const local = chatRef.current.stop();
    let runId = turn.run();
    if (!runId) {
      const res = await loadMessages(chatId);
      runId = res.ok ? (res.chat.activeTurn?.runId ?? null) : null;
    }
    if (runId) {
      const ok = await fetch("/api/chat/stop", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId, runId }),
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (!ok) setNotice({ text: STOP_FAILED });
      else if (recoveryRef.current && !recoveryRef.current.signal.aborted) {
        recoveryRef.current.abort();
        setRecovering(false);
        turn.finished();
        await sync();
        setTimeout(() => void sync(), 1500);
      }
    }
    await local;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, turn]);

  /** A user-initiated retry: always a new message id (the old one may already have its reply). */
  const retry = useCallback(async () => {
    const current = chatRef.current;
    const lastUser = [...current.messages].reverse().find((m) => m.role === "user");
    const text = textOf(lastUser);
    if (!text) return;
    // Refused, or lost on the network: that message may never have been stored, so a new one replaces it.
    if (dropsOnRetry(lastErrorRef.current) && lastUser) {
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

  return { messages: chat.messages, status: viewStatus, errorText, canRetry, notice, send, sendQuickLink, stop, retry };
}
