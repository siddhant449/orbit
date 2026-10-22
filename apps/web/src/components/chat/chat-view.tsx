"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import useSWR from "swr";
import { ArrowDown, SquarePen } from "lucide-react";
import { toast } from "sonner";
import { swapOpening, toolLabel, type ChatUIMessage, type HookCard, type PanelDoc } from "@brandloop/agent/client";
import { Button, useMediaQuery } from "@brandloop/ui";
import { PostsIcon } from "@brandloop/ui/icons";
import type { VoiceOption } from "@/components/home/voice-picker";
import { useAiModel } from "./model-picker";
import { ChatComposer, type ComposerRect } from "./chat-composer";
import type { KnowledgeChoice } from "./knowledge-picker";
import { MessageList } from "./message-list";
import { toolNameOf, toolStateOf, type ToolPartLike } from "./tool-row";
import { distanceFromBottom, followReducer, initialFollow, type FollowEvent } from "./scroll-follow";
import { HISTORY_KEY } from "./history-key";
import { useChatSession } from "./use-chat-session";
import { DESKTOP_PANEL, DocumentPanel, DocumentPanelContext } from "./document-panel";
import { HookActionsContext } from "./hook-cards";
import { QuickLinkChips } from "./quick-link-chips";
import { useDocument } from "./use-document";

export const SAVING_FIRST = "Saving your edit first.";

type History = { chats: { id: string; title: string }[] };
const fetchJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

/**
 * What a screen reader hears: state changes only, never every token. Errors are left to their own alert, and a
 * reply loaded with the page isn't announced as new.
 */
