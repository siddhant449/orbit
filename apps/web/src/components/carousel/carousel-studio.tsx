"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { m } from "motion/react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, CopyPlus, Download, Sparkles, Trash2 } from "lucide-react";
import { Button, cn, Hint, Input, Label, Pill, Segmented, StatusPill } from "@brandloop/ui";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@brandloop/ui/icons";
import { textareaClass } from "@/components/dialog-classes";
import { type Identity, type SlideInput, paletteFor, surfaceFor, surfaceSwatch } from "@/lib/carousel/layout";
import { exportCarouselPdf } from "@/lib/carousel/render";
import {
  BODY_MAX,
  carouselReducer,
  draftFor,
  draftKey,
  initialCarousel,
  MAX_SLIDES,
  serializeDraft,
  TITLE_MAX,
  type Aspect,
  type CarouselState,
  type Kit,
  type Slide,
  type TemplateId,
} from "@/lib/carousel/state";
import { REWRITES, type RewriteId } from "@/lib/carousel/ai";
import { carouselHeading, plainText } from "@/lib/carousel/view";
import { GenerateDialog, SourceForm, type SourcePost } from "./source-form";
import { SlideCanvas } from "./slide-canvas";

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 8)}`);

const TEMPLATE_OPTIONS: { id: TemplateId; label: string }[] = [
  { id: "ink", label: "Ink" },
  { id: "paper", label: "Paper" },
  { id: "gradient", label: "Gradient" },
  { id: "band", label: "Band" },
  { id: "mixed", label: "Mixed: ink covers, paper inside" },
];

type GenerateBody = { source?: string; rewrite?: RewriteId; slides?: { title: string; body: string }[] };

async function requestSlides(body: GenerateBody): Promise<{ ok: true; slides: { title: string; body: string }[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/carousel/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as { slides?: { title: string; body: string }[]; error?: string };
    if (!res.ok || !json.slides) return { ok: false, error: json.error ?? "Orbit couldn't write the slides this time. Try again." };
    return { ok: true, slides: json.slides };
  } catch {
    return { ok: false, error: "Couldn't reach Orbit. Check your connection and try again." };
  }
}

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Carousel studio (screens.md B4, p07 / p20). Everything lives in the page: carousels have no storage yet, so the
 * header says so and the work is kept as a browser draft. Slides are painted on canvas by the same code as the PDF
 * export, so the preview is the PDF.
 */
export function CarouselStudio({
  profileId,
  author,
  source,
  identities,
}: {
  profileId: string;
  /** The person's name, written into the PDF as its author. */
  author: string;
  source: SourcePost | null;
  identities: Record<Kit, Identity>;
}) {
  const [state, dispatch] = useReducer(carouselReducer, undefined, initialCarousel);
  const restored = useRef(false);
  const [busy, setBusy] = useState<null | "generate" | RewriteId | "export">(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  /** A draft from another post (or a blank carousel): offered, never applied on its own. */
  const [otherDraft, setOtherDraft] = useState<CarouselState | null>(null);
  const key = draftKey(profileId);
  const sourceId = source?.id ?? null;
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const titleRef = useRef<HTMLInputElement>(null);

  // The browser draft: read once after mount (the server can't see it), then written on every change.
  useEffect(() => {
    const { restore, other } = draftFor(readRaw(key), sourceId);
    if (restore) dispatch({ type: "load", state: restore });
    // Reading browser storage is the external system here; it can only happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOtherDraft(other);
    restored.current = true;
  }, [key, sourceId]);
  // Debounced, so the first run (still the empty state, before the restored draft renders) is cancelled by the next.
  useEffect(() => {
    if (!restored.current) return;
    const t = window.setTimeout(() => {
      try {
        if (state.slides.length) window.localStorage.setItem(key, serializeDraft(state, sourceId));
        // An empty studio keeps the offered draft until the person starts a new one.
        else if (!otherDraft) window.localStorage.removeItem(key);
      } catch {
        /* storage blocked or full: the page still works, the draft just isn't kept */
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [state, key, sourceId, otherDraft]);

  const { slides, activeId } = state;
  const activeIndex = slides.findIndex((s) => s.id === activeId);
  const active = activeIndex >= 0 ? slides[activeIndex]! : null;
  const identity = identities[state.kit];

  const inputFor = useCallback(
    (slide: Pick<Slide, "title" | "body">, index: number): SlideInput => ({
      slide,
      index,
      count: slides.length,
      template: state.template,
      aspect: state.aspect,
      kit: state.kit,
      logo: state.logo,
      identity,
    }),
    [slides.length, state.template, state.aspect, state.kit, state.logo, identity],
  );
  const activeInput = useMemo(() => (active ? inputFor({ title: active.title, body: active.body }, activeIndex) : null), [active, activeIndex, inputFor]);

  const focusRow = (id: string) => requestAnimationFrame(() => rowRefs.current.get(id)?.focus());

  function undoable(message: string, before: CarouselState) {
    // One undo at a time: a newer change replaces the older toast, whose snapshot would also roll this change back.
    toast(message, { id: "carousel-undo", action: { label: "Undo", onClick: () => dispatch({ type: "load", state: before }) } });
  }

  function addSlide() {
    if (slides.length >= MAX_SLIDES) return toast(`A carousel holds up to ${MAX_SLIDES} slides.`);
    dispatch({ type: "add", id: newId() });
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function remove(id: string) {
    const before = state;
    const index = slides.findIndex((s) => s.id === id);
    dispatch({ type: "delete", id });
    const next = slides[index + 1] ?? slides[index - 1];
    if (next) focusRow(next.id);
    undoable(`Deleted slide ${index + 1}.`, before);
  }

  /** Keys keep focus on the row; the Move buttons keep it on the button, or its twin once the end disables it. */
  function move(id: string, by: number, via: "keys" | "button" = "keys") {
    const from = slides.findIndex((s) => s.id === id);
    const to = Math.max(0, Math.min(slides.length - 1, from + by));
    if (from === to) return;
    dispatch({ type: "move", id, by });
    const name = plainText(slides[from]!.title).trim();
    setAnnounce(`${name ? `\u201c${name}\u201d` : `Slide ${from + 1}`} moved to position ${to + 1} of ${slides.length}.`);
    if (via === "keys") return focusRow(id);
    const atEnd = to === 0 || to === slides.length - 1;
    if (atEnd)
      requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-move="${by < 0 ? "down" : "up"}"]`)?.focus());
  }

  function duplicate(id: string) {
    if (slides.length >= MAX_SLIDES) return toast(`A carousel holds up to ${MAX_SLIDES} slides.`);
    const copy = newId();
    dispatch({ type: "duplicate", id, newId: copy });
    focusRow(copy);
  }

  function onRowKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const id = slides[index]!.id;
    const go = (i: number) => {
      const target = slides[Math.max(0, Math.min(slides.length - 1, i))]!;
      dispatch({ type: "select", id: target.id });
      focusRow(target.id);
    };
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) move(id, e.key === "ArrowUp" ? -1 : 1);
    else if (e.key === "ArrowUp") go(index - 1);
    else if (e.key === "ArrowDown") go(index + 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(slides.length - 1);
    else if (e.key === "Delete") remove(id);
    else return;
    e.preventDefault();
  }

  async function generate(body: GenerateBody, kind: "generate" | RewriteId) {
    setBusy(kind);
    setError(null);
    const before = state;
    const res = await requestSlides(body);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    dispatch({ type: "replace", slides: res.slides.map((s) => ({ id: newId(), ...s })) });
    const n = res.slides.length;
    if (before.slides.length) undoable(kind === "generate" ? `Wrote ${n} slides.` : `Rewrote the slides: ${REWRITES[kind].label.toLowerCase()}.`, before);
    else toast(`Wrote ${n} slides.`);
    return true;
  }

  async function exportPdf() {
    if (!slides.length) return;
    setBusy("export");
    setProgress({ done: 0, total: slides.length });
    try {
      const name = carouselHeading(source?.title ?? plainText(slides[0]!.title), slides.length);
      const blob = await exportCarouselPdf(
        slides.map((s, i) => inputFor(s, i)),
        { title: name, author },
        (done, total) => setProgress({ done, total }),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) || "carousel"}.pdf`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast(`Exported ${slides.length} ${slides.length === 1 ? "page" : "pages"} as a PDF. Upload it to LinkedIn as a document post.`);
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "The PDF couldn't be made in this browser.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  function startOver() {
    const before = state;
    dispatch({ type: "load", state: { ...initialCarousel(), template: state.template, aspect: state.aspect, kit: state.kit, logo: state.logo } });
    undoable("Cleared the carousel.", before);
  }

  const heading = carouselHeading(source?.title ?? (slides[0] ? plainText(slides[0].title) : ""), slides.length);
  const sourceText = source?.text ?? "";
  const working = busy !== null;

  return (
    <div className="flex w-full flex-col gap-4 px-4 pb-12 pt-6 md:px-8 md:pb-8 md:pt-[28px]">
      <header className="orbit-rise flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="truncate text-[12px] text-text-2">
            Carousel studio · {source ? <>from &ldquo;{source.title}&rdquo;</> : "new carousel"}
          </p>
          <h1 className="type-page-title text-text max-sm:text-[32px]">{heading}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KitSwitch value={state.kit} onChange={(kit) => dispatch({ type: "set", patch: { kit } })} />
          <Button variant="secondary" aria-describedby="carousel-pdf-note" onClick={() => void exportPdf()} disabled={!slides.length || working} aria-busy={busy === "export"}>
            <Download aria-hidden="true" />
            {busy === "export" && progress ? `Exporting ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : "Export PDF"}
          </Button>
          <Button aria-disabled="true" aria-describedby="carousel-storage-note" tabIndex={0} onClick={(e) => e.preventDefault()}>
            Attach to post
          </Button>
        </div>
      </header>

      <div id="carousel-storage-note" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-text-2">
        <StatusPill>Not saved yet</StatusPill>
        <span>Carousels save once storage lands. Until then this carousel stays as a draft in this browser, and attaching it to a post isn&apos;t available.</span>
        <span id="carousel-pdf-note">The PDF flattens each slide into an image, so its text can&apos;t be selected or searched.</span>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[220px_minmax(0,1fr)_240px] xl:grid-cols-[250px_minmax(0,1fr)_260px]">
        {/* Slides */}
        <section aria-labelledby="slides-heading" className="order-2 flex min-w-0 flex-col gap-2 lg:order-1">
          <h2 id="slides-heading" className="sr-only">
            Slides
          </h2>
          {slides.length > 0 && (
            <ol className="flex flex-col gap-2" aria-describedby="slides-keys">
              {slides.map((slide, i) => {
                const selected = slide.id === activeId;
                return (
                  <m.li key={slide.id} layout="position" transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                    <div
                      className={cn(
                        "orbit-transition rounded-card-sm border bg-panel",
                        selected ? "border-[rgba(124,138,255,0.5)]" : "border-transparent hover:border-line-hover",
                      )}
                      data-slide-row=""
                    >
                      <button
                        ref={(el) => {
                          if (el) rowRefs.current.set(slide.id, el);
                          else rowRefs.current.delete(slide.id);
                        }}
                        type="button"
                        aria-current={selected ? "true" : undefined}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
                        tabIndex={selected || (!activeId && i === 0) ? 0 : -1}
                        onClick={() => dispatch({ type: "select", id: slide.id })}
                        onKeyDown={(e) => onRowKey(e, i)}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-card-sm p-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                      >
                        <span className={cn("w-4 shrink-0 text-[11px] tabular-nums", selected ? "font-medium text-accent-text" : "text-text-2")}>{i + 1}</span>
                        <span
                          aria-hidden="true"
                          className={cn("block w-10 shrink-0 rounded-[6px] border border-line", state.aspect === "4:5" ? "aspect-[4/5]" : "aspect-square")}
                          style={{ background: surfaceSwatch(surfaceFor(state.template, i, slides.length), state.kit) }}
                        />
                        <span className={cn("line-clamp-3 min-w-0 flex-1 text-[12px] leading-[1.3]", slide.title.trim() ? "text-text" : "text-text-3")}>
                          {plainText(slide.title).trim() || "Untitled slide"}
                        </span>
                      </button>
                      {selected && (
                        <div role="group" aria-label={`Slide ${i + 1} actions`} className="flex items-center gap-1 px-2.5 pb-2.5">
                          <RowAction label="Move slide up" data-move="up" onClick={() => move(slide.id, -1, "button")} disabled={i === 0}>
                            <ArrowUp />
                          </RowAction>
                          <RowAction label="Move slide down" data-move="down" onClick={() => move(slide.id, 1, "button")} disabled={i === slides.length - 1}>
                            <ArrowDown />
                          </RowAction>
                          <RowAction label="Duplicate slide" onClick={() => duplicate(slide.id)} disabled={slides.length >= MAX_SLIDES}>
                            <CopyPlus />
                          </RowAction>
                          <RowAction label="Delete slide" onClick={() => remove(slide.id)} className="ml-auto hover:text-danger">
                            <Trash2 />
                          </RowAction>
                        </div>
                      )}
                    </div>
                  </m.li>
                );
              })}
            </ol>
          )}
          <button
            type="button"
            onClick={addSlide}
            disabled={slides.length >= MAX_SLIDES}
            className="orbit-transition flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-card-sm border border-dashed border-line-control text-[12px] text-text-2 hover:border-text-3 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusIcon size={14} />
            Add slide
          </button>
          {slides.length > 1 && (
            <p id="slides-keys" className="px-1 text-[12px] leading-[1.5] text-text-3">
              Arrow keys pick a slide. Alt + arrows move it, Delete removes it.
            </p>
          )}
          <p aria-live="polite" className="sr-only">
            {announce}
          </p>
        </section>

        {/* Canvas */}
        <section
          aria-label="Slide preview"
          className="order-1 flex min-w-0 flex-col items-center gap-4 rounded-[20px] border border-(color:--panel-border) bg-panel p-4 shadow-[var(--panel-highlight),var(--shadow-card)] sm:p-6 lg:order-2"
        >
          {activeInput && active ? (
            <>
              <div className="flex w-full items-center justify-between gap-3">
                <p className="text-[12px] text-text-2 tabular-nums">
                  Slide {activeIndex + 1} of {slides.length}
                </p>
                <Segmented<Aspect>
                  label="Slide shape"
                  value={state.aspect}
                  onChange={(aspect) => dispatch({ type: "set", patch: { aspect } })}
                  options={[
                    { value: "4:5", label: "Portrait 4:5" },
                    { value: "1:1", label: "Square 1:1" },
                  ]}
                  className="bg-ground"
                />
              </div>
              <div className={cn("w-full", state.aspect === "4:5" ? "max-w-[420px]" : "max-w-[460px]")}>
                <SlideCanvas input={activeInput} className="rounded-[12px] shadow-elevation-draft" />
              </div>
              <Pager
                count={slides.length}
                index={activeIndex}
                onGo={(i) => dispatch({ type: "select", id: slides[i]!.id })}
              />
              <SlideEditor
                key={active.id}
                slide={active}
                index={activeIndex}
                titleRef={titleRef}
                onChange={(patch) => dispatch({ type: "edit", id: active.id, patch })}
              />
            </>
          ) : (
            <div className="flex w-full max-w-[460px] flex-1 flex-col justify-center gap-5 py-6 sm:py-10">
              <div className="flex flex-col gap-2">
                <h2 className="type-card-title text-text">{source ? "Turn this post into slides" : "Start from a post"}</h2>
                <p className="text-[14px] leading-[1.55] text-text-2">
                  Paste a post or describe the topic, and Orbit writes the slides in your voice. You can edit every word after.
                </p>
              </div>
              <SourceForm
                initial={sourceText}
                busy={busy === "generate"}
                error={error}
                submitLabel="Generate slides"
                onSubmit={(text) => generate({ source: text }, "generate")}
              />
              <div className="flex items-center gap-3 text-[13px] text-text-2">
                <span aria-hidden="true" className="h-px flex-1 bg-line-3" />
                or
                <span aria-hidden="true" className="h-px flex-1 bg-line-3" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={addSlide}>
                  <PlusIcon size={16} />
                  Start with a blank slide
                </Button>
                {otherDraft && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      dispatch({ type: "load", state: otherDraft });
                      setOtherDraft(null);
                    }}
                  >
                    Restore your last carousel ({otherDraft.slides.length} {otherDraft.slides.length === 1 ? "slide" : "slides"})
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Rail */}
        <aside aria-label="Carousel design" className="order-3 flex min-w-0 flex-col gap-3">
          <RailPanel title="Template">
            <TemplatePicker value={state.template} kit={state.kit} onChange={(template) => dispatch({ type: "set", patch: { template } })} />
          </RailPanel>

          <RailPanel title={`Brand kit · ${state.kit === "orbit" ? "Orbit" : "Personal"}`}>
            <div className="flex gap-1.5" aria-hidden="true">
              {kitDots(state.kit).map((c) => (
                <span key={c} className="block size-7 rounded-full border border-line-hover" style={{ background: c }} />
              ))}
            </div>
            <dl className="flex flex-col gap-2.5 text-[12px]">
              <div className="flex justify-between gap-3">
                <dt className="text-text-2">Display</dt>
                <dd className="text-text">Bricolage Grotesque</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-text-2">Body</dt>
                <dd className="text-text">Geist</dd>
              </div>
            </dl>
            <div className="flex items-center justify-between gap-3 text-[12px]">
              <span id="logo-toggle" className="text-text-2">
                Orbit mark
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={state.logo}
                aria-labelledby="logo-toggle"
                onClick={() => dispatch({ type: "set", patch: { logo: !state.logo } })}
                className={cn(
                  "orbit-transition relative h-4 w-7 shrink-0 cursor-pointer rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
                  state.logo ? "bg-accent" : "bg-(--toggle-off)",
                )}
              >
                <span className={cn("orbit-transition absolute top-0.5 size-3 rounded-full bg-white", state.logo ? "left-[14px]" : "left-0.5")} />
              </button>
            </div>
            <p className="text-[12px] leading-[1.5] text-text-3">Your own colours, fonts and logo arrive with brand kits.</p>
          </RailPanel>

          <RailPanel title="Rewrite slides">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(REWRITES) as RewriteId[]).map((id) => (
                <Pill
                  key={id}
                  aria-pressed={undefined}
                  disabled={!slides.length || working}
                  aria-busy={busy === id}
                  onClick={() => void generate({ rewrite: id, slides: slides.map(({ title, body }) => ({ title, body })), source: sourceText.trim().length >= 20 ? sourceText : undefined }, id)}
                  className="min-h-8 px-3 text-[12px] font-normal disabled:pointer-events-none disabled:opacity-40"
                >
                  {busy === id ? "Rewriting…" : REWRITES[id].label}
                </Pill>
              ))}
            </div>
            {error && slides.length > 0 && (
              <p role="alert" className="text-[12px] leading-[1.5] text-danger">
                {error}
              </p>
            )}
            <p className="text-[12px] leading-[1.5] text-text-3">Slides follow your voice rules. Under 12 words each.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)} disabled={working}>
                <Sparkles aria-hidden="true" />
                Generate from a post
              </Button>
              {slides.length > 0 && (
                <Button variant="ghost" size="sm" onClick={startOver} disabled={working}>
                  Start over
                </Button>
              )}
            </div>
          </RailPanel>
        </aside>
      </div>

      <GenerateDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setError(null);
        }}
        initial={sourceText}
        replacing={slides.length}
        busy={busy === "generate"}
        error={error}
        onSubmit={async (text) => {
          const ok = await generate({ source: text }, "generate");
          if (ok) setDialogOpen(false);
          return ok;
        }}
      />
    </div>
  );
}

