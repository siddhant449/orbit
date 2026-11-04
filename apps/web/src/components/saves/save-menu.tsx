"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { useSWRConfig } from "swr";
import useSWR from "swr";
import { Bookmark, BookmarkCheck, ChevronDown } from "lucide-react";
import { Button, Input, cn } from "@brandloop/ui";
import { fetchJson, isSavesKey, lookupSaved, SPACES_KEY, type SavedItemDto, type SavedKind, type SpaceDto } from "@/lib/saves-client";

type Props = {
  kind: SavedKind;
  /** The template, post or image this saves; hooks and ideas have none and are matched by their `snapshot.text`. */
  refId?: string;
  snapshot: Record<string, unknown>;
  /** What the control is about, for its accessible name ("Save <label>"). */
  label: string;
  /** The saved item's id when the parent already knows it (`null` = known unsaved). Otherwise it is looked up on open. */
  initialItemId?: string | null;
  /** Parent knows it is saved but not the id (template cards): shows "Saved" until the lookup runs. */
  initialSaved?: boolean;
  /** An icon-only trigger for dense rows. */
  compact?: boolean;
  className?: string;
  onSavedChange?: (saved: boolean) => void;
};

type Known = { id: string; spaceIds: string[] } | null;

const row =
  "orbit-transition flex min-h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-1.5 text-[14px] text-text hover:bg-line-row has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-accent-text has-[:disabled]:opacity-50";
const box = "size-4 shrink-0 accent-[var(--accent-text)]";

/**
 * "Save ▾": save to All saves, tick the spaces it belongs in, or make a new space on the spot. Saving twice keeps one item
 * (the server is idempotent); unticking All saves removes it from everywhere. Esc closes; the rows are native checkboxes.
 */
export function SaveMenu({ kind, refId, snapshot, label, initialItemId, initialSaved, compact, className, onSavedChange }: Props) {
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<Known | undefined>(initialItemId === undefined ? undefined : initialItemId === null ? null : { id: initialItemId, spaceIds: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const errId = useId();
  const { mutate } = useSWRConfig();
  const spaces = useSWR<{ spaces: SpaceDto[] }>(open ? SPACES_KEY : null, (u: string) => fetchJson(u), { revalidateOnFocus: false });
  const text = typeof snapshot.text === "string" ? snapshot.text : undefined;

  useEffect(() => {
    if (!open || known !== undefined) return;
    let live = true;
    lookupSaved(kind, { refId, text })
      .then((item) => live && setKnown(item ? { id: item.id, spaceIds: item.spaceIds } : null))
      .catch(() => live && setError("Couldn't check your saves. Try again."));
    return () => {
      live = false;
    };
  }, [open, known, kind, refId, text]);
  useEffect(() => {
    if (making) nameRef.current?.focus();
  }, [making]);

  const saved = known === undefined ? Boolean(initialSaved) : known !== null;
  const settle = (next: Known) => {
    setKnown(next);
    onSavedChange?.(next !== null);
    void mutate(isSavesKey);
  };

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  }

  const save = (spaceIds: string[]) =>
    fetchJson<{ item: SavedItemDto }>("/api/saves", "POST", { kind, refId, snapshot, spaceIds }).then(({ item }) => settle({ id: item.id, spaceIds: item.spaceIds }));

  const toggleAll = () =>
    run(async () => {
      if (known) {
        await fetchJson(`/api/saves/${known.id}`, "DELETE");
        settle(null);
      } else await save([]);
    });

  const toggleSpace = (id: string) =>
    run(async () => {
      if (!known) return save([id]);
      const spaceIds = known.spaceIds.includes(id) ? known.spaceIds.filter((s) => s !== id) : [...known.spaceIds, id];
      const { item } = await fetchJson<{ item: SavedItemDto }>(`/api/saves/${known.id}`, "PATCH", { spaceIds });
      settle({ id: item.id, spaceIds: item.spaceIds });
    });

  const createSpace = () =>
    run(async () => {
      const { space } = await fetchJson<{ space: SpaceDto }>(SPACES_KEY, "POST", { name });
      if (known) {
        const { item } = await fetchJson<{ item: SavedItemDto }>(`/api/saves/${known.id}`, "PATCH", { spaceIds: [...known.spaceIds, space.id] });
        settle({ id: item.id, spaceIds: item.spaceIds });
      } else await save([space.id]);
      setName("");
      setMaking(false);
      await spaces.mutate();
    });

  const Icon = saved ? BookmarkCheck : Bookmark;
  const triggerName = `${saved ? "Saved" : "Save"} ${label}`;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setMaking(false);
          setError(null);
        }
      }}
    >
      <Popover.Trigger asChild>
        {compact ? (
          <Button type="button" variant="ghost" size="icon" aria-label={triggerName} data-save-trigger className={cn("size-9 text-text-2", saved && "text-accent-text", className)}>
            <Icon aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" aria-label={triggerName} data-save-trigger className={className}>
            <Icon aria-hidden="true" />
            {saved ? "Saved" : "Save"}
            <ChevronDown aria-hidden="true" className="!size-3.5" />
          </Button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          aria-label={`Save ${label}`}
          align="end"
          sideOffset={8}
          collisionPadding={16}
          data-save-menu
          className="orbit-panel z-50 w-[min(300px,calc(100vw-32px))] rounded-card p-1.5 shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
        >
          <label className={row}>
            <input type="checkbox" className={box} checked={known !== undefined && known !== null} disabled={busy || known === undefined} onChange={() => void toggleAll()} />
            Save to All saves
          </label>
          {(spaces.data?.spaces.length ?? 0) > 0 && (
            <div role="group" aria-label="Spaces" data-lenis-prevent className="mt-1 max-h-[min(240px,40dvh)] overflow-y-auto border-t border-line-row pt-1">
              {spaces.data!.spaces.map((s) => (
                <label key={s.id} className={row}>
                  <input type="checkbox" className={box} checked={known?.spaceIds.includes(s.id) ?? false} disabled={busy || known === undefined} onChange={() => void toggleSpace(s.id)} />
                  <span className="min-w-0 truncate">{s.name}</span>
                </label>
              ))}
            </div>
          )}
          <div className="mt-1 border-t border-line-row pt-1">
            {making ? (
              <form
                className="flex items-center gap-2 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) void createSpace();
                }}
              >
                <Input ref={nameRef} aria-label="New space name" aria-describedby={error ? errId : undefined} maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="Space name" className="h-9 min-h-9" />
                <Button type="submit" size="sm" disabled={busy || !name.trim()}>
                  Create
                </Button>
              </form>
            ) : (
              <button type="button" disabled={known === undefined} onClick={() => setMaking(true)} className={cn(row, "w-full text-left disabled:opacity-50")}>
                New space…
              </button>
            )}
          </div>
          {error && (
            <p id={errId} role="alert" className="px-2.5 py-1.5 text-[12px] text-danger">
              {error}
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
