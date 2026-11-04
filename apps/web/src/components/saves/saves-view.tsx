"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertDialog, Popover } from "radix-ui";
import useSWR, { useSWRConfig } from "swr";
import useSWRInfinite from "swr/infinite";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, GripVertical, Pin, PinOff, Trash2 } from "lucide-react";
import { Button, Segmented, StatusPill, cn } from "@brandloop/ui";
import { EmptyState } from "@/components/page";
import { dialogActionsClass, dialogContentClass, dialogDescriptionClass, dialogOverlayClass, dialogTitleClass } from "@/components/dialog-classes";
import { fetchJson, isSavesKey, itemTitle, savesKey, SPACES_KEY, type SavedItemDto, type SavedKind, type SavedPage, type SpaceDto } from "@/lib/saves-client";
import { moveItem } from "./order";
import { SaveMenu } from "./save-menu";
import { SpaceDialog } from "./space-dialog";

type Filter = "all" | "templates" | "ideas" | "posts" | "images";
const FILTERS: { value: Filter; label: string; kinds: SavedKind[] }[] = [
  { value: "all", label: "All", kinds: [] },
  { value: "templates", label: "Templates and hooks", kinds: ["TEMPLATE", "HOOK"] },
  { value: "ideas", label: "Ideas", kinds: ["IDEA"] },
  { value: "posts", label: "Posts", kinds: ["POST"] },
  { value: "images", label: "Images", kinds: ["VISUAL"] },
];
const KIND_LABEL: Record<SavedKind, string> = { TEMPLATE: "Template", HOOK: "Hook", IDEA: "Idea", POST: "Post", VISUAL: "Image" };
const PAGE = 30;
const iconBtn =
  "orbit-transition grid size-9 shrink-0 place-items-center rounded-full text-text-2 hover:bg-line-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text";

function hrefOf(i: SavedItemDto): string | null {
  if (!i.available || !i.refId) return null;
  if (i.kind === "POST") return `/posts/${encodeURIComponent(i.refId)}`;
  if (i.kind === "VISUAL") return "/images";
  if (i.kind === "TEMPLATE") return "/templates";
  return null;
}

