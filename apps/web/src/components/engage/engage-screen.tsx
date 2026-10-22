"use client";

import { useReducer, useState } from "react";
import { toast } from "sonner";
import { Button, Ring, Segmented, pillClass } from "@brandloop/ui";
import {
  initialQueue,
  leadsWithIntent,
  queueReducer,
  queueSummary,
  sessionView,
  visibleQueue,
  type EngageSnapshot,
  type SessionStats,
} from "@/lib/insights/engage-view";
import { ConnectLinkedIn } from "@/components/analytics/connect-linkedin";
import { FocusCard, QueueRow } from "./comment-queue";
import { LeadsInbox } from "./leads-inbox";
import { ReplyDrafter } from "./reply-drafter";

export type EngageTab = "queue" | "leads" | "lists";

const EMPTY: EngageSnapshot = {
  posts: [],
  lists: [],
  leads: [],
  session: { minutes: 0, commentsPosted: 0, commentGoal: 0, dmsAnswered: 0, dmGoal: 0 },
};

/**
 * Engage (screens.md B10, p12 / p25): comment queue, leads inbox and lists, with today's session and the safety note
 * in the right rail. Everything renders from `snapshot`; with `connected={false}` (today, for everyone) each panel
 * shows its empty state and a "Connect LinkedIn" pill, and "Draft a reply" still works through chat.
 */