export function liveStatus(messages: ChatUIMessage[], status: string, initialIds: ReadonlySet<string>) {
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

const noSubscribe = () => () => {};

/** "Today · 3:45 PM", "Yesterday · …", "Oct 21 · …": when the chat last moved. */
function stamp(iso: string | undefined, now = new Date()): string {
  const at = iso ? new Date(iso) : now;
  if (Number.isNaN(at.getTime())) return "";
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(at)) / 86_400_000);
  const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : at.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${label} · ${time}`;
}

/**
 * Height the on-screen keyboard covers below the layout (phones): the dock lifts by it, less the tab bar the
 * keyboard already hides, so the composer stays in view while typing.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const tabbar = document.querySelector<HTMLElement>('nav[aria-label="Primary"]')?.offsetHeight ?? 0;
      setInset(covered > 80 ? Math.max(0, Math.round(covered - tabbar)) : 0);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
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
  const aiModel = useAiModel();
  const [formatId, setFormatId] = useState<string | null>(null);
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
      model: aiModel.current,
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

  // The thread follows the newest words unless the reader has scrolled up; then a "Jump to latest" pill shows.
  const scrollerRef = useRef<HTMLDivElement>(null);
  // The thread keeps a stable scrollbar gutter; the header and the composer dock add the same width on the right so
  // the bubbles, the header actions and the composer share one right edge (0 with overlay scrollbars).
  const [scrollbar, setScrollbar] = useState(0);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setScrollbar(el.offsetWidth - el.clientWidth);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);
  // The ref is the truth for scroll handlers and the resize observer; the state renders the pill.
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
  // Open at the newest message; then stay pinned while following, whatever grows (text, steps, cards).
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
  function onThreadScroll() {
    const el = scrollerRef.current;
    if (el) dispatchFollow({ type: "scroll", distance: distanceFromBottom(el) });
  }
  function jumpToLatest() {
    dispatchFollow({ type: "jump" });
    toBottom();
  }
  const keyboard = useKeyboardInset();

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    // The reply must see the edit, so a send waits for its save.
    if (post.saving) {
      toast(SAVING_FIRST);
      return;
    }
    setDraft("");
    jumpToLatest();
    // A picked format applies to this one message: it rides in the request body and the chip clears.
    void send(text, { formatId });
    setFormatId(null);
  }

  function quickLink(key: string, prompt: string) {
    if (busy) return;
    if (post.saving) {
      toast(SAVING_FIRST);
      return;
    }
    jumpToLatest();
    void sendQuickLink(key, prompt);
  }

  /** "Use this hook": with a post open the opening is swapped and saved as a new version; otherwise a draft starts from it. */
  async function useHook(card: HookCard) {
    if (busy) return;
    if (post.saving) {
      toast(SAVING_FIRST);
      return;
    }
    const doc = post.state.doc;
    if (doc && doc.version > 0) {
      const res = await post.save(swapOpening(doc.text, card.text), doc.version);
      if (res.ok) toast(`Opening swapped. Saved as version ${res.version}.`);
      else if ("conflict" in res) toast("This post changed. Reloaded the latest version; pick the hook again.");
      else toast(res.error);
      return;
    }
    jumpToLatest();
    void sendQuickLink("use-hook", `Use this opening line: "${card.text}"`);
  }

  const live = liveStatus(messages, status, initialIds);
  const hasPost = Boolean(post.state.doc && post.state.doc.version > 0);
  const panelShown = post.state.open && desktop;

  const lastAt = messages.at(-1)?.metadata?.createdAt;
  // Client-only: the server's clock and time zone aren't the reader's.
  const when = useSyncExternalStore(noSubscribe, () => stamp(lastAt), () => "");

  return (
    <DocumentPanelContext.Provider value={post}>
    <HookActionsContext.Provider value={{ useHook: (c) => void useHook(c), disabled: busy }}>
    <div className="flex h-full min-h-0" data-document-host="" style={{ "--thread-scrollbar": `${scrollbar}px` } as CSSProperties}>
    <div className="relative flex min-w-0 flex-1 flex-col">
      <header className="relative z-10 flex min-h-14 shrink-0 items-center justify-between gap-3 py-3 pl-(--gutter) pr-[calc(var(--gutter)+var(--thread-scrollbar,0px))] md:min-h-(--header-row) md:py-[18px]">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="min-w-0 truncate text-[15px] font-medium text-text focus-visible:outline-none">{liveTitle}</h1>
          {when && <span className="hidden shrink-0 text-xs text-text-3 sm:inline">{when}</span>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {busy && (
            <span className="mr-1.5 hidden items-center gap-2 text-xs text-text-3 sm:flex">
              <span aria-hidden="true" className="steps__mark--active steps__mark" />
              Writing
            </span>
          )}
          {hasPost && !panelShown && (
            <Button variant="secondary" size="sm" onClick={post.open} aria-haspopup="dialog" className="h-8 border-line-2 px-3 text-[13px] max-md:h-11 max-md:min-w-11">
              <PostsIcon />
              Open post
            </Button>
          )}
          <Button asChild variant="secondary" size="sm" className="h-8 border-line-2 px-3 text-[13px] max-md:h-11 max-md:min-w-11">
            <Link href="/" aria-label="New chat">
              <SquarePen aria-hidden="true" />
              <span className="hidden sm:inline">New chat</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollerRef}
          onScroll={onThreadScroll}
          data-lenis-prevent
          data-thread-scroller=""
          className="thread-scroller absolute inset-0 overflow-y-auto"
        >
          <div ref={contentRef} className="px-(--gutter) pb-8 pt-3 sm:pb-10">
            <div className="mx-auto w-full max-w-[780px]">
            <MessageList
              messages={messages}
              status={status}
              initialIds={initialIds}
              errorText={errorText}
              onRetry={canRetry ? () => void retry() : undefined}
              notice={notice}
              followUps={hasPost ? <QuickLinkChips onPick={quickLink} disabled={busy} /> : undefined}
            />
            </div>
          </div>
        </div>
        {!follow.following && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <button
              type="button"
              onClick={jumpToLatest}
              className="jump-latest orbit-transition pointer-events-auto inline-flex h-9 items-center gap-2 rounded-pill border border-line-3 bg-panel px-3.5 text-[13px] font-medium text-text shadow-elevation-composer hover:border-inverse hover:bg-inverse hover:text-on-inverse focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <ArrowDown aria-hidden="true" className="size-3.5" />
              {follow.unseen ? "New reply below" : "Jump to latest"}
            </button>
          </div>
        )}
      </div>

      <div
        className="relative z-10 shrink-0 pl-(--gutter) pr-[calc(var(--gutter)+var(--thread-scrollbar,0px))] pt-2 md:pb-[max(24px,env(safe-area-inset-bottom))]"
        style={{ paddingBottom: keyboard ? keyboard + 12 : undefined }}
        data-composer-dock=""
      >
        <div className="mx-auto w-full max-w-[780px] pb-3 sm:pl-11 md:pb-0">
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
            formatId={formatId}
            onFormatChange={setFormatId}
            fromRect={fromRect}
            inputRef={inputRef}
            model={{ current: aiModel.current, info: aiModel.info, onChoose: (id) => void aiModel.choose(id) }}
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
    </HookActionsContext.Provider>
    </DocumentPanelContext.Provider>
  );
}