function kitDots(kit: Kit): string[] {
  const ink = paletteFor("ink", kit);
  const accent = paletteFor("accent", kit);
  return [ink.bg as string, accent.bg as string, ink.accent, paletteFor("paper", kit).bg as string];
}

function RailPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-(color:--panel-border) bg-panel p-5 shadow-[var(--panel-highlight),var(--shadow-card)]">
      <h2 className="text-[13px] font-medium text-text">{title}</h2>
      {children}
    </section>
  );
}

function RowAction({
  label,
  children,
  className,
  ...props
}: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string; "data-move"?: "up" | "down" }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "orbit-transition grid size-8 cursor-pointer place-items-center rounded-full text-text-2 hover:bg-line-soft hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function Pager({ count, index, onGo }: { count: number; index: number; onGo: (i: number) => void }) {
  return (
    <nav aria-label="Slides pager" className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous slide"
        onClick={() => onGo(index - 1)}
        disabled={index <= 0}
        className="orbit-transition grid size-8 cursor-pointer place-items-center rounded-full text-text-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-30"
      >
        <ChevronLeftIcon size={14} />
      </button>
      <div className="flex max-w-[60vw] flex-wrap items-center justify-center">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => onGo(i)}
            className="grid size-6 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-accent-text"
          >
            <span className={cn("orbit-transition block rounded-full", i === index ? "size-2 bg-accent-text" : "size-1.5 bg-faint")} />
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Next slide"
        onClick={() => onGo(index + 1)}
        disabled={index >= count - 1}
        className="orbit-transition grid size-8 cursor-pointer place-items-center rounded-full text-text-2 hover:text-text focus-visible:outline-2 focus-visible:outline-accent-text disabled:opacity-30"
      >
        <ChevronRightIcon size={14} />
      </button>
    </nav>
  );
}

