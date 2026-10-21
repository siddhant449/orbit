"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { normalizePercents, type Strategy as StrategyInput } from "@brandloop/ai";
import { cn } from "@brandloop/ui";
import { saveStrategyAction } from "@/app/(app)/actions";

type Ctx = { strategy: StrategyInput; save: (patch: Partial<StrategyInput>) => Promise<boolean>; pending: boolean };
const StrategyContext = createContext<Ctx | null>(null);

export function useStrategy() {
  const ctx = useContext(StrategyContext);
  if (!ctx) throw new Error("useStrategy must be used inside StrategyProvider");
  return ctx;
}

export function StrategyProvider({ strategy: server, children }: { strategy: StrategyInput; children: React.ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Local copy so edits made before the server refresh lands build on each other instead of on stale props.
  const [local, setLocal] = useState(server);
  const [seenServer, setSeenServer] = useState(server);
  const [inflight, setInflight] = useState(0);
  const latest = useRef(server);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const lastGood = useRef(server);
  const active = useRef(0);

  if (server !== seenServer) {
    setSeenServer(server);
    if (inflight === 0) setLocal(server);
  }
  useEffect(() => {
    if (active.current === 0) {
      latest.current = server;
      lastGood.current = server;
    }
  }, [server]);

  function save(patch: Partial<StrategyInput>): Promise<boolean> {
    const merged = { ...latest.current, ...patch };
    merged.contentMix = normalizePercents(merged.contentMix);
    merged.audienceBalance = normalizePercents(merged.audienceBalance);
    latest.current = merged;
    setLocal(merged);
    active.current += 1;
    setInflight((n) => n + 1);

    const run = queue.current.then(async () => {
      // Always send the newest local copy so a queued save never rolls back a later edit.
      const result = await saveStrategyAction(latest.current);
      if (!result.ok) {
        toast.error(result.error);
        latest.current = lastGood.current;
        setLocal(lastGood.current);
        return false;
      }
      lastGood.current = latest.current;
      toast.success("Strategy saved");
      return true;
    });
    queue.current = run.catch(() => false);
    return run
      .catch(() => {
        toast.error("Couldn't save your strategy");
        latest.current = lastGood.current;
        setLocal(lastGood.current);
        return false;
      })
      .finally(() => {
        active.current -= 1;
        setInflight((n) => n - 1);
        startTransition(() => router.refresh());
      });
  }
  return <StrategyContext value={{ strategy: local, save, pending: inflight > 0 }}>{children}</StrategyContext>;
}

/** Text that reads as plain copy and turns into a field on click. Enter or leaving the field saves, Escape cancels. */
export function EditableText({
  value,
  label,
  onSave,
  multiline = true,
  className,
  placeholder = "Add text",
}: {
  value: string;
  label: string;
  onSave: (next: string) => Promise<boolean>;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const busy = useRef(false);
  const btn = useRef<HTMLButtonElement>(null);

  function close() {
    setEditing(false);
    requestAnimationFrame(() => btn.current?.focus());
  }
  async function commit() {
    if (busy.current) return;
    const next = draft.trim();
    if (!next || next === value) {
      setDraft(value);
      close();
      return;
    }
    busy.current = true;
    const ok = await onSave(next);
    busy.current = false;
    if (ok) close();
  }
  function cancel() {
    busy.current = true;
    setTimeout(() => (busy.current = false), 0);
    setDraft(value);
    close();
  }

  if (!editing) {
    return (
      <button
        ref={btn}
        type="button"
        aria-label={`Edit ${label}: ${value}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "block w-full -mx-2 rounded-row px-2 py-1 text-left hover:bg-surface-sunk focus-visible:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-accent",
          className,
        )}
      >
        {value || <span className="text-ink-faint">{placeholder}</span>}
      </button>
    );
  }
  const shared = {
    "aria-label": label,
    autoFocus: true,
    value: draft,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
    className: cn(
      "-mx-2 block w-[calc(100%+1rem)] rounded-row border border-accent bg-paper px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-accent/25",
      className,
    ),
  };
  return multiline ? (
    <textarea
      {...shared}
      rows={Math.max(2, Math.ceil(draft.length / 70))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  ) : (
    <input
      {...shared}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
}

/** Whole-number field that saves when the value changes and focus leaves. */
export function NumberField({
  value,
  label,
  onSave,
  suffix,
  max = 100,
  testId,
}: {
  value: number;
  label: string;
  onSave: (next: number) => Promise<boolean>;
  suffix?: string;
  max?: number;
  testId?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  async function commit() {
    const n = Math.min(max, Math.max(0, Math.round(Number(draft))));
    if (!Number.isFinite(n) || n === value) {
      setDraft(String(value));
      return;
    }
    if (!(await onSave(n))) setDraft(String(value));
  }
  return (
    <span className="inline-flex items-center">
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        aria-label={label}
        data-testid={testId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-8 w-9 rounded-row [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none border border-transparent bg-transparent px-0.5 text-right text-sm tabular-nums hover:border-line focus-visible:border-accent focus-visible:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25"
      />
      {suffix && <span aria-hidden className={cn("whitespace-nowrap text-sm text-ink-muted", suffix !== "%" && "ml-1.5")}>{suffix}</span>}
    </span>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`s-${title.replace(/\W+/g, "-").toLowerCase()}`} className="rounded-card border border-line bg-surface p-5 sm:p-6">
      <h2 id={`s-${title.replace(/\W+/g, "-").toLowerCase()}`} className="font-display text-lg font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
