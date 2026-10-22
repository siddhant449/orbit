"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ChatUIMessage } from "@brandloop/agent/client";
import { Button, LogoMark } from "@brandloop/ui";
import { CloseIcon } from "@brandloop/ui/icons";
import type { VoiceOption } from "@/components/home/voice-picker";
import { ChatComposer } from "@/components/chat/chat-composer";
import { liveStatus, SAVING_FIRST } from "@/components/chat/chat-view";
import type { KnowledgeChoice } from "@/components/chat/knowledge-picker";
import { MessageList } from "@/components/chat/message-list";
import { QuickLinkChips } from "@/components/chat/quick-link-chips";
import { distanceFromBottom, followReducer, initialFollow, type FollowEvent } from "@/components/chat/scroll-follow";
import { useChatSession } from "@/components/chat/use-chat-session";
import type { DocumentContext } from "@/components/chat/use-chat-session";
import type { DocumentController } from "@/components/chat/use-document";

/**
 * The post's chat, in the editor's 400 px column (screens.md B3): the same thread, chips and composer as `/chat/:id`,
 * compact. A post whose chat was deleted gets a new one on the first send (`POST /api/documents/:id/chat`).
 */
export function PostChat({
  documentId,
  chatId,
  linked,
  initialMessages,
  voices,
  selectedVoiceId,
  post,
  documentContext,
  beforeSend,
  onBusyChange,
  onClose,
  onCollapse,
}: {
  documentId: string;
  chatId: string;
  /** False when the post has no live chat yet: the first send links `chatId` to it. */
  linked: boolean;
  initialMessages: ChatUIMessage[];
  voices: VoiceOption[];
  selectedVoiceId: string | null;
  post: DocumentController;
  /** The version the editor's text is based on, sent with each message. */
  documentContext: DocumentContext | null;
  /** Saves pending edits first; false holds the send (a save is running or must be resolved). */
  beforeSend: () => boolean;
  onBusyChange: (busy: boolean) => void;
  /** Phones: closes the chat sheet. */
  onClose?: () => void;
  onCollapse?: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeChoice[]>([]);
  const [webSearch, setWebSearch] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initialIds = useMemo(() => new Set(initialMessages.map((m) => m.id)), [initialMessages]);
  const linkedRef = useRef(linked);

  const { messages, status, errorText, canRetry, notice, send, sendQuickLink, stop, retry } = useChatSession({
    chatId,
    initialMessages,
    selections: {
      selectedKnowledgeBaseIds: knowledge.map((k) => k.id),
      selectedWritingStyleId: selectedVoiceId,
      webSearchEnabled: webSearch,
    },
    onRestoreDraft: (text) => setDraft((d) => d || text),
    onData: post.onData,
    onDocument: post.setDocument,
    documentContext,
  });
  const busy = status === "submitted" || status === "streaming";
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  /** Links a chat to the post before its first message. False when the send must not go ahead. */
  const ensureLinked = useCallback(async (): Promise<boolean> => {
    if (linkedRef.current) return true;
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(documentId)}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { chatId: string };
      if (body.chatId !== chatId) {
        // Another tab gave the post a chat first: load that one.
        toast("This post already has a chat. Loading it.");
        router.refresh();
        return false;
      }
      linkedRef.current = true;
      return true;
    } catch {
      toast("The chat couldn't be started. Try again.");
      return false;
    }
  }, [chatId, documentId, router]);

  // Thread follow (same rules as the chat page): pinned to the newest words unless the reader scrolled up.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(initialFollow);
  const [follow, setFollow] = useState(initialFollow);
  const dispatchFollow = useCallback((e: FollowEvent) => {
    const next = followReducer(followRef.current, e);
    if (next === followRef.current) return;
    followRef.current = next;
    setFollow(next);
  }, []);
  const toBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => {
    toBottom();
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (followRef.current.following) toBottom();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [toBottom]);
  useEffect(() => {
    if (followRef.current.following) toBottom();
    else dispatchFollow({ type: "content" });
  }, [messages, status, toBottom, dispatchFollow]);
  function jumpToLatest() {
    dispatchFollow({ type: "jump" });
    toBottom();
  }

  function ready(): boolean {
    if (busy) return false;
    if (!beforeSend()) {
      toast(SAVING_FIRST);
      return false;
    }
    return true;
  }

  async function submit() {
    const text = draft.trim();
    if (!text || !ready()) return;
    setDraft("");
    if (!(await ensureLinked())) {
      setDraft(text);
      return;
    }
    jumpToLatest();
    void send(text);
  }

  async function quickLink(key: string, prompt: string) {
    if (!ready() || !(await ensureLinked())) return;
    jumpToLatest();
    void sendQuickLink(key, prompt);
  }

  const live = liveStatus(messages, status, initialIds);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-(--header-row) shrink-0 items-center justify-between gap-3 px-5">
        <h2 id="post-chat-title" className="flex items-center gap-2.5 text-[13px] font-medium text-text-2">
          <Link href="/posts" aria-label="Back to posts" title="Back to posts" className="inline-flex">
            <LogoMark />
          </Link>
          Chat with Orbit
        </h2>
        <div className="flex items-center gap-2">
          {busy && (
            <span className="flex items-center gap-2 text-xs text-text-3">
              <span aria-hidden="true" className="steps__mark steps__mark--active" />
              Writing
            </span>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="size-11 border border-line-3 lg:hidden" onClick={onClose} aria-label="Close chat">
              <CloseIcon />
            </Button>
          )}
          {onCollapse && (
            <Button variant="ghost" size="icon" className="hidden size-8 lg:inline-flex" onClick={onCollapse} aria-label="Hide chat" title="Hide chat">
              <CloseIcon />
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={() => {
            const el = scrollerRef.current;
            if (el) dispatchFollow({ type: "scroll", distance: distanceFromBottom(el) });
          }}
          data-lenis-prevent
          data-thread-scroller=""
          className="thread-scroller post-chat__thread absolute inset-0 overflow-y-auto"
        >
          <div ref={contentRef} className="px-5 pb-6 pt-2">
            {messages.length === 0 ? (
              <p className="pt-2 text-[14px] leading-[1.55] text-text-2">
                Ask Orbit to change anything in this post: sharpen the hook, cut it down, swap the ending. Edits land in the
                editor as a new version.
              </p>
            ) : (
              <MessageList
                messages={messages}
                status={status}
                initialIds={initialIds}
                errorText={errorText}
                onRetry={canRetry ? () => void retry() : undefined}
                notice={notice}
              />
            )}
          </div>
        </div>
        {!follow.following && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={jumpToLatest}
              className="jump-latest orbit-transition pointer-events-auto inline-flex h-9 items-center gap-2 rounded-pill border border-line-3 bg-panel px-3.5 text-[13px] font-medium text-text shadow-elevation-composer hover:border-inverse hover:bg-inverse hover:text-on-inverse"
            >
              {follow.unseen ? "New reply below" : "Jump to latest"}
            </button>
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-3 px-5 pb-5 pt-2">
        <QuickLinkChips onPick={(k, p) => void quickLink(k, p)} disabled={busy} />
        <ChatComposer
          value={draft}
          onValueChange={setDraft}
          onSend={() => void submit()}
          onStop={() => void stop()}
          busy={busy}
          voices={voices}
          selectedVoiceId={selectedVoiceId}
          knowledge={knowledge}
          onKnowledgeChange={setKnowledge}
          webSearch={webSearch}
          onWebSearchChange={setWebSearch}
          inputRef={inputRef}
        />
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {live}
      </p>
    </div>
  );
}
