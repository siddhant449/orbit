"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { Popover, Tooltip } from "radix-ui";
import { toast } from "sonner";
import { charCount, POST_CHAR_LIMIT, type ChatUIMessage, type PanelDoc } from "@brandloop/agent/client";
import { Button, cn, useMediaQuery } from "@brandloop/ui";
import { ChatIcon, ChevronLeftIcon, CopyIcon, PencilIcon } from "@brandloop/ui/icons";
import type { VoiceOption } from "@/components/home/voice-picker";
import { DocumentPanelContext, PostSheet } from "@/components/chat/document-panel";
import { ThreadPlaceContext } from "@/components/chat/thread-context";
import { useDocument } from "@/components/chat/use-document";
import { relativeTime, VersionList } from "@/components/chat/version-list";
import { Autosave, type AutosaveResult, type AutosaveSnapshot, type SaveOptions } from "./autosave";
import { inertOthers } from "./inert-others";
import { EditorToolbar, type PreviewView } from "./editor-toolbar";
import { PostImage } from "./post-image";
import { foldPoint, hookOf } from "./fold";
import { pmText, postExtensions } from "./post-extensions";
import { offsetToPos, posToOffset, textToDoc, toggleLinePrefix } from "./post-format";
import { PostChat } from "./post-chat";
import { readability } from "./readability";

export const DESKTOP_EDITOR = "(min-width: 1024px)";
export const LINKEDIN_HINT = "Connect LinkedIn in Settings → Integrations";
const TITLE_MAX = 120;

const SHEET_WIDTH: Record<PreviewView, number> = { mobile: 400, tablet: 480, desktop: 560, hook: 400 };

export type EditorDoc = PanelDoc & { updatedAt: string };

const CLOCK_MS = 30_000;
/** Late-bound pieces the autosave reaches at call time (never during render). */
class Bridge {
  save: (text: string, expectedVersion: number, opts?: SaveOptions) => Promise<AutosaveResult> = async () => ({
    ok: false,
    error: "Not ready.",
  });
  editor: Editor | null = null;
  version = 0;
  bind(save: Bridge["save"], editor: Editor | null) {
    this.save = save;
    this.editor = editor;
  }
}

/** The page's autosave: saves through the document controller, replaces the editor's text when told to. */
function createAutosave(
  doc: PanelDoc,
  bridge: Bridge,
  setSave: (s: AutosaveSnapshot) => void,
  setSavedAt: (iso: string) => void,
): Autosave {
  bridge.version = doc.version;
  return new Autosave({
    doc,
    save: (t, v, o) => bridge.save(t, v, o),
    onChange: (s) => {
      if (s.version > bridge.version) setSavedAt(new Date().toISOString());
      bridge.version = s.version;
      setSave(s);
    },
    onReplace: (t) => {
      const ed = bridge.editor;
      if (ed && !ed.isDestroyed) replaceText(ed, t);
    },
  });
}

const subscribeClock = (tick: () => void) => {
  const t = setInterval(tick, CLOCK_MS);
  return () => clearInterval(t);
};
// Rounded to the tick, so React sees a stable snapshot between ticks.
const clockNow = () => Math.floor(Date.now() / CLOCK_MS) * CLOCK_MS;

/** Replaces the editor's text without an undo step or an update event (the autosave already knows). */
function replaceText(editor: Editor, text: string) {
  const { state } = editor;
  const before = pmText(state.doc);
  const from = posToOffset(before, state.selection.from);
  const to = posToOffset(before, state.selection.to);
  const content = state.schema.nodeFromJSON(textToDoc(text)).content;
  const tr = state.tr.replaceWith(0, state.doc.content.size, content);
  const a = tr.doc.resolve(offsetToPos(text, Math.min(from, text.length)));
  const b = tr.doc.resolve(offsetToPos(text, Math.min(to, text.length)));
  tr.setSelection(TextSelection.between(a, b));
  tr.setMeta("addToHistory", false).setMeta("preventUpdate", true);
  editor.view.dispatch(tr);
}