function SlideEditor({
  slide,
  index,
  titleRef,
  onChange,
}: {
  slide: Slide;
  index: number;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onChange: (patch: Partial<Pick<Slide, "title" | "body">>) => void;
}) {
  const words = plainText(slide.title).trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="slide-title">Slide {index + 1} title</Label>
          <span className={cn("text-[12px] tabular-nums", words > 12 ? "text-danger" : "text-text-3")}>{words} / 12 words</span>
        </div>
        <Input
          id="slide-title"
          ref={titleRef}
          value={slide.title}
          maxLength={TITLE_MAX}
          placeholder="The one line this slide says"
          aria-describedby="slide-title-hint"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <Hint id="slide-title-hint">Wrap words in *asterisks* to colour them.</Hint>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="slide-body">Supporting line</Label>
          <span className="text-[12px] tabular-nums text-text-3">
            {slide.body.length} / {BODY_MAX}
          </span>
        </div>
        <textarea
          id="slide-body"
          value={slide.body}
          maxLength={BODY_MAX}
          rows={3}
          placeholder="Optional. A sentence that backs the title up."
          onChange={(e) => onChange({ body: e.target.value })}
          className={textareaClass}
        />
      </div>
    </div>
  );
}

function KitSwitch({ value, onChange }: { value: Kit; onChange: (k: Kit) => void }) {
  const options: { value: Kit; label: string; dot: string }[] = [
    { value: "orbit", label: "Orbit kit", dot: "var(--accent)" },
    { value: "personal", label: "Personal", dot: "var(--text)" },
  ];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = (i + 1) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Brand kit" className="flex gap-1 rounded-pill bg-segmented-fill p-1">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "orbit-transition inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-pill px-3.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
              selected ? "bg-inverse font-medium text-on-inverse" : "text-text-2 hover:text-text",
            )}
          >
            <span aria-hidden="true" className="block size-2.5 rounded-full" style={{ background: selected && o.value === "personal" ? "var(--on-inverse)" : o.dot }} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function TemplatePicker({ value, kit, onChange }: { value: TemplateId; kit: Kit; onChange: (t: TemplateId) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = TEMPLATE_OPTIONS.findIndex((o) => o.id === value);
  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = TEMPLATE_OPTIONS.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = i === last ? 0 : i + 1;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = i === 0 ? last : i - 1;
    if (next === null) return;
    e.preventDefault();
    onChange(TEMPLATE_OPTIONS[next]!.id);
    refs.current[next]?.focus();
  }
  const swatch = (id: TemplateId): string =>
    id === "mixed"
      ? `linear-gradient(90deg, ${surfaceSwatch("paper", kit)} 50%, ${surfaceSwatch("ink", kit)} 50%)`
      : surfaceSwatch(surfaceFor(id, 1, 3), kit);
  return (
    <div className="grid grid-cols-3 gap-1.5">
      <div role="radiogroup" aria-label="Template" className="contents">
        {TEMPLATE_OPTIONS.map((o, i) => (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={i === current}
            aria-label={o.label}
            title={o.label}
            tabIndex={i === current ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "orbit-transition block aspect-[4/5] cursor-pointer rounded-[8px] border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text motion-safe:hover:-translate-y-px",
              i === current ? "border-accent-text ring-1 ring-accent-text" : "border-line",
            )}
            style={{ background: swatch(o.id) }}
          />
        ))}
      </div>
      <span
        role="img"
        aria-label="Custom template: arrives with brand kits"
        title="Custom template: arrives with brand kits"
        className="block aspect-[4/5] rounded-[8px] border border-dashed border-line-hover bg-panel"
      />
    </div>
  );
}