/** "Move" for keyboard and touch: step up or down, or jump to either end. */
function MoveMenu({ title, index, count, onMove }: { title: string; index: number; count: number; onMove: (to: number) => void }) {
  const [open, setOpen] = useState(false);
  const act = (to: number) => {
    setOpen(false);
    onMove(to);
  };
  const item = "orbit-transition flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] text-text hover:bg-line-row focus-visible:bg-line-row focus-visible:outline-none disabled:opacity-40";
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={`Move ${title}`} data-move-trigger className={iconBtn}>
          <GripVertical aria-hidden="true" className="size-4" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={16} aria-label={`Move ${title}`} className="orbit-panel z-50 w-48 rounded-card p-1.5 shadow-[var(--panel-highlight),var(--shadow-draft)]">
          <button type="button" className={item} disabled={index === 0} onClick={() => act(index - 1)}>
            <ArrowUp aria-hidden="true" className="size-4" /> Move up
          </button>
          <button type="button" className={item} disabled={index === count - 1} onClick={() => act(index + 1)}>
            <ArrowDown aria-hidden="true" className="size-4" /> Move down
          </button>
          <button type="button" className={item} disabled={index === 0} onClick={() => act(0)}>
            <ChevronsUp aria-hidden="true" className="size-4" /> Move to top
          </button>
          <button type="button" className={item} disabled={index === count - 1} onClick={() => act(count - 1)}>
            <ChevronsDown aria-hidden="true" className="size-4" /> Move to bottom
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Row({
  item,
  index,
  count,
  inSpace,
  dragging,
  onRemove,
  onMove,
  dragHandlers,
}: {
  item: SavedItemDto;
  index: number;
  count: number;
  inSpace: boolean;
  dragging: boolean;
  onRemove: () => void;
  onMove: (to: number) => void;
  dragHandlers: Record<string, unknown>;
}) {
  const title = itemTitle(item);
  const href = hrefOf(item);
  const detail = typeof item.snapshot.text === "string" && item.snapshot.title ? item.snapshot.text : typeof item.snapshot.excerpt === "string" ? item.snapshot.excerpt : null;
  const imageUrl = item.kind === "VISUAL" && typeof item.snapshot.imageUrl === "string" ? item.snapshot.imageUrl : null;
  return (
    <li data-saved-item={item.id} data-saved-kind={item.kind} {...dragHandlers} className={cn("orbit-panel flex items-center gap-3 p-4", dragging && "opacity-50")}>
      {imageUrl && item.available && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" loading="lazy" className="size-14 shrink-0 rounded-card-sm object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>{KIND_LABEL[item.kind]}</StatusPill>
          {!item.available && <StatusPill tone="danger">No longer available</StatusPill>}
        </div>
        {href ? (
          <Link href={href} className="line-clamp-2 text-[14px] font-medium text-text hover:underline">
            {title}
          </Link>
        ) : (
          <p className={cn("line-clamp-3 whitespace-pre-line text-[14px] leading-[1.5]", item.available ? "text-text" : "text-text-2")}>{title}</p>
        )}
        {detail && item.available && <p className="line-clamp-2 text-[13px] leading-[1.5] text-text-2">{detail}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {inSpace && <MoveMenu title={title} index={index} count={count} onMove={onMove} />}
        {item.available && <SaveMenu compact kind={item.kind} refId={item.refId ?? undefined} snapshot={item.snapshot} label={title} initialItemId={item.id} />}
        <button type="button" aria-label={`Remove ${title}`} onClick={onRemove} className={iconBtn}>
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>
    </li>
  );
}

/** The /saves screen: type tabs, the list, and (with `spaceId`) one space with rename, pin, delete and ordering. */
export function SavesView({ spaceId }: { spaceId?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // A local order applies only to the page set it was made on; fresh data from the server replaces it.
  const [pending, setPending] = useState<{ base: unknown; ids: string[] } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const router = useRouter();
  const { mutate: mutateAll } = useSWRConfig();
  const kinds = FILTERS.find((f) => f.value === filter)!.kinds;

  const spaces = useSWR<{ spaces: SpaceDto[] }>(SPACES_KEY, (u: string) => fetchJson(u), { revalidateOnFocus: false });
  const space = spaceId ? spaces.data?.spaces.find((s) => s.id === spaceId) : undefined;
  const { data, error: loadError, size, setSize, isLoading, isValidating } = useSWRInfinite<SavedPage>(
    (index, prev) => (prev && !prev.nextCursor ? null : savesKey({ kind: kinds.join(","), space: spaceId, cursor: index === 0 ? undefined : prev!.nextCursor!, limit: String(PAGE) })),
    (u: string) => fetchJson<SavedPage>(u),
    { revalidateOnFocus: false },
  );
  const loaded = useMemo(() => data?.flatMap((p) => p.items) ?? [], [data]);
  const order = pending && pending.base === data ? pending.ids : null;
  const items = useMemo(() => {
    if (!order) return loaded;
    const by = new Map(loaded.map((i) => [i.id, i]));
    return order.flatMap((id) => (by.has(id) ? [by.get(id)!] : []));
  }, [loaded, order]);
  const refresh = () => void mutateAll(isSavesKey);
  const missing = Boolean(spaceId) && (loadError || (spaces.data && !space));

  async function remove(item: SavedItemDto) {
    setError(null);
    try {
      await fetchJson(`/api/saves/${item.id}`, "DELETE");
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that. Try again.");
    }
  }

  async function reorder(ids: string[]) {
    if (!spaceId) return;
    setPending({ base: data, ids });
    setError(null);
    try {
      await fetchJson(`/api/spaces/${spaceId}/order`, "PUT", { itemIds: ids });
      refresh();
    } catch (e) {
      setPending(null);
      setError(e instanceof Error ? e.message : "Couldn't save the new order. Try again.");
    }
  }

  const ids = items.map((i) => i.id);
  const move = (from: number, to: number) => void reorder(moveItem(ids, from, to));

  async function togglePin() {
    if (!space) return;
    try {
      await fetchJson(`/api/spaces/${space.id}`, "PATCH", { pinned: !space.pinned });
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the space. Try again.");
    }
  }

  async function deleteSpace() {
    if (!space) return;
    try {
      await fetchJson(`/api/spaces/${space.id}`, "DELETE");
      await mutateAll(isSavesKey);
      router.push("/saves");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the space. Try again.");
    }
  }

  if (missing) {
    return (
      <EmptyState
        title="That space isn't available"
        body="It may have been deleted. Everything you saved is still in All saves."
        action={
          <Button asChild>
            <Link href="/saves">Go to All saves</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5" data-saves-view>
      {space && (
        <div className="flex flex-wrap items-center gap-2" data-space-header>
          {space.description && <p className="mr-auto max-w-[64ch] text-[14px] leading-[1.55] text-text-2">{space.description}</p>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" aria-pressed={space.pinned} onClick={() => void togglePin()}>
              {space.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
              {space.pinned ? "Unpin" : "Pin"}
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Rename
            </Button>
            <AlertDialog.Root>
              <AlertDialog.Trigger asChild>
                <Button type="button" variant="danger" size="sm">
                  Delete space
                </Button>
              </AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Overlay className={dialogOverlayClass} />
                <AlertDialog.Content className={`${dialogContentClass} max-w-md`}>
                  <AlertDialog.Title className={dialogTitleClass}>Delete {space.name}?</AlertDialog.Title>
                  <AlertDialog.Description className={dialogDescriptionClass}>Everything in it stays in All saves.</AlertDialog.Description>
                  <div className={dialogActionsClass}>
                    <AlertDialog.Cancel asChild>
                      <Button variant="ghost">Cancel</Button>
                    </AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button onClick={() => void deleteSpace()}>Delete space</Button>
                    </AlertDialog.Action>
                  </div>
                </AlertDialog.Content>
              </AlertDialog.Portal>
            </AlertDialog.Root>
          </div>
        </div>
      )}

      <Segmented label="Type" value={filter} onChange={setFilter} options={FILTERS.map(({ value, label }) => ({ value, label }))} className="max-w-full self-start overflow-x-auto" />

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      {loadError ? (
        <EmptyState title="Couldn't load your saves" body="Reload the page to try again." />
      ) : isLoading ? (
        <p role="status" className="text-[14px] text-text-2">
          Loading your saves…
        </p>
      ) : items.length === 0 ? (
        <EmptyState
          title={space ? "Nothing in this space yet" : filter === "all" ? "Nothing saved yet" : "Nothing saved here yet"}
          body={
            space
              ? "Use Save on a template, hook, idea, post or image and tick this space."
              : "Use Save on templates, hooks, ideas, posts and images and they will appear here, newest first."
          }
        />
      ) : (
        <>
          <p className="text-[13px] text-text-3" data-saves-count>
            {items.length} {items.length === 1 ? "item" : "items"}
            {space ? ` in ${space.name}` : ""}
          </p>
          <ul className="flex flex-col gap-3">
            {items.map((item, i) => (
              <Row
                key={item.id}
                item={item}
                index={i}
                count={items.length}
                inSpace={Boolean(space)}
                dragging={dragId === item.id}
                onRemove={() => void remove(item)}
                onMove={(to) => move(i, to)}
                dragHandlers={
                  space
                    ? {
                        draggable: true,
                        onDragStart: (e: React.DragEvent) => {
                          setDragId(item.id);
                          e.dataTransfer.effectAllowed = "move";
                        },
                        onDragOver: (e: React.DragEvent) => dragId && e.preventDefault(),
                        onDrop: (e: React.DragEvent) => {
                          e.preventDefault();
                          const from = ids.indexOf(dragId ?? "");
                          setDragId(null);
                          if (from >= 0 && from !== i) move(from, i);
                        },
                        onDragEnd: () => setDragId(null),
                      }
                    : {}
                }
              />
            ))}
          </ul>
          {data?.at(-1)?.nextCursor && (
            <Button type="button" variant="secondary" className="self-center" disabled={isValidating} onClick={() => void setSize(size + 1)}>
              {isValidating ? "Loading" : "Show more"}
            </Button>
          )}
        </>
      )}
      <SpaceDialog open={editing} onOpenChange={setEditing} space={space} />
    </div>
  );
}
