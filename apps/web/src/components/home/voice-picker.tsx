"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import { toast } from "sonner";
import { Button, Label, cn } from "@brandloop/ui";
import { CheckIcon, PlusIcon, SearchIcon } from "@brandloop/ui/icons";
import {
  dialogActionsClass,
  dialogContentClass,
  dialogDescriptionClass,
  dialogOverlayClass,
  dialogTitleClass,
  textareaClass,
} from "@/components/dialog-classes";
import { selectVoiceAction } from "@/app/(app)/actions";

export type VoiceOption = { id: string; name: string; tagline: string; own: boolean };

const POSTS_ERROR = "Paste at least 3 posts of 200+ characters";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Hue per name so presets stay distinguishable: a cobalt-to-violet arc of the accent family (system §2.5 voice orb). */
const ORB_HUES = [232, 244, 256, 220, 268];

/** Voice orb avatar (screens.md B14): a gradient orb with the initials, generated, never a picture of anyone. */
export function VoiceAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const hue = ORB_HUES[hash(name) % ORB_HUES.length]!;
  return (
    <span
      aria-hidden
      data-initials={initials}
      style={{ background: `radial-gradient(circle at 30% 28%, hsl(${hue} 100% 92%), hsl(${hue} 88% 46%) 72%)` }}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold tracking-wide text-white [text-shadow:0_1px_2px_rgba(10,10,11,0.45)] before:content-[attr(data-initials)]",
        className,
      )}
    />
  );
}

type Row = { type: "voice"; voice: VoiceOption } | { type: "add" };

