"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { groupChatsByDate } from "@brandloop/agent/client";
import { Button, cn } from "@brandloop/ui";
import { HISTORY_KEY } from "./history-key";

type ChatSummary = { id: string; title: string; pinned: boolean; lastActivityAt: string };
type History = { chats: ChatSummary[]; hasMore: boolean };

const fetchJson = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

const itemClass =
  "flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] text-text-soft outline-none transition-colors duration-150 data-[highlighted]:bg-line-row data-[highlighted]:text-text [&_svg]:size-4 [&_svg]:text-icon data-[highlighted]:[&_svg]:text-text";

const noop = () => () => {};

async function patchChat(id: string, body: { title?: string; pinned?: boolean }) {
  const res = await fetch(`/api/chat/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { cause?: string } | null)?.cause ?? "That change didn't save.");
}

function RenameField({ chat, onDone }: { chat: ChatSummary; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(chat.title);
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  return (
    <input
      autoFocus
      aria-label="Chat title"
      value={value}
      maxLength={120}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value.trim() || null);
        else if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(value.trim() || null)}
      className="h-8 w-full rounded-[8px] border border-line-control bg-panel px-3 text-[13px] text-text outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-text"
    />
  );
}

/** The sidebar's chat list (system §6.9, p01 / p03): grouped by day, the open chat on a `line-row` fill, rename / pin / delete per row. */
export function ChatHistory({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<History>(HISTORY_KEY, fetchJson);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  // Day buckets depend on the viewer's clock, so the server renders none.
  const now = useSyncExternalStore(noop, () => Math.floor(Date.now() / 60_000), () => null);

  async function rename(chat: ChatSummary, title: string | null) {
    setRenaming(null);
    if (!title || title === chat.title) return;
    try {
      await mutate(
        async (cur) => {
          await patchChat(chat.id, { title });
          return cur && { ...cur, chats: cur.chats.map((c) => (c.id === chat.id ? { ...c, title } : c)) };
        },
        {
          optimisticData: (cur) => ({ chats: (cur?.chats ?? []).map((c) => (c.id === chat.id ? { ...c, title } : c)), hasMore: cur?.hasMore ?? false }),
          revalidate: false,
        },
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function togglePin(chat: ChatSummary) {
    const flip = (cur: History | undefined): History => ({
      chats: (cur?.chats ?? []).map((c) => (c.id === chat.id ? { ...c, pinned: !chat.pinned } : c)),
      hasMore: cur?.hasMore ?? false,
    });
    try {
      // Optimistic, then the server's order (pinned first) on revalidation.
      await mutate(
        async (cur) => {
          await patchChat(chat.id, { pinned: !chat.pinned });
          return flip(cur);
        },
        { optimisticData: flip, rollbackOnError: true, revalidate: true },
      );
      toast.success(chat.pinned ? "Chat unpinned" : "Chat pinned");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(chat: ChatSummary) {
    setDeleting(null);
    const res = await fetch(`/api/chat/${encodeURIComponent(chat.id)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      toast.error("That chat wasn't deleted. Try again.");
      return;
    }
    await mutate();
    toast.success("Chat deleted");
    if (pathname === `/chat/${chat.id}`) router.push("/");
  }

  const chats = data?.chats ?? [];
  const groups = now === null ? [] : groupChatsByDate(chats, new Date(now * 60_000));

  return (
    <>
      {isLoading && (
        <div className="mt-1 flex flex-col gap-3 px-3" aria-hidden="true">
          <div className="skeleton h-3.5 w-[80%]" />
          <div className="skeleton h-3.5 w-[60%]" />
          <div className="skeleton h-3.5 w-[70%]" />
        </div>
      )}
      {error && !data && <p className="mt-1 px-3 text-[13px] text-danger">{"Your chats didn't load."}</p>}
      {data && chats.length === 0 && (
        <p className="mt-1 max-w-[26ch] px-3 text-[13px] leading-[1.5] text-text-3">Your conversations will be listed here once you start one.</p>
      )}
      {groups.map((group) => (
        <div key={group.label} className="mt-3.5 first:mt-0">
          <h3 className="mx-3 mb-1.5 text-[11px] text-text-3">{group.label}</h3>
          <ul className="flex flex-col gap-0.5">
            {group.chats.map((chat) => {
              const current = pathname === `/chat/${chat.id}`;
              if (renaming === chat.id) {
                return (
                  <li key={chat.id} className="px-0.5">
                    <RenameField chat={chat} onDone={(t) => void rename(chat, t)} />
                  </li>
                );
              }
              return (
                <li key={chat.id} className="history-row group relative">
                  <Link
                    href={`/chat/${chat.id}`}
                    onClick={onNavigate}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center rounded-[8px] pl-3 pr-9 text-[13px] transition-colors duration-150",
                      current ? "bg-line-row text-text" : "text-text-soft hover:bg-line-soft hover:text-text",
                    )}
                  >
                    {chat.pinned && <Pin aria-label="Pinned" className="mr-1.5 size-3 shrink-0" />}
                    <span className="truncate">{chat.title}</span>
                  </Link>
                  <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Chat options, ${chat.title}`}
                        className={cn(
                          "history-row__menu absolute right-0.5 top-0.5 !h-8 !w-8 !rounded-[8px] text-text-2 hover:!bg-line-row hover:text-text",
                        )}
                      >
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        side="bottom"
                        align="end"
                        sideOffset={4}
                        data-lenis-prevent
                        className="plate plate--sm z-50 w-44 p-1.5 data-[state=open]:animate-[plate-in_120ms_var(--ease-ink)_both]"
                      >
                        <DropdownMenu.Item className={itemClass} onSelect={() => setRenaming(chat.id)}>
                          <Pencil aria-hidden="true" />
                          Rename
                        </DropdownMenu.Item>
                        <DropdownMenu.Item className={itemClass} onSelect={() => void togglePin(chat)}>
                          {chat.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
                          {chat.pinned ? "Unpin" : "Pin"}
                        </DropdownMenu.Item>
                        <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line-3" />
                        <DropdownMenu.Item
                          className={cn(
                            itemClass,
                            "text-danger [&_svg]:text-danger data-[highlighted]:text-danger data-[highlighted]:[&_svg]:text-danger",
                          )}
                          onSelect={() => setDeleting(chat)}
                        >
                          <Trash2 aria-hidden="true" />
                          Delete
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <AlertDialog.Root open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/40 data-[state=open]:animate-[fade-in_180ms_var(--ease-ink)_both]" />
          <AlertDialog.Content className="plate plate--overlay fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 p-6 data-[state=open]:animate-[plate-in_180ms_var(--ease-ink)_both]">
            <AlertDialog.Title className="type-title-2">Delete this chat?</AlertDialog.Title>
            <AlertDialog.Description className="type-ui mt-2 text-ink-muted">
              “{deleting?.title}” leaves your chat list. This can’t be undone here.
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="danger" onClick={() => deleting && void remove(deleting)}>
                  Delete chat
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
