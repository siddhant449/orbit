"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { cn } from "@brandloop/ui";
import { EmojiIcon, ListBulletIcon, ListNumberIcon, RedoIcon, UndoIcon } from "@brandloop/ui/icons";

export type PreviewView = "mobile" | "tablet" | "desktop" | "hook";

const VIEWS: { value: PreviewView; label: string; wide?: boolean }[] = [
  { value: "mobile", label: "Mobile" },
  { value: "tablet", label: "Tablet", wide: true },
  { value: "desktop", label: "Desktop", wide: true },
  { value: "hook", label: "Hook only" },
];

const EMOJI = ["👋", "🚀", "💡", "🎯", "✅", "❌", "👉", "👇", "📈", "📉", "🔥", "✨", "🙌", "🤝", "💬", "🧠", "⚡", "📌", "🛠️", "🎉", "😅", "🙏", "⭐", "➡️"];

const item = cn(
  "orbit-transition inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-pill text-[13px] font-medium",
  "text-on-inverse hover:bg-on-inverse/10 aria-disabled:cursor-default aria-disabled:opacity-35 aria-disabled:hover:bg-transparent",
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text",
  "[&_svg]:size-4",
);

/**
 * The editor's formatting toolbar (screens.md B3, p05): an inverse pill. One tab stop; arrow keys, Home and End move
 * between items (WAI-ARIA toolbar). Only what LinkedIn shows: typed bullets and numbers, emoji, undo/redo, and the
 * preview width or hook view.
 */
export function EditorToolbar({
  controls,
  canUndo,
  canRedo,
  disabled,
  view,
  onUndo,
  onRedo,
  onList,
  onEmoji,
  onView,
}: {
  controls: string;
  canUndo: boolean;
  canRedo: boolean;
  /** The text can't be edited right now (the AI is writing, or the hook view is showing). */
  disabled: boolean;
  view: PreviewView;
  onUndo: () => void;
  onRedo: () => void;
  onList: (kind: "bullet" | "number") => void;
  onEmoji: (emoji: string) => void;
  onView: (view: PreviewView) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);

  function items(): HTMLElement[] {
    return Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-toolbar-item]") ?? []).filter((el) => el.offsetParent !== null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    const next =
      e.key === "ArrowRight" ? (i + 1) % list.length
      : e.key === "ArrowLeft" ? (i - 1 + list.length) % list.length
      : e.key === "Home" ? 0
      : e.key === "End" ? list.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    list[next]!.focus();
  }

  // Roving tabindex: the item last focused keeps the single tab stop.
  let index = 0;
  const tab = (): { tabIndex: number; onFocus: () => void; "data-toolbar-item": "" } => {
    const mine = index++;
    return { tabIndex: mine === active ? 0 : -1, onFocus: () => setActive(mine), "data-toolbar-item": "" };
  };

  const icon = (label: string, child: ReactNode, onClick: () => void, off: boolean, shortcut?: string) => (
    <button
      type="button"
      {...tab()}
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-keyshortcuts={shortcut?.replace("⌘", "Control+")}
      aria-disabled={off || undefined}
      onClick={() => !off && onClick()}
      className={cn(item, "w-9")}
    >
      {child}
    </button>
  );

  const editOff = disabled;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Post formatting"
      aria-controls={controls}
      onKeyDown={onKeyDown}
      className="post-toolbar mx-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-[24px] bg-inverse p-1.5 text-on-inverse shadow-elevation-composer"
    >
      {icon("Undo", <UndoIcon />, onUndo, editOff || !canUndo, "⌘Z")}
      {icon("Redo", <RedoIcon />, onRedo, editOff || !canRedo, "⌘⇧Z")}
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-on-inverse/20" />
      {icon("Bulleted lines", <ListBulletIcon />, () => onList("bullet"), editOff)}
      {icon("Numbered lines", <ListNumberIcon />, () => onList("number"), editOff)}
      <Popover.Root open={emojiOpen} onOpenChange={setEmojiOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            {...tab()}
            aria-label="Insert emoji"
            title="Insert emoji"
            aria-disabled={editOff || undefined}
            onClick={(e) => {
              if (editOff) e.preventDefault();
            }}
            className={cn(item, "w-9")}
          >
            <EmojiIcon />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={10}
            collisionPadding={16}
            aria-label="Emoji"
            className="orbit-panel z-50 grid w-[264px] grid-cols-6 gap-1 !p-2 data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {EMOJI.map((em) => (
              <button
                key={em}
                type="button"
                aria-label={`Insert ${em}`}
                onClick={() => {
                  setEmojiOpen(false);
                  onEmoji(em);
                }}
                className="orbit-transition grid size-10 place-items-center rounded-card-sm text-[20px] hover:bg-line-soft"
              >
                {em}
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-on-inverse/20" />
      <div role="group" aria-label="Preview" className="flex items-center gap-0.5">
        {VIEWS.map((v) => {
          const selected = view === v.value;
          return (
            <button
              key={v.value}
              type="button"
              {...tab()}
              aria-pressed={selected}
              onClick={() => onView(v.value)}
              className={cn(
                item,
                "px-3.5",
                v.wide && "max-sm:hidden",
                selected && "bg-ground text-text hover:bg-ground",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
