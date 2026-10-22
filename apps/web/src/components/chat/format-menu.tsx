"use client";

import { useId, useMemo, useState } from "react";
import { Popover } from "radix-ui";
import { CATEGORIES, FRAMEWORKS, TEMPLATES } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { CloseIcon, SearchIcon } from "@brandloop/ui/icons";

type Option = { id: string | null; name: string; hint: string; group: string };

const OPTIONS: Option[] = [
  { id: null, name: "Let Orbit choose", hint: "Match the structure to the post", group: "" },
  ...FRAMEWORKS.map((f) => ({ id: f.id, name: f.name, hint: f.description, group: "Structures" })),
  ...TEMPLATES.map((t) => ({ id: t.id, name: t.title, hint: t.why, group: CATEGORIES.find((c) => c.id === t.category)?.label ?? "Templates" })),
];

export const formatName = (id: string | null) => OPTIONS.find((o) => o.id === id && id !== null)?.name ?? null;

/**
 * The composer's Format menu (design §5): "Let Orbit choose" (the default), the six structures, and the templates grouped
 * by category, with search. The pick shows as a removable chip and applies to the next message only.
 */
export function FormatMenu({ value, onChange, disabled }: { value: string | null; onChange: (id: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPTIONS.filter((o) => !q || `${o.name} ${o.hint} ${o.group}`.toLowerCase().includes(q));
  }, [query]);
  const groups = [...new Set(shown.map((o) => o.group))];
  const name = formatName(value);

  return (
    <>
      <Popover.Root open={open} onOpenChange={(o) => (setOpen(o), o && setQuery(""))}>
        <Popover.Trigger asChild>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} aria-label="Format" title="Choose a post format">
            <span>Format</span>
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            aria-label="Choose a post format"
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={16}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).querySelector("input")?.focus();
            }}
            className="orbit-panel z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-card p-0 shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <SearchIcon size={16} className="shrink-0 text-text-2" />
              <input
                aria-label="Search formats"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search formats"
                className="h-12 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text-3"
              />
            </div>
            <div id={listId} role="listbox" aria-label="Formats" data-lenis-prevent className="max-h-[min(380px,55dvh)] overflow-y-auto p-1.5">
              {shown.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-2">No format matches that.</p>}
              {groups.map((g) => (
                <div key={g || "default"} role="group" aria-label={g || "Default"}>
                  {g && <p className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-text-3">{g}</p>}
                  {shown
                    .filter((o) => o.group === g)
                    .map((o) => (
                      <button
                        key={o.id ?? "auto"}
                        type="button"
                        role="option"
                        aria-selected={o.id === value}
                        onClick={() => {
                          onChange(o.id);
                          setOpen(false);
                        }}
                        className={cn("flex w-full flex-col rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150 hover:bg-line-row", o.id === value && "bg-line-row")}
                      >
                        <span className="text-[14px] font-medium text-text">{o.name}</span>
                        <span className="truncate text-[12px] text-text-2">{o.hint}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {name && (
        <button
          type="button"
          data-format-chip
          aria-label={`Remove format: ${name}`}
          onClick={() => onChange(null)}
          className="orbit-transition inline-flex h-8 max-w-[180px] items-center gap-1.5 rounded-pill border border-line-control pl-3 pr-2 text-[12px] font-medium text-text hover:border-text-3"
        >
          <span className="truncate">{name}</span>
          <CloseIcon size={12} aria-hidden="true" />
        </button>
      )}
    </>
  );
}
