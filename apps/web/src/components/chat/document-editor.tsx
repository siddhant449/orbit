"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { charCount, POST_CHAR_LIMIT, type PanelDoc } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { CONFLICT_TOAST, type SaveResult } from "./use-document";

/** The server's hard cap (Task 8); LinkedIn's 3,000 is a warning. */
const TEXT_MAX = 10_000;

export function CharMeter({ text, className }: { text: string; className?: string }) {
  const { count, over } = charCount(text);
  return (
    <span data-char-count className={cn("font-mono text-xs tabular-nums", over ? "text-danger" : "text-text-3", className)}>
      {count.toLocaleString("en-US")} / {POST_CHAR_LIMIT.toLocaleString("en-US")}
    </span>
  );
}

/**
 * The post, editable in place on its paper sheet. Saves are optimistic-concurrency writes: a 409 reloads the latest
 * version underneath and keeps the user's text on screen, with a choice to save it over the new version or take the
 * new one. Nothing the user typed is dropped without them choosing it.
 */
export function DocumentEditor({
  doc,
  saving,
  onSave,
  onDone,
}: {
  doc: PanelDoc;
  saving: boolean;
  onSave: (text: string, expectedVersion: number) => Promise<SaveResult>;
  /** Leaves edit mode (after a save or a cancel). */
  onDone: () => void;
}) {
  const [text, setText] = useState(doc.text);
  const [base, setBase] = useState(doc.version);
  const [baseText, setBaseText] = useState(doc.text);
  const [conflict, setConflict] = useState<PanelDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const hintId = useId();
  const { count, over } = charCount(text);
  const dirty = text !== baseText;
  const tooLong = count > TEXT_MAX;
  const empty = !text.trim();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // The sheet grows with the post instead of scrolling inside a box.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  async function save(expectedVersion: number) {
    setError(null);
    const res = await onSave(text, expectedVersion);
    if (res.ok) {
      toast(`Saved as version ${res.version}.`);
      onDone();
    } else if ("conflict" in res) {
      toast(CONFLICT_TOAST);
      setConflict(res.conflict);
    } else {
      setError(res.error);
    }
  }

  function takeLatest(latest: PanelDoc) {
    setText(latest.text);
    setBaseText(latest.text);
    setBase(latest.version);
    setConflict(null);
    ref.current?.focus();
  }

  return (
    <form
      aria-label="Edit post"
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving && dirty && !empty && !tooLong) void save(conflict ? conflict.version : base);
      }}
    >
      {conflict && (
        <div role="alert" data-conflict className="flex flex-col gap-3 rounded-card-sm border border-accent-text/40 bg-accent-wash p-4">
          <p className="text-sm text-text">
            Version {conflict.version} was saved while you were editing. Your text is still here; choose which one to keep.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={saving || empty || tooLong}>
              Save mine as version {conflict.version + 1}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => takeLatest(conflict)}>
              Use version {conflict.version}
            </Button>
          </div>
        </div>
      )}

      <label className="sr-only" htmlFor="post-editor">
        Post text
      </label>
      <textarea
        id="post-editor"
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        aria-describedby={hintId}
        aria-invalid={tooLong || undefined}
        spellCheck
        rows={8}
        className="post-sheet__text block min-h-48 w-full resize-none overflow-hidden bg-transparent text-[15px] leading-[1.5] text-text outline-none"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p id={hintId} className="flex items-center gap-2 text-xs text-text-3">
          <CharMeter text={text} />
          {over && !tooLong && <span className="text-danger">Over LinkedIn&apos;s limit by {(count - POST_CHAR_LIMIT).toLocaleString("en-US")}.</span>}
          {tooLong && <span className="text-danger">Posts can be up to 10,000 characters.</span>}
        </p>
        {!conflict && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !dirty || empty || tooLong}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
