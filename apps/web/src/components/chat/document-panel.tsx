"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import type { PanelDoc } from "@brandloop/agent/client";
import { Button, cn, CountUp, durations, easeOut, Segmented, useMediaQuery, useReducedMotionPref } from "@brandloop/ui";
import { CloseIcon, CopyIcon, ExpandIcon, PencilIcon } from "@brandloop/ui/icons";
import { useCurrentProfile } from "@/components/shell/account-context";
import { CharMeter, DocumentEditor } from "./document-editor";
import type { DocumentController } from "./use-document";
import { useThreadPlace } from "./thread-context";
import { VersionList } from "./version-list";
import { useVersionPreview, VersionPreviewBar } from "./version-preview";

export const DESKTOP_PANEL = "(min-width: 1024px)";
const PANEL_WIDTH = 460;

/** The thread's way to open the panel (the draft card). Null outside a chat. */
export const DocumentPanelContext = createContext<DocumentController | null>(null);
export const useDocumentPanel = () => useContext(DocumentPanelContext);

/**
 * The streamed draft arrives in one burst, so the sheet types it out client-side: a rate that finishes any length in
 * about a second, never slower than 260 characters a second. Text that changes outside a stream (a page load, a save,
 * a restore) shows at once, as does everything under reduced motion.
 */
