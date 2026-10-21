"use client";

import { createContext, useContext, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Strategy as StrategyInput } from "@brandloop/ai";
import { cn } from "@brandloop/ui";
import { saveStrategyAction } from "@/app/(app)/actions";

type Ctx = { strategy: StrategyInput; save: (patch: Partial<StrategyInput>) => Promise<boolean>; pending: boolean };
const StrategyContext = createContext<Ctx | null>(null);

export function useStrategy() {
  const ctx = useContext(StrategyContext);
  if (!ctx) throw new Error("useStrategy must be used inside StrategyProvider");
  return ctx;
}

export function StrategyProvider({ strategy, children }: { strategy: StrategyInput; children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function save(patch: Partial<StrategyInput>) {
    const result = await saveStrategyAction({ ...strategy, ...patch });
    if (!result.ok) {
      toast.error(result.error);
      return false;
    }
    toast.success("Strategy saved");
    startTransition(() => router.refresh());
    return true;
  }
  return <StrategyContext value={{ strategy, save, pending }}>{children}</StrategyContext>;
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
        aria-label={`Edit ${label}`}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "block w-full -mx-2 rounded-row px-2 py-1 text-left hover:bg-surface-sunk focus-visible:bg-surface-sunk focus-visible:outline-2 focus-visible:outline-jade",
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
      "-mx-2 block w-[calc(100%+1rem)] rounded-row border border-jade bg-paper px-2 py-1 text-ink focus:outline-none focus:ring-2 focus:ring-jade/25",
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
        className="h-8 w-12 rounded-row border border-transparent bg-transparent pl-1 pr-0.5 text-right text-sm tabular-nums hover:border-line focus-visible:border-jade focus-visible:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade/25"
      />
      {suffix && <span className="whitespace-nowrap text-sm text-ink-muted">{suffix}</span>}
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
