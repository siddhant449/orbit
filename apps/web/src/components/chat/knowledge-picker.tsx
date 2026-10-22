"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { BookOpen, Check, Search, X } from "lucide-react";
import { Button, cn } from "@brandloop/ui";

export type KnowledgeChoice = { id: string; title: string };
type Item = { id: string; title: string | null; type: string; status: string };

export const MAX_KNOWLEDGE = 5;

/** Picks up to five knowledge items to ground the next reply. Searches titles as you type. */
export function KnowledgePicker({
  selected,
  onChange,
}: {
  selected: KnowledgeChoice[];
  onChange: (next: KnowledgeChoice[]) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const q = query.trim();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/knowledge-base${q.length >= 3 ? `?q=${encodeURIComponent(q)}` : ""}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { items: Item[] };
        // Short queries filter the recent list here; the server only searches from three characters.
        const all = q && q.length < 3 ? data.items.filter((i) => (i.title ?? "").toLowerCase().includes(q.toLowerCase())) : data.items;
        setItems(all.slice(0, 30));
        setFailed(false);
        setActive(0);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setFailed(true);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [open, query]);

  const chosen = new Set(selected.map((s) => s.id));
  const full = selected.length >= MAX_KNOWLEDGE;

  function toggle(item: Item | undefined) {
    if (!item) return;
    if (chosen.has(item.id)) onChange(selected.filter((s) => s.id !== item.id));
    else if (!full) onChange([...selected, { id: item.id, title: item.title || "Untitled" }]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const n = items?.length ?? 0;
    if (!n) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      toggle(items?.[active]);
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-[var(--composer-control,32px)]" aria-label={selected.length ? `Knowledge, ${selected.length} selected` : "Knowledge"}>
          <BookOpen aria-hidden="true" />
          <span className="hidden @md:inline">Knowledge</span>
          {selected.length > 0 && <span className="type-micro tabular-nums">{selected.length}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          data-lenis-prevent
          className="plate plate--sm z-50 w-[min(340px,calc(100vw-24px))] p-1.5 data-[state=open]:animate-[plate-in_120ms_var(--ease-ink)_both]"
        >
          <div className="flex h-10 items-center gap-2 border-b border-line px-2.5">
            <Search aria-hidden="true" className="icon-sm shrink-0 text-ink-muted" />
            <input
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={items?.length ? `${listId}-${active}` : undefined}
              aria-label="Search your knowledge"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search your knowledge…"
              className="min-w-0 flex-1 bg-transparent type-ui text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          <p className="type-caption px-2.5 pb-1 pt-2 text-ink-muted" aria-live="polite">
            {full ? `Up to ${MAX_KNOWLEDGE} items. Remove one to add another.` : `${selected.length} of ${MAX_KNOWLEDGE} selected`}
          </p>
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            aria-multiselectable
            aria-label="Knowledge items"
            className="max-h-64 overflow-y-auto"
          >
            {failed && <p className="type-ui px-2.5 py-2 text-signal-ink">{"Your knowledge didn't load. Close this and try again."}</p>}
            {!failed && items === null && <div className="skeleton mx-2.5 my-2 h-4" />}
            {!failed && items?.length === 0 && (
              <p className="type-ui px-2.5 py-2 text-ink-muted">{query.trim() ? "Nothing matches that search." : "Nothing here yet."}</p>
            )}
            {items?.map((item, i) => {
              const on = chosen.has(item.id);
              const disabled = !on && full;
              return (
                <div
                  key={item.id}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={on}
                  aria-disabled={disabled || undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => toggle(item)}
                  className={cn(
                    "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-row px-2.5 type-ui text-ink",
                    i === active && "bg-ink text-on-ink",
                    disabled && "cursor-not-allowed text-ink-faint",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{item.title || "Untitled"}</span>
                  {item.status !== "READY" && <span className="type-caption opacity-80">Processing</span>}
                  {on && <Check aria-hidden="true" className="icon-sm" />}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** A selected knowledge item under the composer, removable. */
export function KnowledgeChip({ item, onRemove }: { item: KnowledgeChoice; onRemove: () => void }) {
  return (
    <li className="flex h-7 max-w-[220px] items-center gap-1.5 rounded-pill border border-line-control bg-surface pl-3 pr-1 type-caption text-ink">
      <span className="min-w-0 truncate">{item.title}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.title}`}
        className="grid size-5 shrink-0 place-items-center rounded-pill text-ink-muted hover:bg-surface-sunk hover:text-ink"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </li>
  );
}
