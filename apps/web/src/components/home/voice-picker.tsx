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
import { StyleDetailsSheet } from "@/components/chat/style-details-sheet";

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
  const [detailsId, setDetailsId] = useState<string | null>(null);
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
              className="orbit-transition flex h-10 max-w-[210px] items-center gap-2 rounded-pill border border-line-control pl-2 pr-3.5 text-[13px] font-medium text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse data-[state=open]:border-inverse data-[state=open]:bg-inverse data-[state=open]:text-on-inverse max-sm:h-9 max-sm:w-[38px] max-sm:justify-center max-sm:px-0"
            >
              {/* Orbit's voice orb (system §2.5): a gradient, not a picture of anyone. */}
              <span
                aria-hidden
                className="block size-6 shrink-0 rounded-full bg-[radial-gradient(circle_at_30%_30%,#E8EBFF,#2A3BFF)] max-sm:size-5"
              />
              <span className="truncate max-sm:sr-only">{current ? current.name : "Your voice"}</span>
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
                      <button
                        type="button"
                        aria-label={`Details: ${v.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(false);
                          setDetailsId(v.id);
                        }}
                        className="orbit-transition shrink-0 rounded-pill border border-line-control px-2.5 py-1 text-[12px] font-medium text-text-2 hover:border-text-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                      >
                        Details
                      </button>
                    </div>
                  );
                })}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      <AddStyleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onReady={(id) => {
          setAddOpen(false);
          setDetailsId(id);
        }}
      />
      <StyleDetailsSheet styleId={detailsId} onClose={() => setDetailsId(null)} />
    </>
  );
}

function splitPosts(text: string) {
  return text
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
}

type AddTab = "paste" | "export";
type Phase = { kind: "form" } | { kind: "analysing"; count: number };

/** Learns the profile's own style from pasted posts or LinkedIn's data export. Stays open, with a status line, until it's ready. */
function AddStyleDialog({ open, onOpenChange, onReady }: { open: boolean; onOpenChange: (o: boolean) => void; onReady: (voiceStyleId: string) => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<AddTab>("paste");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const count = splitPosts(text).length;

  async function poll(jobId: string, voiceStyleId: string) {
    for (let i = 0; i < 150; i++) {
      await wait(i < 5 ? 800 : 2000);
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) continue;
        const job = (await res.json()) as { status: string; error?: string | null };
        if (job.status === "DONE") {
          setPhase({ kind: "form" });
          setText("");
          setFile(null);
          router.refresh();
          onReady(voiceStyleId);
          return;
        }
        if (job.status === "FAILED") {
          setPhase({ kind: "form" });
          setError(job.error || "Couldn't learn your style");
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setPhase({ kind: "form" });
    setError("Learning your style is taking longer than expected. Check back soon.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    let init: RequestInit;
    let analysing = 0;
    if (tab === "paste") {
      const posts = splitPosts(text);
      if (posts.length < 3 || posts.length > 30 || posts.some((p) => p.length < 200)) {
        setError(POSTS_ERROR);
        return;
      }
      analysing = posts.length;
      init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ posts }) };
    } else {
      if (!file) {
        setError("Choose Shares.csv or your LinkedIn export zip");
        return;
      }
      const form = new FormData();
      form.set("file", file);
      init = { method: "POST", body: form };
    }
    setError(null);
    setPhase({ kind: "analysing", count: analysing });
    try {
      const res = await fetch("/api/voice/own", init);
      const body = (await res.json().catch(() => ({}))) as { jobId?: string; voiceStyleId?: string; error?: string };
      if (!res.ok || !body.jobId || !body.voiceStyleId) {
        setPhase({ kind: "form" });
        setError(body.error || "Couldn't start learning your style");
        return;
      }
      void poll(body.jobId, body.voiceStyleId);
    } catch {
      setPhase({ kind: "form" });
      setError("Couldn't start learning your style");
    }
  }

  const analysing = phase.kind === "analysing";
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (analysing && !o ? undefined : onOpenChange(o))}>
      <Dialog.Portal>
        <Dialog.Overlay className={dialogOverlayClass} />
        <Dialog.Content className={cn(dialogContentClass, "max-w-lg")}>
          <Dialog.Title className={dialogTitleClass}>Add your style</Dialog.Title>
          <Dialog.Description className={dialogDescriptionClass}>
            Paste 3 to 30 of your own posts, or import your LinkedIn data export. We measure how you lay posts out and describe how you write, so new drafts sound like you.
          </Dialog.Description>
          <div role="tablist" aria-label="Where the posts come from" className="mt-4 flex gap-2">
            {(["paste", "export"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                disabled={analysing}
                onClick={() => {
                  setTab(t);
                  setError(null);
                }}
                className={cn(
                  "orbit-transition h-8 rounded-pill border px-3.5 text-[13px] font-medium disabled:opacity-50",
                  tab === t ? "border-inverse bg-inverse text-on-inverse" : "border-line-control text-text hover:border-text-3",
                )}
              >
                {t === "paste" ? "Paste posts" : "Import LinkedIn export"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-1.5" noValidate>
            {tab === "paste" ? (
              <>
                <Label htmlFor="voice-posts">Your posts</Label>
                <textarea
                  id="voice-posts"
                  rows={9}
                  value={text}
                  disabled={analysing}
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
              </>
            ) : (
              <>
                <Label htmlFor="voice-export">Shares.csv or the export zip</Label>
                <input
                  id="voice-export"
                  type="file"
                  accept=".csv,.zip,text/csv,application/zip"
                  disabled={analysing}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setError(null);
                  }}
                  className="text-[13px] text-text-2 file:mr-3 file:rounded-pill file:border file:border-line-control file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:text-text"
                />
                <p className="text-xs text-text-2">
                  In LinkedIn, open Settings, Data privacy, Get a copy of your data, and pick Posts. Up to 10 MB. We keep your newest 100 original posts and read nothing else in the file.
                </p>
              </>
            )}
            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
            {analysing && (
              <p role="status" data-style-status className="text-[13px] text-text-2">
                {phase.count > 0 ? `Analysing ${phase.count} posts…` : "Analysing your posts…"}
              </p>
            )}
            <div className={cn(dialogActionsClass, "mt-4")}>
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" disabled={analysing}>
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" disabled={analysing || (tab === "paste" ? !text.trim() : !file)}>
                {analysing ? "Analysing…" : "Learn my style"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
