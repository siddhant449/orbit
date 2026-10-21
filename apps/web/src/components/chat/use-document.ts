"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  applyDataPart,
  closePanel,
  emptyPanel,
  endStream,
  openPanel,
  panelCue,
  withDocument,
  type PanelDoc,
  type PanelState,
} from "@brandloop/agent/client";
import type { DocumentContext, StreamDataPart } from "./use-chat-session";

export type VersionRow = {
  version: number;
  source: "AI_CREATE" | "AI_EDIT" | "USER_EDIT" | "RESTORE" | string;
  changeSummary: string | null;
  createdAt: string;
  chars: number;
};

export type SaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict: PanelDoc }
  | { ok: false; error: string };

export const CONFLICT_TOAST = "This post changed. Reloaded the latest version.";

const enc = encodeURIComponent;

async function fetchDoc(id: string): Promise<PanelDoc | null> {
  const res = await fetch(`/api/documents/${enc(id)}`, { cache: "no-store" });
  if (!res.ok) return null;
  const d = (await res.json()) as PanelDoc;
  return { id: d.id, title: d.title, version: d.version, text: d.text };
}

const fetchVersions = (url: string) =>
  fetch(url, { cache: "no-store" }).then((r) =>
    r.ok ? (r.json() as Promise<{ versions: VersionRow[] }>) : Promise.reject(new Error(String(r.status))),
  );

async function errorOf(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  return typeof body?.error === "string" ? body.error : fallback;
}

/**
 * The post panel's state (design §9): fed by the chat stream's `data-*` parts through `applyDataPart`, seeded with
 * the page's post, and written to with optimistic concurrency (`expectedVersion`). A 409 never drops the user's
 * text: the caller gets the latest version back and decides.
 */
/** An edit in progress, kept by the controller so closing the panel or switching tabs never loses it. */
export type EditDraft = { id: string; base: number; baseText: string; text: string };