export function useReveal(text: string, streaming: boolean, streamSeq: number): { shown: string; revealing: boolean } {
  const reduced = useReducedMotionPref();
  const [anim, setAnim] = useState({ count: 0, on: false });
  // Each stream (an update restarts the text) types from the start. Keyed on a counter, not on `streaming`: the
  // whole burst can land in one render, so the flag may never be seen as true. State adjusted during render.
  const [seenSeq, setSeenSeq] = useState(streamSeq);
  if (streamSeq !== seenSeq) {
    setSeenSeq(streamSeq);
    setAnim({ count: 0, on: true });
  }
  const length = text.length;

  useEffect(() => {
    if (reduced || !anim.on) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      setAnim((a) => {
        const remaining = length - a.count;
        if (remaining <= 0) return streaming ? { count: length, on: true } : { count: length, on: false };
        const rate = Math.max(260, remaining / 0.9);
        return { count: Math.min(length, a.count + Math.max(1, Math.round(rate * dt))), on: true };
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [anim.on, length, streaming, reduced]);

  if (reduced || !anim.on) return { shown: text, revealing: streaming && !reduced };
  const n = Math.min(anim.count, length);
  return { shown: text.slice(0, n), revealing: true };
}

/** The profile's mark: its photo, or Orbit's gradient orb (system §2.5). */
function ProfileOrb({ src, className }: { src?: string | null; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("size-9 shrink-0 rounded-full object-cover", className)} />
  ) : (
    <span
      aria-hidden="true"
      className={cn("size-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,var(--accent-tint),var(--cobalt))]", className)}
    />
  );
}

/**
 * The LinkedIn preview (system §6.12): always paper, in both themes, so the post reads as it will be published.
 * `.light` re-resolves every token inside it.
 */
export function PostSheet({ children, caption }: { children: ReactNode; caption: string }) {
  const profile = useCurrentProfile();
  return (
    <div className="light post-sheet overflow-hidden rounded-card bg-panel text-text shadow-elevation-draft">
      <div className="flex flex-col gap-4 px-[22px] pb-[22px] pt-5">
        <div className="flex items-center gap-3">
          <ProfileOrb src={profile?.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.name ?? "Your profile"}</p>
            <p className="text-xs text-text-3">{caption}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function PostText({ text, caret }: { text: string; caret: boolean }) {
  return (
    <div data-post-text className="whitespace-pre-wrap break-words text-[15px] leading-[1.5]">
      {text}
      {caret && (
        <span
          aria-hidden="true"
          className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-accent-text motion-safe:animate-pulse"
        />
      )}
    </div>
  );
}

type Tab = "post" | "versions";

/** The page scroller's visible height: the desktop panel is sticky inside it and fills it exactly. */
function useScrollerHeight(enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const scroller = document.querySelector<HTMLElement>("[data-document-host]")?.closest<HTMLElement>(".lenis");
    if (!scroller) return;
    const ro = new ResizeObserver(() => setHeight(scroller.clientHeight));
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [enabled]);
  return height;
}

/**
 * The chat's post, beside the thread (design §9). A radix Dialog: non-modal on desktop, where it sits in the page as
 * a right-hand column and leaves the composer usable; a modal sheet on phones. Opened by the stream, it doesn't take
 * focus from the composer; opened by a click, focus moves to its heading and returns on close.
 */
export function DocumentPanel({ ctl, busy }: { ctl: DocumentController; busy: boolean }) {
  const desktop = useMediaQuery(DESKTOP_PANEL);
  const reduced = useReducedMotionPref();
  const { state, openedBy } = ctl;
  const doc = state.doc;
  const streaming = state.creating || state.updating;
  const [tab, setTab] = useState<Tab>("post");
  const [editing, setEditing] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const { shown, revealing } = useReveal(doc?.text ?? "", streaming, ctl.streamSeq);
  const height = useScrollerHeight(desktop);

  // A phone shows the sheet only when asked for; the stream opening it would cover the reply.
  const visible = state.open && (doc !== null || streaming) && (desktop || openedBy === "user");
  // A stream that starts mid-edit leaves the editor alone; the save catches the conflict.
  const isEditing = editing && visible;

  // The turn ended however it ended (finished, failed, stopped, dropped): no stream flag outlives it.
  const wasBusy = useRef(busy);
  const settle = ctl.settle;
  useEffect(() => {
    if (wasBusy.current && !busy) void settle();
    wasBusy.current = busy;
  }, [busy, settle]);

  // Opened by a click: focus moves to the heading. Done here rather than in Radix's mount autofocus, because a
  // panel reopened during its exit animation is reused, not remounted.
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (visible && !wasVisible.current && openedBy === "user") requestAnimationFrame(() => headingRef.current?.focus());
    wasVisible.current = visible;
  }, [visible, openedBy]);

  // An edit closed without saving (Close, tab switch, overlay tap) is kept and resumed.
  const kept = ctl.draft && doc && ctl.draft.id === doc.id && ctl.draft.text !== ctl.draft.baseText ? ctl.draft : null;

  function focusBack() {
    const back = ctl.takeReturnTo();
    (back?.isConnected ? back : document.getElementById("chat-composer"))?.focus({ preventScroll: true });
  }

  const title = doc?.title || (streaming ? "Writing your post…" : "Post");
  const version = doc && doc.version > 0 ? doc.version : null;
  const currentNo = doc?.currentVersion ?? version;
  const vp = useVersionPreview(doc?.id ?? null);

  async function copy() {
    if (!doc) return;
    try {
      await navigator.clipboard.writeText(doc.text);
      toast("Post copied.");
    } catch {
      toast("Copying isn't allowed here. Select the text and copy it instead.");
    }
  }

  async function restore(v: number) {
    if (!version) return;
    const res = await ctl.restore(v, version);
    if (res.ok) {
      toast(`Restored version ${v}.`);
      vp.close();
      setTab("post");
    } else if ("conflict" in res) toast("This post changed. Reloaded the latest version.");
    else toast(res.error);
  }

  const duration = reduced ? 0 : durations.hover;

  const header = (
    <header className="flex flex-col gap-4 px-6 pb-4 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 pt-1">
          <Dialog.Title asChild>
            <h2 ref={headingRef} tabIndex={-1} className="truncate text-[22px] font-medium leading-tight tracking-[-0.01em] text-text outline-none">
              {title}
            </h2>
          </Dialog.Title>
          <Dialog.Description asChild>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px] text-text-3">
              <span className="text-text-soft">Draft</span>
              <span aria-hidden="true">·</span>
              <CharMeter text={doc?.text ?? ""} className="text-[13px]" />
              {version && (
                <>
                  <span aria-hidden="true">·</span>
                  <span data-version-label>
                    Version <CountUp value={currentNo ?? version} />
                  </span>
                </>
              )}
            </p>
          </Dialog.Description>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="ghost" size="icon" className="size-9 border border-line-3" onClick={() => void copy()} disabled={!version} aria-label="Copy post">
            <CopyIcon />
          </Button>
          {version && doc && (
            <Button asChild variant="ghost" size="icon" className="size-9 border border-line-3">
              <Link href={`/posts/${encodeURIComponent(doc.id)}`} aria-label="Open in editor" title="Open in editor">
                <ExpandIcon />
              </Link>
            </Button>
          )}
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" className="size-9 border border-line-3" aria-label="Close post">
              <CloseIcon />
            </Button>
          </Dialog.Close>
        </div>
      </div>
      {version && (
        <Segmented<Tab>
          label="Post view"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setEditing(false);
          }}
          options={[
            { value: "post", label: "Post" },
            { value: "versions", label: (ctl.versions?.length ?? currentNo ?? 1) === 1 ? "1 version" : `${ctl.versions?.length ?? currentNo} versions` },
          ]}
        />
      )}
    </header>
  );

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6" data-lenis-prevent>
      {tab === "versions" && version ? (
        <div className="pl-3">
          <VersionList
            versions={ctl.versions}
            current={currentNo ?? 0}
            previewing={vp.preview?.version ?? null}
            onPreview={(v) => {
              void vp.open(v);
              setTab("post");
            }}
            error={ctl.versionsError}
            busy={ctl.saving || busy}
            onRestore={(v) => void restore(v)}
            onRetry={ctl.retryVersions}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {vp.preview && (
            <VersionPreviewBar
              version={vp.preview.version}
              busy={ctl.saving || busy}
              onRestore={() => void restore(vp.preview!.version)}
              onBack={vp.close}
            />
          )}
          <PostSheet caption={streaming ? "Writing · LinkedIn preview" : "Just now · LinkedIn preview"}>
            {vp.preview ? (
              <PostText text={vp.preview.text} caret={false} />
            ) : isEditing && doc && version ? (
              <DocumentEditor
                doc={doc}
                saving={ctl.saving}
                onSave={ctl.save}
                draft={ctl.draft}
                onDraft={ctl.setDraft}
                onDone={() => {
                  setEditing(false);
                  requestAnimationFrame(() => editRef.current?.focus());
                }}
              />
            ) : (
              <PostText text={shown} caret={revealing} />
            )}
          </PostSheet>
          {ctl.reload && (
            <div role={ctl.reload === "loading" ? "status" : "alert"} data-reload className="flex flex-wrap items-center gap-3 text-[13px] text-text-2">
              {ctl.reload === "missing" ? (
                <p>This post isn&apos;t available any more. It may have been deleted, or you switched profiles.</p>
              ) : ctl.reload === "failed" ? (
                <>
                  <p>The update stopped partway, and the saved post couldn&apos;t be reloaded.</p>
                  <Button variant="secondary" size="sm" onClick={ctl.retryReload}>
                    Reload post
                  </Button>
                </>
              ) : (
                <p>Reloading the saved post…</p>
              )}
            </div>
          )}
          {!isEditing && version && (
            <div className="flex flex-wrap items-center gap-3">
              <Button ref={editRef} variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={streaming || ctl.reload !== null}>
                <PencilIcon />
                {kept ? "Resume edit" : "Edit"}
              </Button>
              <Link
                href={`/posts/carousel/new?document=${encodeURIComponent(doc!.id)}`}
                className="orbit-transition inline-flex h-8 items-center rounded-pill border border-dashed border-line-control px-3.5 text-[13px] font-medium text-text hover:border-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                Make a carousel
              </Link>
              {kept && (
                <p data-kept-edit className="text-[13px] text-text-2">
                  {kept.base < version
                    ? `You have an unsaved edit based on version ${kept.base}. The post is now at version ${version}; saving will ask which one to keep.`
                    : "You have an unsaved edit to this post."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog.Root open={visible} onOpenChange={(o) => {
        if (o) return;
        setEditing(false);
        ctl.close();
        // Non-modal: nothing traps focus, so it goes back now. The phone sheet's trap hands it back on unmount.
        if (desktop) focusBack();
      }} modal={!desktop}>
      <AnimatePresence initial={false}>
        {visible &&
          (desktop ? (
            <Dialog.Content
              key="panel"
              forceMount
              asChild
              onOpenAutoFocus={(e) => e.preventDefault()}
              // Desktop gives focus back at once (see onOpenChange); the exit animation shouldn't hold it.
              onCloseAutoFocus={(e) => e.preventDefault()}
              onEscapeKeyDown={(e) => {
                // Escape belongs to the panel only while focus is in it, and never discards an edit.
                const inside = document.querySelector("[data-document-panel]")?.contains(document.activeElement);
                if (isEditing || !inside) e.preventDefault();
              }}
              onPointerDownOutside={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
            >
              <m.section
                data-document-panel=""
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: PANEL_WIDTH, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration, ease: easeOut }}
                style={{ height: height ?? "100svh" }}
                className="sticky top-0 hidden shrink-0 overflow-hidden border-l border-line bg-ground lg:block"
              >
                <m.div
                  initial={{ x: reduced ? 0 : 32 }}
                  animate={{ x: 0 }}
                  exit={{ x: reduced ? 0 : 32 }}
                  transition={{ duration: reduced ? 0 : durations.reveal, ease: easeOut }}
                  style={{ width: PANEL_WIDTH }}
                  className="flex h-full flex-col"
                >
                  {header}
                  {body}
                </m.div>
              </m.section>
            </Dialog.Content>
          ) : (
            <Dialog.Portal key="sheet" forceMount>
              <Dialog.Overlay forceMount asChild>
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration }}
                  className="fixed inset-0 z-[60] bg-ground-hero/60"
                />
              </Dialog.Overlay>
              <Dialog.Content
                forceMount
                asChild
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => {
                  e.preventDefault();
                  focusBack();
                }}
                onEscapeKeyDown={(e) => {
                  if (isEditing) e.preventDefault();
                }}
              >
                <m.section
                  data-document-panel=""
                  initial={{ y: reduced ? 0 : "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: reduced ? 0 : "100%" }}
                  transition={{ duration: reduced ? 0 : durations.hover, ease: easeOut }}
                  className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[92svh] flex-col rounded-t-card-lg border-t border-line bg-ground shadow-elevation-composer"
                >
                  <span aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-pill bg-line-4" />
                  {header}
                  {body}
                </m.section>
              </Dialog.Content>
            </Dialog.Portal>
          ))}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * The post in the thread (system §6.12, p03): title, length and the opening lines on paper, folded. Opens the panel.
 */
export function DraftCard({ fallback }: { fallback: PanelDoc }) {
  const ctl = useDocumentPanel();
  const place = useThreadPlace();
  const profile = useCurrentProfile();
  const doc = ctl?.state.doc && ctl.state.doc.id === fallback.id && ctl.state.doc.version > 0 ? ctl.state.doc : fallback;
  const paras = doc.text.split(/\n\s*\n/).filter((p) => p.trim());
  const folded = paras.length > 3;
  return (
    <div
      className="light overflow-hidden rounded-card bg-ground text-text shadow-elevation-draft"
      data-draft-card
    >
      <div className="flex items-center justify-between gap-3 border-b border-line-paper bg-panel px-[18px] py-3 text-[13px]">
        <p className="min-w-0 truncate font-medium">{doc.title}</p>
        <span className="shrink-0 text-text-3">
          Draft · <CharMeter text={doc.text} className="font-sans text-[13px]" />
        </span>
      </div>
      <div className="flex flex-col gap-3.5 px-[22px] pb-[22px] pt-5">
        <div className="flex items-center gap-2.5">
          <ProfileOrb src={profile?.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.name ?? "Your profile"}</p>
            <p className="text-xs text-text-3">Just now · LinkedIn preview</p>
          </div>
        </div>
        <div className="flex flex-col gap-2.5 text-[15px] leading-[1.5]">
          {paras.slice(0, 3).map((p, i) => (
            <p key={i} className="line-clamp-3 whitespace-pre-wrap break-words">
              {p}
            </p>
          ))}
          {folded && <p className="text-text-3">…more</p>}
        </div>
        {ctl && !place?.inPostEditor && (
          <div className="flex flex-wrap gap-2">
            <Button variant="inverse" size="sm" onClick={ctl.open}>
              Open post
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/posts/${encodeURIComponent(doc.id)}`}>Open in editor</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
