"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
  applyDataPart,
  emptyPanel,
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
export function useDocument(initial: PanelDoc | null) {
  const [state, setState] = useState<PanelState>(() => withDocument(emptyPanel(), initial));
  const [saving, setSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  // Opened by a click (focus moves in) or by the stream (focus stays in the composer).
  const [openedBy, setOpenedBy] = useState<"user" | "stream" | "page">(initial ? "page" : "stream");
  const prev = useRef(state);
  // Bumped when a stream starts, so the sheet types it out even if the whole burst lands in one render.
  const [streamSeq, setStreamSeq] = useState(0);

  // Polite announcements for state changes only, never per delta.
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (state.creating && !before.creating) setAnnouncement("Creating your post…");
    else if (state.updating && !before.updating) setAnnouncement("Updating your post…");
    else if (state.doc && before.doc && state.doc.id === before.doc.id && state.doc.version > before.doc.version && before.doc.version > 0)
      setAnnouncement(`Updated. Version ${state.doc.version}.`);
    else if (state.doc && state.doc.version > 0 && (!before.doc || before.doc.version === 0) && before.creating)
      setAnnouncement("Your post is ready.");
  }, [state]);

  const onData = useCallback((part: StreamDataPart) => {
    if ((part.type === "data-creating" || part.type === "data-updating") && part.data === true) setStreamSeq((n) => n + 1);
    setState((s) => {
      const next = applyDataPart(s, part);
      if (next.open && !s.open) setOpenedBy("stream");
      return next;
    });
  }, []);

  const setDocument = useCallback((doc: PanelDoc | null) => {
    setState((s) => {
      // The stored post never rolls a newer local version back.
      if (doc && s.doc && s.doc.id === doc.id && s.doc.version > doc.version) return s;
      if (!doc) return s.doc && s.doc.version > 0 ? s : withDocument(s, null);
      return { ...s, open: s.open || !s.doc, doc };
    });
  }, []);

  const open = useCallback(() => {
    setOpenedBy("user");
    setState((s) => (s.doc || s.creating ? { ...s, open: true } : s));
  }, []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);

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
    if (latest) setState((s) => withDocument({ ...s, open: s.open }, latest));
    return latest;
  }, [id]);

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
          setState((s) => withDocument(s, latest));
          return { ok: false, conflict: latest };
        }
        if (!res.ok) return { ok: false, error: await errorOf(res, "Your edit couldn't be saved. Try again.") };
        const { version } = (await res.json()) as { version: number };
        setState((s) => (s.doc && s.doc.id === id ? { ...s, doc: { ...s.doc, text, version } } : s));
        setAnnouncement(`Saved. Version ${version}.`);
        return { ok: true, version };
      } catch {
        return { ok: false, error: "Your edit couldn't be saved. Check your connection and try again." };
      } finally {
        setSaving(false);
      }
    },
    [id],
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
          if (latest) setState((s) => withDocument(s, latest));
          return latest ? { ok: false, conflict: latest } : { ok: false, error: "This post changed. Reload and try again." };
        }
        if (!res.ok) return { ok: false, error: await errorOf(res, "That version couldn't be restored. Try again.") };
        const d = (await res.json()) as PanelDoc;
        setState((s) => withDocument(s, { id: d.id, title: d.title, version: d.version, text: d.text }));
        setAnnouncement(`Restored version ${version} as version ${d.version}.`);
        return { ok: true, version: d.version };
      } catch {
        return { ok: false, error: "That version couldn't be restored. Check your connection and try again." };
      } finally {
        setSaving(false);
      }
    },
    [id],
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