function saveLine(s: AutosaveSnapshot, streaming: boolean): string {
  if (streaming) return s.dirty ? "Orbit is writing. Your edit is kept." : "Orbit is writing…";
  switch (s.phase) {
    case "saving":
      return "Saving…";
    case "dirty":
      return "Unsaved changes";
    case "empty":
      return "A post needs some text before it saves.";
    case "error":
      return `Not saved. ${s.error ?? ""}`.trim();
    case "conflict":
      return "Not saved: a newer version exists.";
    default:
      return "Saved";
  }
}

/**
 * Document mode (screens.md B3, p05/p19): the post's chat on the left, the post on its LinkedIn sheet on the right,
 * edited in place. Edits autosave as new versions; versions arriving from the chat land live in a clean editor and
 * raise a keep-mine / use-latest choice over unsaved edits. Schedule and Publish wait for the LinkedIn connection.
 */
export function PostEditorView({
  doc: initialDoc,
  chat,
  voices,
  selectedVoiceId,
}: {
  doc: EditorDoc;
  /** The post's live chat, or `id: null` when it has none (its chat was deleted). */
  chat: { id: string | null; messages: ChatUIMessage[] };
  voices: VoiceOption[];
  selectedVoiceId: string | null;
}) {
  const ctl = useDocument(initialDoc);
  // A post without a chat gets one id per visit, kept across refreshes of this view; the first send links it.
  const [freshChatId] = useState(() => crypto.randomUUID());
  const chatId = chat.id ?? freshChatId;
  const desktop = useMediaQuery(DESKTOP_EDITOR);
  const editorId = useId();
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [view, setView] = useState<PreviewView>("mobile");
  const [savedAt, setSavedAt] = useState(initialDoc.updatedAt);
  const doc = ctl.state.doc ?? initialDoc;
  const streaming = ctl.state.creating || ctl.state.updating;

  // ---- autosave -------------------------------------------------------------------------------------------------
  const [save, setSave] = useState<AutosaveSnapshot | null>(null);
  // One autosave per page, with the bridge it reaches the controller and the editor through at call time.
  const [{ autosave, bridge }] = useState(() => {
    const b = new Bridge();
    return { bridge: b, autosave: createAutosave(initialDoc, b, setSave, setSavedAt) };
  });
  const snap = save ?? autosave.snapshot();
  // Per mount (StrictMode mounts twice): open, and on unmount send the pending edit before closing.
  useEffect(() => {
    autosave.open();
    return () => autosave.close();
  }, [autosave]);

  const editor = useEditor({
    extensions: useMemo(() => postExtensions(), []),
    content: textToDoc(initialDoc.text),
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        id: editorId,
        class: "post-editor__text",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Post text",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: ed }) => autosave.edit(pmText(ed.state.doc)),
  });
  useLayoutEffect(() => {
    bridge.bind(ctl.save, editor);
  }, [bridge, ctl.save, editor]);
  // The text as the editor shows it (typing, streams, replacements), for the counters and the hook view.
  const text = useEditorState({ editor, selector: ({ editor: ed }) => (ed ? pmText(ed.state.doc) : initialDoc.text) }) ?? initialDoc.text;

  const history = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({ canUndo: ed?.can().undo() ?? false, canRedo: ed?.can().redo() ?? false }),
  });

  // The turn ended however it ended: no stream flag outlives it, and a cut-off stream reloads the saved post.
  const wasBusy = useRef(busy);
  const settle = ctl.settle;
  useEffect(() => {
    if (wasBusy.current && !busy) void settle();
    wasBusy.current = busy;
  }, [busy, settle]);

  // While the AI writes: saves hold, a clean editor shows the stream live (read-only), an edited one is left alone.
  useEffect(() => {
    if (!editor) return;
    if (streaming) autosave.pause();
    else autosave.resume();
    editor.setEditable(!(streaming && !autosave.snapshot().dirty) && view !== "hook", false);
  }, [editor, streaming, autosave, view]);

  const docText = ctl.state.doc?.text;
  const docVersion = ctl.state.doc?.version;
  useEffect(() => {
    const d = ctl.state.doc;
    if (!editor || !d || d.id !== initialDoc.id) return;
    if (streaming) {
      if (!autosave.snapshot().dirty && pmText(editor.state.doc) !== d.text) {
        replaceText(editor, d.text);
      }
      return;
    }
    autosave.remote({ id: d.id, version: d.version, text: d.text });
    // A stream that ended without a new version leaves the editor on the autosave's text, never a partial stream.
    if (pmText(editor.state.doc) !== autosave.currentText) {
      replaceText(editor, autosave.currentText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, docText, docVersion, streaming, autosave, initialDoc.id]);

  // Closing the tab or reloading: send the pending edit with keepalive, and warn while it is unsaved.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = autosave.snapshot();
      if (s.dirty || s.phase === "saving") {
        autosave.flush({ keepalive: true });
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [autosave]);

  // ---- conflict choice ------------------------------------------------------------------------------------------
  const keepRef = useRef<HTMLButtonElement>(null);
  const conflictVersion = snap.conflict?.version;
  useEffect(() => {
    if (conflictVersion) requestAnimationFrame(() => keepRef.current?.focus());
  }, [conflictVersion]);

  // ---- actions -------------------------------------------------------------------------------------------------
  /** Pending edits go first: a send, rename or restore must see the saved text. */
  const settled = useCallback((): boolean => {
    const s = autosave.snapshot();
    if (s.phase === "saved") return true;
    if (s.phase === "dirty" || s.phase === "error") autosave.flush();
    return false;
  }, [autosave]);

  function toggleList(kind: "bullet" | "number") {
    if (!editor) return;
    const { state } = editor;
    const t = pmText(state.doc);
    const out = toggleLinePrefix(t, posToOffset(t, state.selection.from), posToOffset(t, state.selection.to), kind);
    if (out.text === t) return;
    const tr = state.tr.replaceWith(0, state.doc.content.size, state.schema.nodeFromJSON(textToDoc(out.text)).content);
    tr.setSelection(TextSelection.between(tr.doc.resolve(offsetToPos(out.text, out.from)), tr.doc.resolve(offsetToPos(out.text, out.to))));
    editor.view.dispatch(tr);
    editor.commands.focus();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Post copied.");
    } catch {
      toast("Copying isn't allowed here. Select the text and copy it instead.");
    }
  }

  async function restore(v: number) {
    if (!settled()) {
      toast("Saving your edit first.");
      return;
    }
    const res = await ctl.restore(v, autosave.snapshot().version);
    if (res.ok) toast(`Restored version ${v} as version ${res.version}.`);
    else if ("conflict" in res) toast("This post changed. Reloaded the latest version.");
    else toast(res.error);
  }

  const [renaming, setRenaming] = useState(false);
  const renameRef = useRef<HTMLButtonElement>(null);
  async function rename(title: string) {
    const next = title.trim();
    if (!next || next === doc.title) return true;
    // Through the autosave: it waits for a save in flight, carries the editor's text and the current version, and
    // moves the base, so the next autosave can't send a stale expectedVersion.
    const res = await autosave.exclusive(async (current, expectedVersion) => {
      try {
        const r = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: current, title: next, expectedVersion }),
        });
        if (r.status === 409) {
          const latest = await ctl.refetch();
          return latest ? { ok: false, conflict: latest } : { ok: false, error: "This post changed. Reload it and try again." };
        }
        if (!r.ok) return { ok: false, error: "The post couldn't be renamed. Try again." };
        const { version } = (await r.json()) as { version: number };
        ctl.onData({ type: "data-document", data: { id: doc.id, title: next, version, text: current } });
        return { ok: true, version };
      } catch {
        return { ok: false, error: "The post couldn't be renamed. Check your connection and try again." };
      }
    });
    if (res.ok) toast("Renamed.");
    else toast("conflict" in res ? "This post changed. Choose which version to keep, then rename it again." : res.error);
    return res.ok;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autosave.flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave]);

  // ---- derived -------------------------------------------------------------------------------------------------
  const { count, over } = charCount(text);
  const read = useMemo(() => readability(text), [text]);
  const fold = foldPoint(text);
  // Client clock only (the server's isn't the reader's); ticks every 30 s.
  const now = useSyncExternalStore(subscribeClock, clockNow, () => 0);
  const updated = now ? relativeTime(savedAt, now) : "";

  // Phones: the chat is a sheet over the editor.
  const chatSheet = !desktop && chatOpen;
  const chatToggleRef = useRef<HTMLButtonElement>(null);
  const closeChat = useCallback(() => {
    setChatOpen(false);
    requestAnimationFrame(() => chatToggleRef.current?.focus());
  }, []);
  const chatRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = chatRef.current;
    if (!chatSheet || !el) return;
    // Everything else (shell header, tab bar, sidebar, the editor) is inert while the sheet covers it.
    const restore = inertOthers(el);
    requestAnimationFrame(() => document.getElementById("chat-composer")?.focus());
    return restore;
  }, [chatSheet]);

  const place = useMemo(() => ({ chatId, inPostEditor: true }), [chatId]);
  const docContext = useMemo(() => ({ id: initialDoc.id, version: snap.version }), [initialDoc.id, snap.version]);
  const line = saveLine(snap, streaming);

  return (
    <ThreadPlaceContext.Provider value={place}>
      <DocumentPanelContext.Provider value={ctl}>
        <Tooltip.Provider delayDuration={200}>
          <div className="post-editor relative flex h-full min-h-0" data-post-editor="">
            <aside
              aria-labelledby="post-chat-title"
              ref={chatRef}
              role={chatSheet ? "dialog" : undefined}
              onKeyDown={(e) => {
                // Escape belongs to the sheet only; a popover opened from it (portalled, so outside it in the DOM)
                // closes itself first.
                if (chatSheet && e.key === "Escape" && !e.defaultPrevented && chatRef.current?.contains(e.target as Node)) {
                  e.stopPropagation();
                  closeChat();
                }
              }}
              aria-modal={chatSheet || undefined}
              data-post-chat=""
              className={cn(
                "post-chat min-h-0 border-line-soft bg-ground",
                "lg:relative lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:border-r",
                chatOpen ? "max-lg:fixed max-lg:inset-0 max-lg:z-[60] max-lg:flex max-lg:flex-col" : "max-lg:hidden",
              )}
            >
              <PostChat
                key={chatId}
                documentId={initialDoc.id}
                chatId={chatId}
                linked={chat.id !== null}
                initialMessages={chat.messages}
                voices={voices}
                selectedVoiceId={selectedVoiceId}
                post={ctl}
                documentContext={docContext}
                beforeSend={settled}
                onBusyChange={setBusy}
                onClose={closeChat}
              />
            </aside>

            <section
              aria-labelledby="post-title"
              data-lenis-prevent
              className="post-editor__main min-w-0 flex-1 overflow-y-auto overscroll-contain"
            >
              <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 px-(--gutter) pb-6 pt-5 lg:pt-[14px]">
                <div className="min-w-0 flex-1 lg:pt-1.5">
                  <div className="mb-2 flex items-center gap-2 lg:hidden">
                    <Button asChild variant="ghost" size="sm" className="-ml-2 px-2">
                      <Link href="/posts">
                        <ChevronLeftIcon />
                        Posts
                      </Link>
                    </Button>
                  </div>
                  {renaming ? (
                    <TitleField
                      initial={doc.title}
                      onDone={async (value) => {
                        if (value === null || (await rename(value))) {
                          setRenaming(false);
                          requestAnimationFrame(() => renameRef.current?.focus());
                        }
                      }}
                    />
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <h1 id="post-title" className="min-w-0 truncate text-[22px] font-medium leading-tight tracking-[-0.01em] text-text">
                        {doc.title}
                      </h1>
                      <Button
                        ref={renameRef}
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-text-3 max-sm:size-11"
                        onClick={() => setRenaming(true)}
                        aria-label="Rename post"
                        title="Rename post"
                      >
                        <PencilIcon />
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-[13px] text-text-3">
                    <span
                      aria-hidden="true"
                      data-save-dot={snap.phase}
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        snap.phase === "saving" || streaming ? "bg-accent-text motion-safe:animate-pulse"
                        : snap.phase === "error" || snap.phase === "conflict" ? "bg-danger"
                        : snap.phase === "saved" ? "bg-text-3"
                        : "bg-accent-text",
                      )}
                    />
                    <span role="status" aria-live="polite" aria-atomic="true" data-save-status={snap.phase} className="text-text-2">
                      {line}
                      {snap.phase === "saved" && !streaming && updated ? <span className="text-text-3"> · {updated}</span> : null}
                    </span>
                    {snap.phase === "error" && (
                      <Button variant="micro" size="sm" onClick={() => autosave.retry()}>
                        Retry
                      </Button>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="text-text-soft">Draft</span>
                    <span aria-hidden="true">·</span>
                    <span data-char-count className={cn("tabular-nums", over ? "text-danger" : "text-text-3")}>
                      {count.toLocaleString("en-US")} / {POST_CHAR_LIMIT.toLocaleString("en-US")}
                      <span className="sr-only"> characters</span>
                    </span>
                    {read && (
                      <span
                        data-readability
                        title={`Flesch-Kincaid grade level, worked out from your text (${read.words} words, ${read.sentences} sentences).`}
                        className="rounded-pill border border-line-4 px-2.5 py-0.5 font-mono text-[11px] text-text-2"
                      >
                        Readability · grade {read.grade}
                      </span>
                    )}
                    <VersionMenu
                      version={snap.version}
                      versions={ctl.versions}
                      error={ctl.versionsError}
                      busy={ctl.saving || busy || streaming}
                      onRestore={(v) => void restore(v)}
                      onRetry={ctl.retryVersions}
                    />
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11">
                  {/* Shown by CSS below 1024 px, so it never flashes in or out on hydration. */}
                  <Button
                    ref={chatToggleRef}
                    variant="secondary"
                    size="md"
                    className="lg:hidden"
                    onClick={() => setChatOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={chatOpen}
                  >
                    <ChatIcon />
                    Chat
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => void copy()} aria-label="Copy post" title="Copy post">
                    <CopyIcon />
                  </Button>
                  <LinkedInAction label="Schedule" variant="secondary" />
                  <LinkedInAction label="Publish" variant="primary" />
                </div>
              </header>

              <div className="flex flex-col items-center gap-5 px-(--gutter) pb-16">
                <EditorToolbar
                  controls={editorId}
                  canUndo={history?.canUndo ?? false}
                  canRedo={history?.canRedo ?? false}
                  disabled={!editor || view === "hook" || (streaming && !snap.dirty)}
                  view={view}
                  onUndo={() => editor?.chain().focus().undo().run()}
                  onRedo={() => editor?.chain().focus().redo().run()}
                  onList={toggleList}
                  onEmoji={(em) => editor?.chain().focus().insertContent(em).run()}
                  onView={setView}
                />

                {snap.conflict && (
                  <div
                    role="alert"
                    data-conflict
                    className="flex w-full max-w-[560px] flex-col gap-3 rounded-card-sm border border-accent-text/40 bg-accent-wash p-4"
                  >
                    <p className="text-sm text-text">
                      Version {snap.conflict.version} was saved while you were editing. Your text is still here; choose which
                      one to keep.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button ref={keepRef} size="sm" onClick={() => autosave.keepMine()} disabled={!autosave.currentText.trim()}>
                        Keep mine as version {snap.conflict.version + 1}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => autosave.useLatest()}>
                        Use version {snap.conflict.version}
                      </Button>
                    </div>
                  </div>
                )}

                {ctl.reload && ctl.reload !== "loading" && (
                  <div role="alert" className="flex w-full max-w-[560px] flex-wrap items-center gap-3 text-[13px] text-text-2">
                    {ctl.reload === "missing" ? (
                      <p>This post isn&apos;t available any more. It may have been deleted, or you switched profiles.</p>
                    ) : (
                      <>
                        <p>The update stopped partway, and the saved post couldn&apos;t be reloaded.</p>
                        <Button variant="secondary" size="sm" onClick={ctl.retryReload}>
                          Reload post
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <div
                  className="post-editor__sheet w-full"
                  style={{ maxWidth: SHEET_WIDTH[view] }}
                  data-preview={view}
                >
                  <PostSheet caption={streaming ? "Writing · LinkedIn preview" : updated ? `Edited ${updated} · LinkedIn preview` : "LinkedIn preview"}>
                    <div hidden={view === "hook"}>
                      <EditorContent editor={editor} />
                      {!editor && <div className="post-editor__text whitespace-pre-wrap">{initialDoc.text}</div>}
                    </div>
                    {view === "hook" && (
                      <div data-hook-view className="text-[15px] leading-[1.5]">
                        <p className="whitespace-pre-wrap break-words">
                          {hookOf(text)}
                          {fold !== null && <span className="text-text-3">… see more</span>}
                        </p>
                        <p className="mt-4 border-t border-line-paper pt-3 text-[13px] text-text-3">
                          {fold === null
                            ? "The whole post shows in the feed; there is no fold."
                            : `This is what shows before "see more": the first ${hookOf(text).length} characters.`}
                        </p>
                      </div>
                    )}
                    {view !== "hook" && <PostImage documentId={initialDoc.id} />}
                    <div aria-hidden="true" className="flex justify-between border-t border-line-paper pt-3 text-[13px] text-text-3">
                      <span>Like</span>
                      <span>Comment</span>
                      <span>Repost</span>
                      <span>Send</span>
                    </div>
                  </PostSheet>
                </div>
              </div>
            </section>
          </div>
        </Tooltip.Provider>
      </DocumentPanelContext.Provider>
    </ThreadPlaceContext.Provider>
  );
}

/** Schedule and Publish: shown, disabled, until LinkedIn is connected (no request is ever made). */
function LinkedInAction({ label, variant }: { label: string; variant: "primary" | "secondary" }) {
  const hintId = useId();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <Button
          variant={variant}
          size="md"
          aria-disabled="true"
          aria-describedby={hintId}
          data-linkedin-action={label.toLowerCase()}
          onClick={(e) => e.preventDefault()}
          className={cn(
            "aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:active:scale-100 motion-safe:aria-disabled:hover:translate-y-0",
            variant === "primary"
              ? "aria-disabled:hover:bg-accent aria-disabled:hover:shadow-none"
              : "aria-disabled:hover:border-line-strong aria-disabled:hover:bg-transparent aria-disabled:hover:text-text",
          )}
        >
          {label}
        </Button>
      </Tooltip.Trigger>
      <span id={hintId} className="sr-only">
        {LINKEDIN_HINT}
      </span>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          sideOffset={8}
          collisionPadding={16}
          className="z-50 rounded-card-sm bg-inverse px-3 py-2 text-[13px] text-on-inverse shadow-elevation-composer data-[state=delayed-open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          {LINKEDIN_HINT}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function VersionMenu({
  version,
  versions,
  error,
  busy,
  onRestore,
  onRetry,
}: {
  version: number;
  versions: Parameters<typeof VersionList>[0]["versions"];
  error: boolean;
  busy: boolean;
  onRestore: (v: number) => void;
  onRetry: () => void;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        data-version-label
        className="orbit-transition inline-flex h-7 items-center rounded-pill border border-line-control px-2.5 text-[12px] font-medium text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse"
      >
        Version {version}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={16}
          aria-label="Versions"
          data-lenis-prevent
          className="orbit-panel z-50 max-h-[min(420px,70svh)] w-[min(380px,calc(100vw-32px))] overflow-y-auto !pl-7 data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          <VersionList versions={versions} current={version} error={error} busy={busy} onRestore={onRestore} onRetry={onRetry} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** Inline rename: Enter saves, Escape cancels, blur saves. `onDone(null)` cancels. */
function TitleField({ initial, onDone }: { initial: string; onDone: (value: string | null) => void | Promise<void> }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    void Promise.resolve(onDone(v)).finally(() => {
      done.current = false;
    });
  };
  return (
    <input
      ref={ref}
      id="post-title"
      aria-label="Post title"
      value={value}
      maxLength={TITLE_MAX}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(null);
        }
      }}
      onBlur={() => finish(value)}
      className="w-full max-w-[560px] rounded-card-sm border border-line-control bg-transparent px-3 py-1.5 text-[22px] font-medium leading-tight tracking-[-0.01em] text-text outline-none focus-visible:border-accent-text"
    />
  );
}
