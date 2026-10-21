"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button, Label, cn } from "@brandloop/ui";
import { selectVoiceAction } from "@/app/(app)/actions";

export type VoiceOption = { id: string; name: string; tagline: string; own: boolean };

const POSTS_ERROR = "Paste at least 3 posts of 200+ characters";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Generated avatar: initials on a colour from the accent family. */
export function VoiceAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  const h = hash(name);
  const background = `hsl(${150 + (h % 36)} ${38 + (h % 14)}% ${24 + (h % 9)}%)`;
  return (
    <span
      aria-hidden
      data-initials={initials}
      style={{ background }}
      className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold tracking-wide text-white before:content-[attr(data-initials)]", className)}
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
              aria-label={`Change writing style, ${current ? current.name : "Writing style"}`}
              aria-busy={pending}
              title={current?.tagline || "Choose how your posts sound"}
              className="flex h-8 max-w-[210px] items-center gap-2 rounded-full border border-line py-0 pl-1 pr-2.5 text-[13px] text-ink-muted transition-colors hover:border-accent/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=open]:border-accent/60 data-[state=open]:text-ink"
            >
              {current ? (
                <VoiceAvatar name={current.name} />
              ) : (
                <span aria-hidden className="grid size-6 place-items-center rounded-full border border-dashed border-ink-faint">
                  <Plus className="size-3" />
                </span>
              )}
              <span className="truncate">{current ? current.name : "Writing style"}</span>
              <ChevronDown aria-hidden className="size-3.5 shrink-0" />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="start"
              side="top"
              sideOffset={8}
              collisionPadding={16}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                (e.currentTarget as HTMLElement).querySelector("input")?.focus();
              }}
              className="z-50 w-[min(340px,calc(100vw-32px))] overflow-hidden rounded-card border border-line bg-surface shadow-xl"
            >
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search aria-hidden className="size-4 shrink-0 text-ink-faint" />
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
                  className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
                />
              </div>
              <div ref={listRef} id={listId} role="listbox" aria-label="Writing styles" className="max-h-[min(320px,50dvh)] overflow-y-auto p-1.5">
                {rows.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-muted">No writing styles match that.</p>}
                {rows.map((row, i) => {
                  const isActive = i === active;
                  const common = {
                    id: `${listId}-${i}`,
                    "data-index": i,
                    onMouseMove: () => setActive(i),
                    onClick: () => choose(row),
                    className: cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-row px-2.5 py-2 text-left",
                      isActive && "bg-surface-sunk",
                    ),
                  };
                  if (row.type === "add") {
                    return (
                      <div key="add" role="option" aria-selected={false} {...common}>
                        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full border border-dashed border-accent/60 text-accent">
                          <Plus className="size-3.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">Add your style</span>
                          <span className="block truncate text-xs text-ink-muted">Learn your voice from your own posts</span>
                        </span>
                      </div>
                    );
                  }
                  const v = row.voice;
                  const sel = v.id === currentId;
                  return (
                    <div key={v.id} role="option" aria-selected={sel} {...common}>
                      <VoiceAvatar name={v.name} className="size-7 text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{v.own ? `${v.name} (your style)` : v.name}</span>
                        <span className="block truncate text-xs text-ink-muted">{v.tagline}</span>
                      </span>
                      {sel && <Check aria-hidden className="size-4 shrink-0 text-accent" />}
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-line bg-surface p-6 shadow-xl">
          <Dialog.Title className="font-display text-lg font-semibold">Add your style</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-ink-muted">
            Paste 3 to 10 of your own posts, each at least 200 characters. We&apos;ll describe how you write so new drafts sound like you.
          </Dialog.Description>
          <form onSubmit={submit} className="mt-4 space-y-2" noValidate>
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
              className="w-full resize-y rounded-row border border-line bg-paper px-3 py-2 text-sm leading-relaxed placeholder:text-ink-faint"
            />
            <p id="voice-posts-hint" className="text-xs text-ink-muted">
              Separate posts with a line containing --- ({count} {count === 1 ? "post" : "posts"} found)
            </p>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-3">
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
