"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Button, NativeSelect, StatusPill, cn } from "@brandloop/ui";
import { SaveMenu } from "@/components/saves/save-menu";
import { DAYS, groupIdeas, setHidden, type IdeaDto, type WeekDto } from "@/lib/ideas/for-you";

const weekFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekLabel = (iso: string) => `Week of ${weekFmt.format(new Date(`${iso}T00:00:00Z`))}`;

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { ok: false, status: 0, data: { error: "Couldn't reach Orbit. Check your connection and try again." } };
  }
}

const outline =
  "orbit-transition inline-flex h-9 items-center justify-center gap-2 rounded-pill border border-line-control px-4 text-[13px] font-medium text-text hover:border-inverse hover:bg-inverse hover:text-on-inverse disabled:opacity-50";

function IdeaCard({ idea, index, fresh, onHide, onDraft, busy }: { idea: IdeaDto; index: number; fresh: boolean; onHide: (hidden: boolean) => void; onDraft: () => void; busy: boolean }) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-idea={idea.id}
      className={cn("orbit-panel flex flex-col gap-3.5 p-5", fresh && "idea-arrive")}
      style={fresh ? ({ "--arrive-delay": `${index * 120}ms` } as CSSProperties) : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill>{idea.category}</StatusPill>
        {idea.drafted && <StatusPill tone="accent">Drafted</StatusPill>}
      </div>
      <h3 id={titleId} className="type-idea-hook text-text">
        {idea.title}
      </h3>
      <p className="text-[14px] leading-[1.55] text-text-soft">{idea.detail}</p>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button variant="paper" className="h-9 min-h-9 flex-1 text-[13px]" onClick={onDraft} disabled={busy} aria-describedby={titleId}>
          {busy ? "Opening…" : idea.drafted ? "Open draft" : "Draft"}
        </Button>
        <SaveMenu compact kind="IDEA" snapshot={{ text: idea.title, title: idea.title, angle: idea.detail }} label={`idea ${idea.title}`} className="size-9 shrink-0 self-center" />
        <button type="button" className={outline} onClick={() => onHide(true)} aria-label={`Hide ${idea.title}`}>
          Hide
        </button>
      </div>
    </article>
  );
}

function Group({ title, count, children, defaultOpen }: { title: string; count: number; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group orbit-panel p-0">
      <summary className="orbit-transition flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-[inherit] px-5 py-3 text-[14px] font-medium text-text hover:bg-line-row focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent-text [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-[12px] font-normal text-text-3">
          {count}
          <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-line-4 p-5">{children}</div>
    </details>
  );
}

function CompactRow({ idea, action }: { idea: IdeaDto; action: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-[14px] text-text">{idea.title}</p>
        <p className="text-[12px] text-text-3">{idea.category}</p>
      </div>
      <div className="flex items-center gap-2">{action}</div>
    </li>
  );
}

/**
 * For you: this week's five stored ideas (Draft, Save, Hide), a Hidden section with Restore, earlier weeks collapsed,
 * and the day new ideas arrive. With no batch this week the page offers to make it; a failure says so and offers a retry.
 */
