"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { CONTENT_TYPES, FORMATS } from "@brandloop/ai";
import { Button, Segmented, StatusPill, cn } from "@brandloop/ui";
import { CheckIcon, CopyIcon } from "@brandloop/ui/icons";
import { ideaDraftHref, parseCachedIdeas, previousFrom, type IdeasBasis, type IdeasResponse, type Idea } from "@/lib/ideas";

type Count = "3" | "5" | "8";
const COUNTS = [
  { value: "3", label: "3" },
  { value: "5", label: "5" },
  { value: "8", label: "8" },
] as const;

type State =
  | { status: "idle" }
  | { status: "loading"; count: number }
  | { status: "error"; message: string }
  | { status: "done"; result: IdeasResponse; fresh: boolean };

const weekFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekLabel = (iso: string) => weekFmt.format(new Date(`${iso}T00:00:00Z`));

/** Per-viewer convenience: the last generated set survives a trip to the chat and back (this tab only). */
const cacheKey = (profileId: string, week: string) => `brandloop:ideas:${profileId}:${week}`;

function readCache(key: string): IdeasResponse | null {
  try {
    return parseCachedIdeas(sessionStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeCache(key: string, value: IdeasResponse) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What the ideas are built from, as small status pills; a missing strategy links to where it's made. */
function Basis({ basis }: { basis: IdeasBasis }) {
  return (
    <ul aria-label="Built from" className="flex flex-wrap items-center gap-2">
      <li>
        {basis.strategy ? (
          <StatusPill>Your strategy</StatusPill>
        ) : (
          <Link href="/strategy" className="orbit-transition inline-flex min-h-6 items-center rounded-pill border border-dashed border-line-3 px-2.5 text-[11px] text-text-2 hover:border-inverse hover:bg-inverse hover:text-on-inverse">
            No strategy yet, build it first
          </Link>
        )}
      </li>
      <li>
        <StatusPill>{plural(basis.memoryFiles, "memory file", "memory files")}</StatusPill>
      </li>
      <li>
        <StatusPill>{plural(basis.recentDrafts, "recent draft", "recent drafts")}</StatusPill>
      </li>
    </ul>
  );
}

function IdeaCard({ idea, index, fresh }: { idea: Idea & { id: string }; index: number; fresh: boolean }) {
  const [copied, setCopied] = useState(false);
  const titleId = `${idea.id}-title`;

  async function copyHook() {
    try {
      await navigator.clipboard.writeText(idea.hook);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy. Select the line and copy it instead.");
    }
  }

  return (
    <article
      aria-labelledby={titleId}
      className={cn("orbit-panel flex flex-col gap-3.5 p-5", fresh && "idea-arrive")}
      style={fresh ? ({ "--arrive-delay": `${index * 120}ms` } as CSSProperties) : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill>{FORMATS[idea.format].label}</StatusPill>
        <StatusPill>{CONTENT_TYPES[idea.contentType].label}</StatusPill>
      </div>
      <h3 id={titleId} className="text-[14px] font-medium text-text">
        {idea.title}
      </h3>
      <blockquote className="type-idea-hook text-text">
        <p>{idea.hook}</p>
      </blockquote>
      <p className="text-[14px] leading-[1.55] text-text-soft">{idea.angle}</p>
      <p className="text-[12px] leading-[1.5] text-text-3">
        <span className="text-text-2">Why it fits: </span>
        {idea.why}
      </p>
      <div className="mt-auto flex gap-2 pt-1">
        <button
          type="button"
          onClick={copyHook}
          className="orbit-transition inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-pill border border-line-control text-[13px] font-medium text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse"
        >
          {copied ? <CheckIcon size={14} aria-hidden="true" /> : <CopyIcon size={14} aria-hidden="true" />}
          {copied ? "Copied" : "Copy hook"}
        </button>
        {/* Ruling A22: home opens with this prompt in the composer, ready to edit; nothing is sent until the user does. */}
        <Button asChild variant="paper" className="h-9 min-h-9 flex-1 text-[13px]">
          <Link href={ideaDraftHref(idea)} aria-describedby={titleId}>
            Draft this
          </Link>
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {copied ? "Hook copied" : ""}
      </span>
    </article>
  );
}

function SkeletonCard({ index }: { index: number }) {
  return (
    <div aria-hidden="true" className="orbit-panel flex flex-col gap-3.5 p-5" style={{ opacity: 1 - index * 0.08 }}>
      <div className="flex gap-2">
        <div className="skeleton h-6 w-16 rounded-pill" />
        <div className="skeleton h-6 w-20 rounded-pill" />
      </div>
      <div className="skeleton h-3.5 w-1/2" />
      <div className="skeleton h-5 w-[92%]" />
      <div className="skeleton h-5 w-[70%]" />
      <div className="skeleton h-3.5 w-[85%]" />
      <div className="mt-3 flex gap-2">
        <div className="skeleton h-9 flex-1 rounded-pill" />
        <div className="skeleton h-9 flex-1 rounded-pill" />
      </div>
    </div>
  );
}

/**
 * "Ideas for this week" (screens.md B11, p13 grammar): generate N ideas from the strategy, memory and recent posts, then
 * turn any one into a chat with "Draft this". Nothing is stored on the server yet.
 */
export function IdeasBoard({ profileId, weekOf, basis }: { profileId: string; weekOf: string; basis: IdeasBasis }) {
  const [count, setCount] = useState<Count>("5");
  const [state, setState] = useState<State>({ status: "idle" });
  const abort = useRef<AbortController | null>(null);
  const key = cacheKey(profileId, weekOf);

  useEffect(() => {
    const cached = readCache(key);
    // Restores the tab's last set after a round trip to the chat; storage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setState({ status: "done", result: cached, fresh: false });
    return () => abort.current?.abort();
  }, [key]);

  async function generate() {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const n = Number(count);
    setState({ status: "loading", count: n });
    try {
      const res = await fetch("/api/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // On a regenerate, the ideas on screen go along so the next set doesn't repeat them.
        body: JSON.stringify({ count: n, previous: state.status === "done" ? previousFrom(state.result.ideas) : [] }),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as Partial<IdeasResponse> & { error?: string };
      if (!res.ok || !body.ideas) {
        setState({ status: "error", message: body.error ?? "Couldn't generate ideas. Try again." });
        return;
      }
      writeCache(key, body as IdeasResponse);
      setState({ status: "done", result: body as IdeasResponse, fresh: true });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ status: "error", message: "Couldn't reach Orbit. Check your connection and try again." });
    }
  }


  const loading = state.status === "loading";
  const done = state.status === "done";
  const shownBasis = done ? state.result.basis : basis;

  return (
    <div className="flex w-full max-w-[1180px] flex-col gap-4 px-5 pb-16 pt-8 md:px-7 md:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="type-page-title text-[34px] text-text focus-visible:outline-none">For you</h1>
          <p className="text-[14px] text-text-2">Ideas for the week of {weekLabel(weekOf)}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <span aria-hidden="true" className="text-[13px] text-text-3 max-sm:hidden">
            How many
          </span>
          <Segmented label="How many ideas" options={COUNTS} value={count} onChange={setCount} />
          <Button
            variant={done ? "secondary" : "primary"}
            className="max-sm:flex-1"
            onClick={generate}
            disabled={loading}
            aria-describedby="ideas-status"
          >
            {loading ? "Generating…" : done ? "Generate new ideas" : "Generate this week's ideas"}
          </Button>
        </div>
      </header>

      <Basis basis={shownBasis} />

      <p id="ideas-status" role="status" className="sr-only">
        {loading ? `Generating ${state.count} ideas` : done ? `${state.result.ideas.length} ideas ready` : ""}
      </p>

      {state.status === "idle" && (
        <section aria-labelledby="ideas-empty" className="orbit-panel mt-2 flex flex-col items-start gap-3 p-6 md:p-8">
          <h2 id="ideas-empty" className="type-card-title text-text">
            Nothing generated this week yet
          </h2>
          <div className="max-w-[62ch] space-y-2 text-[14px] leading-[1.6] text-text-2">
            <p>
              Orbit reads your strategy, your memory and your latest posts, then suggests post ideas for this week: the angle,
              a first line, the format and why it fits. Pick one and Orbit drafts it with you.
            </p>
            <p className="text-text-3">
              Ideas aren&apos;t saved yet, and arriving automatically on a day you choose is still to come. For now, generate
              them here whenever you like.
            </p>
          </div>
        </section>
      )}

      {state.status === "error" && (
        <section role="alert" className="orbit-panel mt-2 flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-[62ch] text-[14px] leading-[1.55] text-danger">{state.message}</p>
          <Button variant="secondary" size="sm" onClick={generate}>
            Try again
          </Button>
        </section>
      )}

      {(loading || done) && (
        <h2 className="sr-only">{loading ? "Generating ideas" : `${state.result.ideas.length} ideas for this week`}</h2>
      )}
      {(loading || done) && (
        <div aria-busy={loading} className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] content-start gap-3">
          {loading
            ? Array.from({ length: state.count }, (_, i) => <SkeletonCard key={i} index={i} />)
            : state.result.ideas.map((idea, i) => <IdeaCard key={`${state.result.generatedAt}-${idea.id}`} idea={idea} index={i} fresh={state.fresh} />)}
        </div>
      )}
    </div>
  );
}