export function EngageScreen({
  snapshot,
  connected,
  now: nowIso,
  initialTab = "queue",
}: {
  snapshot: EngageSnapshot | null;
  connected: boolean;
  /** Server time (ISO), so relative ages match between server and client renders. */
  now: string;
  initialTab?: EngageTab;
}) {
  const data = snapshot ?? EMPTY;
  const now = new Date(nowIso);
  const [tab, setTab] = useState<EngageTab>(initialTab);
  const [queue, dispatch] = useReducer(queueReducer, data.posts, (posts) => initialQueue(posts, null));
  const intent = leadsWithIntent(data.leads);
  const rows = visibleQueue(queue.posts, queue.listId);
  const openCount = rows.filter((p) => p.status === "new" || p.status === "draft_ready").length;
  const focused = rows.find((p) => p.id === queue.focusedId) ?? null;

  const tabs = [
    { value: "queue", label: "Comment queue" },
    { value: "leads", label: intent > 0 ? `Leads inbox · ${intent}` : "Leads inbox" },
    { value: "lists", label: "Lists" },
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="type-page-title text-text focus-visible:outline-none">Engage</h1>
          <p className="text-[13px] text-text-2">
            Twenty minutes a day. Answer the people who comment on your posts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Engage view" options={tabs} value={tab} onChange={setTab} />
          <Button
            className="text-[13px]"
            onClick={() =>
              openCount > 0
                ? dispatch({ type: "focus", id: rows[0]!.id })
                : toast("Nothing to engage with yet", {
                    description: connected ? "Your queue is empty for now." : "Connect LinkedIn to fill your comment queue.",
                  })
            }
          >
            Start session
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-2.5">
          {tab === "queue" && (
            <>
              {data.lists.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {data.lists.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={queue.listId === l.id}
                      onClick={() => dispatch({ type: "filter", listId: queue.listId === l.id ? null : l.id })}
                      className={pillClass({ selected: queue.listId === l.id, className: "!min-h-8 !px-3 text-xs" })}
                    >
                      {l.name}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-text-3">{queueSummary(openCount)}</span>
                </div>
              )}
              {focused && (
                <FocusCard
                  key={focused.id}
                  post={focused}
                  now={now}
                  onSkip={() => dispatch({ type: "skip", id: focused.id })}
                  onPosted={() => dispatch({ type: "done", id: focused.id })}
                />
              )}
              {rows.length > 0 && (
                <div role="list" aria-label="Comment queue">
                  {rows
                    .filter((p) => p.id !== focused?.id)
                    .map((p) => (
                      <div role="listitem" key={p.id}>
                        <QueueRow post={p} now={now} onFocus={() => dispatch({ type: "focus", id: p.id })} />
                      </div>
                    ))}
                </div>
              )}
              {rows.length === 0 && <QueueEmpty connected={connected} />}
              <ReplyDrafter />
            </>
          )}
          {tab === "leads" && (
            <>
              <LeadsInbox leads={data.leads} />
              {!connected && <ConnectNote what="Leads come from comments on your posts, once LinkedIn is connected." />}
              <ReplyDrafter />
            </>
          )}
          {tab === "lists" && <ListsPanel lists={data.lists} connected={connected} />}
        </div>

        <aside aria-label="Session" className="flex min-w-0 flex-col gap-3">
          {tab !== "leads" && <LeadsInbox leads={data.leads} />}
          <SessionPanel session={data.session} active={connected && data.posts.length > 0} />
          <section className="flex flex-col gap-2 rounded-[20px] border border-line bg-panel p-5">
            <h2 className="text-xs font-normal text-text-2">How this is safe</h2>
            <p className="text-[13px] leading-normal text-text-soft">
              Orbit never comments for you. It drafts, you paste on LinkedIn. No extension, no automation, no pods.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function QueueEmpty({ connected }: { connected: boolean }) {
  return (
    <section
      aria-labelledby="queue-empty-h"
      className="orbit-panel flex flex-col items-start gap-3 !rounded-[20px] !border-[var(--accent-wash-line)] px-5 py-[18px] md:p-6"
    >
      <h2 id="queue-empty-h" className="type-card-title text-text">
        {connected ? "You're all caught up" : "Your comment queue is empty"}
      </h2>
      <p className="max-w-[60ch] text-sm leading-[1.55] text-text-2">
        {connected
          ? "New comments on your posts show up here as they arrive."
          : "Coming later: once LinkedIn is connected, Orbit will collect the comments on your own posts and draft a reply in your voice for each. You open LinkedIn and paste it yourself."}
      </p>
      {!connected && <ConnectLinkedIn size="sm" className="mt-1" />}
    </section>
  );
}

function ConnectNote({ what }: { what: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
      <p className="text-[13px] text-text-2">{what}</p>
      <ConnectLinkedIn size="sm" />
    </div>
  );
}

function ListsPanel({ lists, connected }: { lists: EngageSnapshot["lists"]; connected: boolean }) {
  return (
    <section aria-labelledby="lists-h" className="orbit-panel flex flex-col items-start gap-3 !rounded-[20px] p-5 md:p-6">
      <h2 id="lists-h" className="type-card-title text-text">
        Lists
      </h2>
      {lists.length === 0 ? (
        <>
          <p className="max-w-[60ch] text-sm leading-[1.55] text-text-2">
            Coming later: group the people who engage with you, such as customers or peers, and use each list as a filter on
            the comment queue.
          </p>
          {!connected && <ConnectLinkedIn size="sm" className="mt-1" />}
        </>
      ) : (
        <ul className="flex w-full flex-col">
          {lists.map((l) => (
            <li key={l.id} className="border-b border-line py-3 text-sm text-text last:border-0">
              {l.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Today's session (p12): a 56 px ring of minutes against twenty, then progress lines. Empty until a queue exists. */
export function SessionPanel({ session, active }: { session: SessionStats; active: boolean }) {
  const v = sessionView(session);
  return (
    <section aria-labelledby="session-h" className="orbit-panel flex flex-col gap-3 !rounded-[20px] p-5">
      <h2 id="session-h" className="text-sm font-medium text-text">
        Today&apos;s session
      </h2>
      <div className="flex items-center gap-3.5">
        <Ring value={v.ring.value} max={v.ring.max} size={56} strokeWidth={7} label="Minutes engaged today against a twenty-minute goal">
          <span className="font-sans text-[13px]">{v.ring.label}</span>
        </Ring>
        {active ? (
          <div className="flex flex-col gap-1 text-[13px]">
            {v.lines.map((l, i) => (
              <span key={l} className={i === 0 ? "text-text" : "text-text-2"}>
                {l}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[13px] leading-[1.5] text-text-2">No session yet. Sessions start once your queue has comments to answer.</p>
        )}
      </div>
    </section>
  );
}
