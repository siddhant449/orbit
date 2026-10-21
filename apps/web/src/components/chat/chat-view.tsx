"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useLenis } from "lenis/react";
import { SquarePen } from "lucide-react";
import { toast } from "sonner";
import { toolLabel, type ChatUIMessage, type PanelDoc } from "@brandloop/agent/client";
import { Button, useMediaQuery } from "@brandloop/ui";
import { PostsIcon } from "@brandloop/ui/icons";
import type { VoiceOption } from "@/components/home/voice-picker";
import { ChatComposer, type ComposerRect } from "./chat-composer";
import type { KnowledgeChoice } from "./knowledge-picker";
import { MessageList } from "./message-list";
import { toolNameOf, toolStateOf, type ToolPartLike } from "./tool-row";
import { HISTORY_KEY } from "./history-key";
import { useChatSession } from "./use-chat-session";
import { DESKTOP_PANEL, DocumentPanel, DocumentPanelContext } from "./document-panel";
import { QuickLinkChips } from "./quick-link-chips";
import { useDocument } from "./use-document";

export const SAVING_FIRST = "Saving your edit first.";

type History = { chats: { id: string; title: string }[] };
const fetchJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/**
 * What a screen reader hears: state changes only, never every token. Errors are left to their own alert, and a
 * reply loaded with the page isn't announced as new.
 */
function liveStatus(messages: ChatUIMessage[], status: string, initialIds: ReadonlySet<string>) {
  const last = messages.at(-1);
  // A chat opened while its reply is still being written isn't announced as a fresh send.
  if (status === "submitted") return last && initialIds.has(last.id) ? "" : "Sent. Waiting for the reply.";
  if (status === "streaming" && last?.role === "assistant") {
    const active = (last.parts as ToolPartLike[]).filter((p) => p.type.startsWith("tool-") && toolStateOf(p) === "active").at(-1);
    return active ? `${toolLabel(toolNameOf(active), "active")}.` : "Writing the reply.";
  }
  if (status === "ready" && last?.role === "assistant" && !initialIds.has(last.id)) return "Reply ready.";
  return "";
}

export function ChatView({
  chatId,
  title,
  initialMessages,
  voices,
  selectedVoiceId,
  initialText,
  fromRect,
  onFirstFinish,
  initialDocument = null,
}: {
  chatId: string;
  title: string;
  initialMessages: ChatUIMessage[];
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  /** Sent once on mount (the chat started on the home composer). */
  initialText?: string;
  fromRect?: ComposerRect | null;
  onFirstFinish?: () => void;
  /** The chat's post, loaded with the page. */
  initialDocument?: PanelDoc | null;
}) {
  const [draft, setDraft] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeChoice[]>([]);
  const [webSearch, setWebSearch] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialIds = useMemo(() => new Set(initialMessages.map((m) => m.id)), [initialMessages]);

  const post = useDocument(initialDocument);
  const desktop = useMediaQuery(DESKTOP_PANEL);
  const { messages, status, errorText, canRetry, notice, send, sendQuickLink, stop, retry } = useChatSession({
    chatId,
    initialMessages,
    selections: {
      selectedKnowledgeBaseIds: knowledge.map((k) => k.id),
      selectedWritingStyleId: selectedVoiceId,
      webSearchEnabled: webSearch,
    },
    onRestoreDraft: (text) => setDraft((d) => d || text),
    onFirstFinish,
    onData: post.onData,
    onDocument: post.setDocument,
    documentContext: post.context,
  });
  const busy = status === "submitted" || status === "streaming";

  // The title arrives with the history list (it is written just after the first reply).
  const { data: history } = useSWR<History>(HISTORY_KEY, fetchJson);
  const liveTitle = history?.chats.find((c) => c.id === chatId)?.title ?? title;

  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || !initialText) return;
    // Deferred: a StrictMode remount stops the chat once right after mount, which would abort this send.
    const timer = setTimeout(() => {
      sent.current = true;
      void send(initialText);
      inputRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [initialText, send]);

  // Follow the reply while the reader is at the bottom; a send always jumps there.
  const lenis = useLenis();
  const endRef = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const scroller = endRef.current?.closest<HTMLElement>(".lenis") ?? null;
    if (!scroller) return;
    const onScroll = () => {
      pinned.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!pinned.current || !endRef.current) return;
    if (lenis) lenis.scrollTo(endRef.current, { immediate: true, force: true });
    else endRef.current.scrollIntoView({ block: "end" });
  }, [messages, status, lenis]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    // The reply must see the edit, so a send waits for its save.
    if (post.saving) {
      toast(SAVING_FIRST);
      return;
    }
    setDraft("");
    pinned.current = true;
    void send(text);
  }

  function quickLink(key: string, prompt: string) {
    if (busy) return;
    if (post.saving) {
      toast(SAVING_FIRST);
      return;
    }
    pinned.current = true;
    void sendQuickLink(key, prompt);
  }

  const live = liveStatus(messages, status, initialIds);
  const hasPost = Boolean(post.state.doc && post.state.doc.version > 0);
  const panelShown = post.state.open && desktop;

  return (
    <DocumentPanelContext.Provider value={post}>
    <div className="flex min-h-full" data-document-host="">
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 bg-surface px-6">
        <h1 className="type-title-2 flex min-w-0 items-center gap-3 focus-visible:outline-none">
          <span aria-hidden="true" className="rule-draw rule-draw--y h-5 w-px shrink-0 bg-keyline" />
          <span className="truncate">{liveTitle}</span>
        </h1>
        <div className="flex shrink-0 items-center gap-3">
          {busy && (
            <span className="type-caption flex items-center gap-2 text-ink-muted">
              <span aria-hidden="true" className="live-dot" />
              Writing
            </span>
          )}
          {hasPost && !panelShown && (
            <Button variant="secondary" size="sm" onClick={post.open} aria-haspopup="dialog">
              <PostsIcon />
              Open post
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/" aria-label="New chat">
              <SquarePen aria-hidden="true" />
              <span className="hidden sm:inline">New chat</span>
            </Link>
          </Button>
        </div>
        <span aria-hidden="true" className="rule-draw absolute inset-x-0 bottom-0 h-px bg-line" />
      </header>

      <div className="mx-auto w-full max-w-[768px] flex-1 px-4 pb-10 pt-10 sm:px-6">
        <MessageList
          messages={messages}
          status={status}
          initialIds={initialIds}
          errorText={errorText}
          onRetry={canRetry ? () => void retry() : undefined}
          notice={notice}
        />
        <div ref={endRef} aria-hidden="true" className="h-px" />
      </div>

      <div className="sticky bottom-0 z-10 bg-surface">
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-line" />
        <div className="mx-auto w-full max-w-[768px] px-4 pb-4 pt-4 sm:px-6">
          {hasPost && <QuickLinkChips className="mb-3" onPick={quickLink} disabled={busy} />}
          <ChatComposer
            value={draft}
            onValueChange={setDraft}
            onSend={submit}
            onStop={() => void stop()}
            busy={busy}
            voices={voices}
            selectedVoiceId={selectedVoiceId}
            knowledge={knowledge}
            onKnowledgeChange={setKnowledge}
            webSearch={webSearch}
            onWebSearchChange={setWebSearch}
            fromRect={fromRect}
            inputRef={inputRef}
          />
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-post-status>
        {post.announcement}
      </p>
    </div>
    <DocumentPanel ctl={post} busy={busy} />
    </div>
    </DocumentPanelContext.Provider>
  );
}