export function VoicePicker({ voices, selectedId }: { voices: VoiceOption[]; selectedId: string | null }) {
  const router = useRouter();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentId = optimistic ?? selectedId;
  const current = voices.find((v) => v.id === currentId) ?? null;

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase();
    const match = (v: VoiceOption) => !q || `${v.name} ${v.tagline}`.toLowerCase().includes(q);
    const own = voices.filter((v) => v.own && match(v));
    const presets = voices.filter((v) => !v.own && match(v));
    const showAdd = !q || "add your style".includes(q);
    return [
      ...own.map((voice) => ({ type: "voice", voice }) as Row),
      ...(showAdd ? [{ type: "add" } as Row] : []),
      ...presets.map((voice) => ({ type: "voice", voice }) as Row),
    ];
  }, [voices, query]);

  function choose(row: Row | undefined) {
    if (!row) return;
    if (row.type === "add") {
      setOpen(false);
      setAddOpen(true);
      return;
    }
    const id = row.voice.id;
    setOpen(false);
    if (id === currentId) return;
    setOptimistic(id);
    startTransition(async () => {
      const res = await selectVoiceAction(id);
      if (!res.ok) {
        setOptimistic(null);
        toast.error(res.error);
        return;
      }
      toast.success(`Writing style: ${row.voice.name}`);
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (active + (e.key === "ArrowDown" ? 1 : -1) + rows.length) % Math.max(rows.length, 1);
      setActive(next);
      listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(rows[active]);
    }
  }

  return (
    <>
      <div role="group" aria-label="Selected writing style" className="min-w-0">
        <Popover.Root
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (o) {
              setQuery("");
              setActive(0);
            }
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Change writing style, ${current ? current.name : "Your voice"}`}
              aria-busy={pending}
              title={current?.tagline || "Choose how your posts sound"}
              className="orbit-transition flex h-[var(--composer-control,40px)] max-w-[210px] items-center gap-2 rounded-pill border border-line-control pl-2 pr-3.5 text-[13px] font-medium text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse data-[state=open]:border-inverse data-[state=open]:bg-inverse data-[state=open]:text-on-inverse @max-md:w-[var(--composer-control,40px)] @max-md:justify-center @max-md:px-0"
            >
              {/* Orbit's voice orb (system §2.5): a gradient, not a picture of anyone. */}
              <span
                aria-hidden
                className="block size-6 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#E8EBFF,#2A3BFF)]"
              />
              <span className="truncate @max-md:sr-only">{current ? current.name : "Your voice"}</span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              aria-label="Choose a writing style"
              align="start"
              side="top"
              sideOffset={8}
              collisionPadding={16}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).querySelector("input")?.focus();
              }}
              className="orbit-panel z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-card p-0 shadow-[var(--panel-highlight),var(--shadow-draft)] data-[state=open]:animate-[orbit-pop_200ms_var(--ease-out)_both]"
            >
              <div className="flex items-center gap-2.5 border-b border-line px-4">
                <SearchIcon size={16} className="shrink-0 text-text-2" />
                <input
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-activedescendant={rows.length ? `${listId}-${active}` : undefined}
                  aria-label="Search writing styles"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKeyDown}
                  placeholder="Search writing styles"
                  className="h-12 w-full bg-transparent text-[14px] text-text outline-none placeholder:text-text-3"
                />
              </div>
              <div ref={listRef} id={listId} role="listbox" aria-label="Writing styles" className="max-h-[min(340px,50dvh)] overflow-y-auto p-1.5" data-lenis-prevent>
                {rows.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-text-2">No writing styles match that.</p>}
                {rows.map((row, i) => {
                  const isActive = i === active;
                  const common = {
                    id: `${listId}-${i}`,
                    "data-index": i,
                    onMouseMove: () => setActive(i),
                    onClick: () => choose(row),
                    className: cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors duration-150",
                      isActive && "bg-line-row",
                    ),
                  };
                  if (row.type === "add") {
                    return (
                      <div key="add" role="option" aria-selected={false} {...common}>
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-control text-text-2">
                          <PlusIcon size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium text-text">Add your style</span>
                          <span className="block truncate text-[12px] text-text-2">Learn your voice from your own posts</span>
                        </span>
                      </div>
                    );
                  }
                  const v = row.voice;
                  const sel = v.id === currentId;
                  return (
                    <div key={v.id} role="option" aria-selected={sel} {...common}>
                      <VoiceAvatar name={v.name} className="size-8 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium text-text">{v.own ? `${v.name} (your style)` : v.name}</span>
                        <span className="block truncate text-[12px] text-text-2">{v.tagline}</span>
                      </span>
                      {sel && <CheckIcon size={16} className="shrink-0 text-accent-text" />}
                    </div>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <AddStyleDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}

function splitPosts(text: string) {
  return text
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
}

function AddStyleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const count = splitPosts(text).length;

  async function poll(jobId: string) {
    for (let i = 0; i < 90; i++) {
      await wait(2000);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const job = (await res.json()) as { status: string; error?: string | null };
        if (job.status === "DONE") {
          router.refresh();
          toast.success("Your writing style is ready", { description: "Find it at the top of the style list." });
          return;
        }
        if (job.status === "FAILED") {
          toast.error(job.error || "Couldn't learn your style");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    toast.error("Learning your style is taking longer than expected. Check back soon.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const posts = splitPosts(text);
    if (posts.length < 3 || posts.length > 10 || posts.some((p) => p.length < 200)) {
      setError(POSTS_ERROR);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/voice/own", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ posts }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; error?: string };
      if (!res.ok || !body.jobId) {
        setError(body.error || "Couldn't start learning your style");
        return;
      }
      toast("Learning your style. It'll appear in the style list in a moment.");
      onOpenChange(false);
      setText("");
      void poll(body.jobId);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={cn(dialogContentClass, "max-w-lg")}>
          <Dialog.Title className={dialogTitleClass}>Add your style</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Paste 3 to 10 of your own posts, each at least 200 characters. We&apos;ll describe how you write so new drafts sound like you.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-1.5" noValidate>
            <Label htmlFor="voice-posts">Your posts</Label>
            <textarea
              id="voice-posts"
              rows={9}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              aria-invalid={error ? true : undefined}
              aria-describedby="voice-posts-hint"
              placeholder={"First post…\n---\nSecond post…\n---\nThird post…"}
              className={textareaClass}
            />
            <p id="voice-posts-hint" className="text-xs text-text-2">
              Separate posts with a line containing --- ({count} {count === 1 ? "post" : "posts"} found)
            </p>
            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
            <div className={cn(dialogActionsClass, "mt-4")}>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={submitting || !text.trim()}>
                {submitting ? "Starting…" : "Learn my style"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
