"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { cn } from "@brandloop/ui";
import { relativeTime, type WhatsNewRow } from "@/lib/whats-new";
import { pillSmClass } from "./top-bar";

type Item = { id: string; kind: string; title: string; href: string; createdAt: string; read: boolean };
type Data = { derived: WhatsNewRow[]; items: Item[]; unread: number };

const KEY = "/api/notifications";
const SEEN_KEY = "orbit:whats-new-seen";
const circle =
  "orbit-transition relative grid size-11 place-items-center rounded-full border border-line-control text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse data-[state=open]:border-inverse data-[state=open]:bg-inverse data-[state=open]:text-on-inverse";

const fetcher = async (url: string): Promise<Data> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("notifications");
  return res.json();
};

/** What the derived rows said when the popover was last opened, so the dot means "something changed", not "something exists". */
const signature = (rows: WhatsNewRow[]) => rows.map((r) => `${r.id}:${r.title}:${r.detail ?? ""}`).join("|");
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeen(value: string) {
  try {
    localStorage.setItem(SEEN_KEY, value);
  } catch {}
}

async function markRead(body: { ids: string[] } | { all: true }) {
  await fetch("/api/notifications/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

/**
 * What's New (the bell): derived rows first (today's challenge day, ideas waiting, the next step), then stored events
 * with a relative time and a link. The dot shows while events are unread or the derived rows changed since the popover
 * was last opened. Opening marks the visible events read. Esc closes and focus returns to the bell.
 */
export function Notifications({ variant = "pill" }: { variant?: "pill" | "circle" }) {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const { data, mutate } = useSWR<Data>(KEY, fetcher, { revalidateOnFocus: true, refreshInterval: 120_000 });
  const opened = useRef(false);

  useEffect(() => {
    // Storage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeen(readSeen() ?? "");
  }, []);

  const derived = data?.derived ?? [];
  const items = data?.items ?? [];
  const sig = signature(derived);
  const dot = Boolean(data) && seen !== null && (data!.unread > 0 || (derived.length > 0 && sig !== seen));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      opened.current = false;
      setFresh(new Set());
      return;
    }
    void mutate();
    opened.current = true;
  }

  // Once the open popover has its data: remember the derived rows, and mark the visible unread events read.
  useEffect(() => {
    if (!open || !data || !opened.current) return;
    opened.current = false;
    setSeen(sig);
    writeSeen(sig);
    const unread = data.items.filter((i) => !i.read);
    setFresh(new Set(unread.map((i) => i.id)));
    if (unread.length === 0) return;
    void markRead({ ids: unread.map((i) => i.id) }).then(() => mutate((d) => d && { ...d, unread: Math.max(0, d.unread - unread.length), items: d.items.map((i) => ({ ...i, read: true })) }, { revalidate: false }));
  }, [open, data, sig, mutate]);

  async function markAll() {
    await markRead({ all: true });
    await mutate((d) => d && { ...d, unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }, { revalidate: false });
  }

  const label = dot ? "What's New, something new" : "What's New";
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger aria-label={label} className={variant === "circle" ? circle : pillSmClass}>
        <Bell size={variant === "circle" ? 18 : 15} aria-hidden="true" />
        {variant === "pill" && "What's New"}
        {dot && <span data-bell-dot="" aria-hidden="true" className={cn("size-2 rounded-full bg-accent", variant === "circle" ? "absolute right-2.5 top-2.5" : "")} />}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={16}
          aria-label="What's New"
          className="orbit-panel z-50 w-[min(360px,calc(100vw-32px))] !shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-medium text-text">What&apos;s New</h2>
            <button
              type="button"
              onClick={() => void markAll()}
              disabled={!data || data.unread === 0}
              className="orbit-transition min-h-8 rounded-pill px-3 text-[13px] text-text-2 hover:bg-line-soft hover:text-text disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>

          {derived.length === 0 && items.length === 0 && <p className="mt-6 pb-4 text-center text-[13px] text-text-2">{data ? "Nothing new" : "Loading…"}</p>}

          {derived.length > 0 && (
            <ul aria-label="For you now" className="mt-3 flex flex-col">
              {derived.map((r) => (
                <li key={r.id} data-derived={r.id} className="border-t border-line first:border-t-0">
                  <Link href={r.href} onClick={() => setOpen(false)} className="orbit-transition -mx-2 block rounded-[10px] px-2 py-2.5 hover:bg-line-row">
                    <span className="block text-[14px] text-text">{r.title}</span>
                    {r.detail && <span className="block text-[12px] text-text-3">{r.detail}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <ul aria-label="Recent" className={cn("flex flex-col", derived.length > 0 ? "mt-2 border-t border-line pt-1" : "mt-3")}>
              {items.map((i) => (
                <li key={i.id} data-event={i.kind} className="border-t border-line first:border-t-0">
                  <Link href={i.href} onClick={() => setOpen(false)} className="orbit-transition -mx-2 flex items-start justify-between gap-3 rounded-[10px] px-2 py-2.5 hover:bg-line-row">
                    <span className="min-w-0">
                      <span className="block text-[14px] text-text">{i.title}</span>
                      <span className="block text-[12px] text-text-3">{relativeTime(i.createdAt)}</span>
                    </span>
                    {fresh.has(i.id) && <span className="mt-1 shrink-0 rounded-pill bg-accent-wash px-2 text-[11px] font-medium text-accent-text">New</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