export function ForYou({ initialWeeks, currentWeek, generationDay }: { initialWeeks: WeekDto[]; currentWeek: string; generationDay: number }) {
  const router = useRouter();
  const [weeks, setWeeks] = useState(initialWeeks);
  const [fresh, setFresh] = useState(false);
  const [state, setState] = useState<"idle" | "making" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState(generationDay);
  const [dayError, setDayError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const selectId = useId();
  const g = groupIdeas(weeks, currentWeek);

  async function make() {
    setState("making");
    setError(null);
    const res = await call("/api/ideas/weekly", "POST");
    if (res.ok && Array.isArray(res.data.weeks)) {
      setWeeks(res.data.weeks as WeekDto[]);
      setFresh(true);
      setState("idle");
      return;
    }
    if (res.status === 409) {
      router.refresh();
      setState("idle");
      return;
    }
    setError(typeof res.data.error === "string" && res.status !== 502 ? res.data.error : "This week's ideas didn't arrive. Try again");
    setState("error");
  }

  async function hide(id: string, hidden: boolean) {
    const before = weeks;
    setWeeks(setHidden(weeks, id, hidden));
    const res = await call(`/api/ideas/${id}`, "PATCH", { hidden });
    if (!res.ok) {
      setWeeks(before);
      toast.error("Couldn't update that idea. Try again.");
    }
  }

  async function draft(idea: IdeaDto) {
    setDrafting(idea.id);
    const res = await call(`/api/ideas/${idea.id}/draft`, "POST");
    if (res.ok && typeof res.data.chatId === "string") {
      router.push(`/chat/${res.data.chatId}?idea=${idea.id}`);
      return;
    }
    setDrafting(null);
    toast.error(typeof res.data.error === "string" ? res.data.error : "Couldn't open a chat. Try again.");
  }

  async function changeDay(next: number) {
    const before = day;
    setDay(next);
    setDayError(null);
    const res = await call("/api/profile/generation-day", "PATCH", { day: next });
    if (!res.ok) {
      setDay(before);
      setDayError(typeof res.data.error === "string" ? res.data.error : "Couldn't change the day. Try again.");
    }
  }

  const making = state === "making";
  const cardProps = (idea: IdeaDto, i: number) => ({
    idea,
    index: i,
    fresh,
    busy: drafting === idea.id,
    onHide: (h: boolean) => void hide(idea.id, h),
    onDraft: () => void draft(idea),
  });

  return (
    <div className="flex w-full flex-col gap-5 px-5 pb-16 pt-8 md:px-7 md:pt-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="type-page-title text-[34px] text-text focus-visible:outline-none">For you</h1>
          <p className="text-[14px] text-text-2">{weekLabel(currentWeek)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={selectId} className="text-[13px] text-text-2">
            New ideas every
          </label>
          <NativeSelect id={selectId} value={day} onChange={(e) => void changeDay(Number(e.target.value))} className="h-9 w-auto">
            {DAYS.map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </div>
      </header>
      {dayError && (
        <p role="alert" className="text-[13px] text-danger">
          {dayError}
        </p>
      )}

      <p role="status" className="sr-only">
        {making ? "Making this week's ideas" : g.hasBatch ? `${g.thisWeek.length} ideas for this week` : ""}
      </p>

      {!g.hasBatch && (
        <section aria-labelledby="ideas-empty" className="orbit-panel flex flex-col items-start gap-3 p-6 md:p-8">
          <h2 id="ideas-empty" className="type-card-title text-text">
            No ideas for this week yet
          </h2>
          <p className="max-w-[62ch] text-[14px] leading-[1.6] text-text-2">
            Orbit reads your strategy, your memory and your latest posts, then picks five ideas for the week, each from a different piece of your own
            material. They arrive on their own on {DAYS[day - 1]}s; you can also make this week&apos;s now.
          </p>
          {state === "error" && (
            <p role="alert" className="text-[14px] text-danger">
              {error}
            </p>
          )}
          <Button onClick={() => void make()} disabled={making}>
            {making ? "Making ideas…" : state === "error" ? "Try again" : "Make this week's ideas"}
          </Button>
        </section>
      )}

      {making && (
        <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="orbit-panel flex flex-col gap-3.5 p-5" style={{ opacity: 1 - i * 0.08 }}>
              <div className="skeleton h-6 w-20 rounded-pill" />
              <div className="skeleton h-5 w-[92%]" />
              <div className="skeleton h-5 w-[70%]" />
              <div className="skeleton h-3.5 w-[85%]" />
            </div>
          ))}
        </div>
      )}

      {g.thisWeek.length > 0 && (
        <>
          <h2 className="sr-only">This week&apos;s ideas</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] content-start gap-3">
            {g.thisWeek.map((idea, i) => (
              <IdeaCard key={idea.id} {...cardProps(idea, i)} />
            ))}
          </div>
        </>
      )}
      {g.hasBatch && g.thisWeek.length === 0 && (
        <p className="text-[14px] text-text-2">You hid all of this week&apos;s ideas. Restore them from Hidden below.</p>
      )}

      {g.fromChats.length > 0 && (
        <Group title="From your chats this week" count={g.fromChats.length}>
          <ul className="flex flex-col gap-2">
            {g.fromChats.map((idea) => (
              <CompactRow
                key={idea.id}
                idea={idea}
                action={
                  <>
                    <Button variant="paper" size="sm" onClick={() => void draft(idea)} disabled={drafting === idea.id}>
                      {idea.drafted ? "Open draft" : "Draft"}
                    </Button>
                    <button type="button" className={outline} onClick={() => void hide(idea.id, true)} aria-label={`Hide ${idea.title}`}>
                      Hide
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        </Group>
      )}

      {g.hidden.length > 0 && (
        <Group title="Hidden" count={g.hidden.length}>
          <ul className="flex flex-col gap-2">
            {g.hidden.map((idea) => (
              <CompactRow
                key={idea.id}
                idea={idea}
                action={
                  <button type="button" className={outline} onClick={() => void hide(idea.id, false)} aria-label={`Restore ${idea.title}`}>
                    Restore
                  </button>
                }
              />
            ))}
          </ul>
        </Group>
      )}

      {g.earlier.length > 0 && (
        <section aria-labelledby="ideas-earlier" className="flex flex-col gap-3">
          <h2 id="ideas-earlier" className="text-[14px] font-medium text-text-2">
            Earlier weeks
          </h2>
          {g.earlier.map((w) => (
            <Group key={w.weekStartOn} title={weekLabel(w.weekStartOn)} count={w.ideas.length}>
              <ul className="flex flex-col gap-2">
                {w.ideas.map((idea) => (
                  <CompactRow
                    key={idea.id}
                    idea={idea}
                    action={
                      <>
                        <SaveMenu compact kind="IDEA" snapshot={{ text: idea.title, title: idea.title, angle: idea.detail }} label={`idea ${idea.title}`} className="size-9 shrink-0" />
                        <Button variant="paper" size="sm" onClick={() => void draft(idea)} disabled={drafting === idea.id}>
                          {idea.drafted ? "Open draft" : "Draft"}
                        </Button>
                        <button type="button" className={outline} onClick={() => void hide(idea.id, true)} aria-label={`Hide ${idea.title}`}>
                          Hide
                        </button>
                      </>
                    }
                  />
                ))}
              </ul>
            </Group>
          ))}
        </section>
      )}
    </div>
  );
}