export function useDocument(initial: PanelDoc | null) {
  const [state, setState] = useState<PanelState>(() => withDocument(emptyPanel(), initial));
  const stateRef = useRef(state);
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Opened by a click (focus moves in) or by the stream (focus stays in the composer).
  const [openedBy, setOpenedBy] = useState<"user" | "stream" | "page">(initial ? "page" : "stream");
  // Bumped when a stream starts, so the sheet types it out even if the whole burst lands in one render.
  const [streamSeq, setStreamSeq] = useState(0);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  // Where focus goes back to on close: captured when the user asks to open, before the panel takes focus.
  const returnTo = useRef<HTMLElement | null>(null);

  /** Every transition goes through here: the next state, plus its polite cue, computed outside any updater. */
  const apply = useCallback((fn: (s: PanelState) => PanelState): PanelState => {
    const prev = stateRef.current;
    const next = fn(prev);
    if (next === prev) return prev;
    stateRef.current = next;
    setState(next);
    const cue = panelCue(prev, next);
    if (cue) setAnnouncement(cue);
    return next;
  }, []);

  const onData = useCallback(
    (part: StreamDataPart) => {
      if ((part.type === "data-creating" || part.type === "data-updating") && part.data === true) setStreamSeq((n) => n + 1);
      const wasOpen = stateRef.current.open;
      const next = apply((s) => applyDataPart(s, part));
      if (next.open && !wasOpen) setOpenedBy("stream");
    },
    [apply],
  );

  /** The stored post (recovery, poll adoption). Ends any stream that died; never rolls a newer local version back. */
  const setDocument = useCallback(
    (doc: PanelDoc | null) => {
      apply((s) => {
        if (doc && s.doc && s.doc.id === doc.id && s.doc.version > doc.version) return endStream(s);
        if (!doc) return s.doc && s.doc.version > 0 ? endStream(s) : withDocument(s, null);
        return withDocument(s, doc);
      });
    },
    [apply],
  );

  /**
   * The turn ended (finished, failed, stopped or dropped). No flag stays on, and a post that was streaming when it
   * ended is reloaded from the server, where it was saved before its text streamed.
   */
  const settle = useCallback(async () => {
    const next = apply(endStream);
    const partial = next.doc && next.doc.version === 0 ? next.doc.id : null;
    if (!partial) return;
    const latest = await fetchDoc(partial);
    if (latest) apply((s) => (s.doc?.id === latest.id && s.doc.version === 0 ? withDocument(s, latest) : s));
  }, [apply]);

  const open = useCallback(() => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      returnTo.current = document.activeElement;
    }
    setOpenedBy("user");
    apply(openPanel);
  }, [apply]);
  const close = useCallback(() => void apply(closePanel), [apply]);
  /** The element to give focus back to on close (read once). */
  const takeReturnTo = useCallback(() => {
    const el = returnTo.current;
    returnTo.current = null;
    return el;
  }, []);

  const doc = state.doc;
  const id = doc && doc.version > 0 ? doc.id : null;
  const versionsKey = id ? `/api/documents/${enc(id)}/versions` : null;
  const versions = useSWR(versionsKey, fetchVersions, { revalidateOnFocus: false });
  const refreshVersions = versions.mutate;
  // Any new version (stream, save, restore) refreshes the list.
  useEffect(() => {
    if (doc?.version) void refreshVersions();
  }, [doc?.version, refreshVersions]);

  const refetch = useCallback(async (): Promise<PanelDoc | null> => {
    if (!id) return null;
    const latest = await fetchDoc(id);
    if (latest) apply((s) => withDocument(s, latest));
    return latest;
  }, [id, apply]);

  const save = useCallback(
    async (text: string, expectedVersion: number): Promise<SaveResult> => {
      if (!id) return { ok: false, error: "This post isn't saved yet." };
      setSaving(true);
      try {
        const res = await fetch(`/api/documents/${enc(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, expectedVersion }),
        });
        if (res.status === 409) {
          const latest = await fetchDoc(id);
          if (!latest) return { ok: false, error: "This post changed and couldn't be reloaded. Try again." };
          apply((s) => withDocument(s, latest));
          return { ok: false, conflict: latest };
        }
        if (!res.ok) return { ok: false, error: await errorOf(res, "Your edit couldn't be saved. Try again.") };
        const { version } = (await res.json()) as { version: number };
        apply((s) => (s.doc && s.doc.id === id ? { ...s, doc: { ...s.doc, text, version } } : s));
        setDraft(null);
        setAnnouncement(`Saved. Version ${version}.`);
        return { ok: true, version };
      } catch {
        return { ok: false, error: "Your edit couldn't be saved. Check your connection and try again." };
      } finally {
        setSaving(false);
      }
    },
    [id, apply],
  );

  const restore = useCallback(
    async (version: number, expectedVersion: number): Promise<SaveResult> => {
      if (!id) return { ok: false, error: "This post isn't saved yet." };
      setSaving(true);
      try {
        const res = await fetch(`/api/documents/${enc(id)}/restore`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version, expectedVersion }),
        });
        if (res.status === 409) {
          const latest = await fetchDoc(id);
          if (latest) apply((s) => withDocument(s, latest));
          return latest ? { ok: false, conflict: latest } : { ok: false, error: "This post changed. Reload and try again." };
        }
        if (!res.ok) return { ok: false, error: await errorOf(res, "That version couldn't be restored. Try again.") };
        const d = (await res.json()) as PanelDoc;
        apply((s) => withDocument(s, { id: d.id, title: d.title, version: d.version, text: d.text }));
        setAnnouncement(`Restored. Version ${d.version}.`);
        return { ok: true, version: d.version };
      } catch {
        return { ok: false, error: "That version couldn't be restored. Check your connection and try again." };
      } finally {
        setSaving(false);
      }
    },
    [id, apply],
  );

  const context: DocumentContext | null = useMemo(() => (id && doc ? { id, version: doc.version } : null), [id, doc]);

  return {
    state,
    openedBy,
    streamSeq,
    saving,
    announcement,
    context,
    versions: versions.data?.versions ?? null,
    versionsError: Boolean(versions.error),
    retryVersions: () => void refreshVersions(),
    draft,
    setDraft,
    takeReturnTo,
    settle,
    onData,
    setDocument,
    open,
    close,
    refetch,
    save,
    restore,
  };
}

export type DocumentController = ReturnType<typeof useDocument>;
