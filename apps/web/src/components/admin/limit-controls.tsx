"use client";

import { useState, useTransition } from "react";
import { Input, cn } from "@brandloop/ui";
import { setAiBlockedAction, setDailyCapAction } from "@/app/admin/actions";

/** One user's cap input (empty = the default) and Block AI switch. Saves through admin-only server actions. */
export function LimitControls({ userId, label, capUsd, defaultCapUsd, blocked }: { userId: string; label: string; capUsd: string; defaultCapUsd: string; blocked: boolean }) {
  const [cap, setCap] = useState(capUsd);
  const [isBlocked, setBlocked] = useState(blocked);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();

  const saveCap = () =>
    start(async () => {
      const r = await setDailyCapAction(userId, cap);
      setStatus(r.ok ? { text: cap.trim() ? "Cap saved" : "Using the default cap", error: false } : { text: r.error, error: true });
    });
  const toggle = () =>
    start(async () => {
      const next = !isBlocked;
      const r = await setAiBlockedAction(userId, next);
      if (r.ok) setBlocked(next);
      setStatus(r.ok ? { text: next ? "AI paused" : "AI resumed", error: false } : { text: r.error, error: true });
    });

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-limit-controls={userId}>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          saveCap();
        }}
      >
        <span aria-hidden="true" className="text-text-3">$</span>
        <Input
          aria-label={`Daily cap in dollars for ${label}`}
          inputMode="decimal"
          placeholder={defaultCapUsd}
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          className="h-9 w-24 px-2.5 tabular-nums"
        />
        <button type="submit" disabled={pending} className="orbit-transition h-9 rounded-pill border border-line-3 px-3.5 text-[13px] font-medium text-text hover:bg-line-soft disabled:opacity-50">
          Save
        </button>
      </form>
      <button
        type="button"
        role="switch"
        aria-checked={isBlocked}
        aria-label={`Block AI for ${label}`}
        disabled={pending}
        onClick={toggle}
        className="orbit-transition inline-flex h-9 items-center gap-2 rounded-pill px-1 text-[13px] text-text-2 disabled:opacity-50"
      >
        <span className={cn("relative h-5 w-9 rounded-pill border transition-colors", isBlocked ? "border-danger-fill bg-danger-fill" : "border-line-control bg-ground")}>
          <span className={cn("absolute top-0.5 size-3.5 rounded-full bg-text transition-[left]", isBlocked ? "left-[18px] bg-white" : "left-0.5")} />
        </span>
        {isBlocked ? "AI paused" : "Block AI"}
      </button>
      <span role="status" aria-live="polite" className={cn("min-w-0 text-xs", status?.error ? "text-danger" : "text-text-3")}>
        {status?.text}
      </span>
    </div>
  );
}
