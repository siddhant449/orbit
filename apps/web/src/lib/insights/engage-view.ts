import { formatRelativeAge, plural } from "./format";
import { PROMPT_PARAM_MAX, promptHref } from "@/lib/prompt-param";

/**
 * View models for Engage (screens.md B10, p12): a comment queue of posts by people on the user's lists, and a leads
 * inbox of people who showed intent. Orbit only drafts; the user posts on LinkedIn themselves. Nothing fills these yet
 * (they need the LinkedIn ingestion described in the task report); the page renders its not-connected state.
 */

export type Fit = "high" | "medium" | "low";
export type QueueStatus = "new" | "draft_ready" | "done" | "skipped";

export type QueuePost = {
  id: string;
  author: { name: string; headline: string | null };
  excerpt: string;
  postUrl: string;
  postedAt: string;
  commentCount: number;
  fit: Fit;
  listIds: string[];
  /** Why it's in the queue ("On your audience plan"), shown on the focused card. */
  reason: string | null;
  draft: string | null;
  status: QueueStatus;
};

export type EngageList = { id: string; name: string };

/** Only what LinkedIn's Community Management API exposes: comments on the member's own posts. */
export type LeadKind = "comments" | "question";
export type Lead = {
  id: string;
  name: string;
  headline: string | null;
  kind: LeadKind;
  /** The signal in words: "Commented twice on your post", "Asked “what did churn look like after?”". */
  text: string;
  url: string;
  at: string;
  handled: boolean;
};

export type SessionStats = { minutes: number; commentsPosted: number; commentGoal: number; dmsAnswered: number; dmGoal: number };

export type EngageSnapshot = { posts: QueuePost[]; lists: EngageList[]; leads: Lead[]; session: SessionStats };

const FIT_RANK: Record<Fit, number> = { high: 0, medium: 1, low: 2 };
const isOpen = (p: QueuePost) => p.status === "new" || p.status === "draft_ready";

/** Open posts by fit then recency, done posts after them (most recent first); skipped posts drop out. */
export function visibleQueue(posts: QueuePost[], listId: string | null): QueuePost[] {
  const inList = posts.filter((p) => p.status !== "skipped" && (!listId || p.listIds.includes(listId)));
  const recent = (a: QueuePost, b: QueuePost) => b.postedAt.localeCompare(a.postedAt);
  const open = inList.filter(isOpen).sort((a, b) => FIT_RANK[a.fit] - FIT_RANK[b.fit] || recent(a, b));
  const done = inList.filter((p) => p.status === "done").sort(recent);
  return [...open, ...done];
}

export function queueSummary(open: number): string {
  return open === 0 ? "Nothing left in the queue" : `${plural(open, "post")} · sorted by fit, then recency`;
}

export type QueueState = { posts: QueuePost[]; listId: string | null; focusedId: string | null };
export type QueueAction =
  | { type: "focus"; id: string }
  | { type: "skip"; id: string }
  | { type: "done"; id: string }
  | { type: "filter"; listId: string | null }
  | { type: "drafted"; id: string; draft: string };

function firstOpen(posts: QueuePost[], listId: string | null): string | null {
  return visibleQueue(posts, listId).find(isOpen)?.id ?? null;
}

export function initialQueue(posts: QueuePost[], listId: string | null): QueueState {
  return { posts, listId, focusedId: firstOpen(posts, listId) };
}

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "focus": {
      const p = visibleQueue(state.posts, state.listId).find((x) => x.id === action.id);
      return p && isOpen(p) ? { ...state, focusedId: p.id } : state;
    }
    case "skip":
    case "done": {
      const status: QueueStatus = action.type === "skip" ? "skipped" : "done";
      const posts = state.posts.map((p) => (p.id === action.id ? { ...p, status } : p));
      const focusedId = state.focusedId === action.id || state.focusedId === null ? firstOpen(posts, state.listId) : state.focusedId;
      return { ...state, posts, focusedId };
    }
    case "filter":
      return { ...state, listId: action.listId, focusedId: firstOpen(state.posts, action.listId) };
    case "drafted":
      return {
        ...state,
        posts: state.posts.map((p) => (p.id === action.id ? { ...p, draft: action.draft, status: "draft_ready" } : p)),
      };
  }
}

export function authorLine(p: QueuePost): string {
  return p.author.headline ? `${p.author.name} · ${p.author.headline}` : p.author.name;
}

export function rowMeta(p: QueuePost, now: Date): string {
  return `${formatRelativeAge(new Date(p.postedAt), now)} · ${plural(p.commentCount, "comment")}`;
}

export function focusMeta(p: QueuePost, now: Date): string {
  const age = formatRelativeAge(new Date(p.postedAt), now);
  const posted = age === "just now" ? "posted just now" : `posted ${age} ago`;
  const parts = [p.reason, p.reason ? posted : posted[0]!.toUpperCase() + posted.slice(1), `${plural(p.commentCount, "comment")} so far`];
  return parts.filter(Boolean).join(" · ");
}

export function leadsWithIntent(leads: Lead[]): number {
  return leads.filter((l) => !l.handled).length;
}

/** Twenty minutes a day (p12 subtitle): the ring fills against that. */
export const SESSION_GOAL_MINUTES = 20;

export function sessionView(s: SessionStats) {
  const lines = [`${s.commentsPosted} of ${plural(s.commentGoal, "comment")} posted`];
  if (s.dmGoal > 0) lines.push(`${s.dmsAnswered} of ${plural(s.dmGoal, "DM")} answered`);
  return {
    ring: { value: Math.min(s.minutes, SESSION_GOAL_MINUTES), max: SESSION_GOAL_MINUTES, label: `${s.minutes}m` },
    lines,
  };
}

/** The home composer's `?prompt=` cap (`promptParam`), in code points. */
export const PROMPT_MAX = PROMPT_PARAM_MAX;
/** Pasted comment budget inside the reply prompt, so the whole prompt fits PROMPT_MAX with its closing quote. */
export const REPLY_SOURCE_MAX = 1500;
const EXCERPT_MAX = 900;
const DRAFT_MAX = 600;
const NAME_MAX = 120;

/** Trims to `max` code points (never splitting an emoji), adding "…" when it cut. */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max).join("").trimEnd()}…`;
}

/** The chat prompt for "Draft a reply": Orbit drafts in the user's voice, the user posts it themselves. */
export function replyPrompt(comment: string): string {
  return `Help me reply to this comment on LinkedIn. Keep it in my voice, short and specific, and end with a question if it fits:\n\n"${clip(comment, REPLY_SOURCE_MAX)}"`;
}

/** A new chat with the reply prompt in the composer (not sent), or null for blank text. */
export function replyHref(comment: string): string | null {
  return comment.trim() ? promptHref(replyPrompt(comment)) : null;
}

export type RedraftMode = "draft" | "angle" | "shorter";

/** "Another angle", "Shorter" and a first draft go through chat, prefilled (not sent), until in-place drafting lands. */
export function redraftHref(p: QueuePost, mode: RedraftMode): string {
  const source = `Post by ${clip(authorLine(p), NAME_MAX)}:\n\n"${clip(p.excerpt, EXCERPT_MAX)}"`;
  const draft = p.draft ? clip(p.draft, DRAFT_MAX) : null;
  const ask =
    mode === "draft" || !draft
      ? "Draft a comment I can post on this LinkedIn post. Keep it in my voice, add something specific, no flattery."
      : mode === "angle"
        ? `Give me a different angle for my comment on this LinkedIn post. My current draft:\n\n"${draft}"`
        : `Make my comment on this LinkedIn post shorter without losing the point. My current draft:\n\n"${draft}"`;
  return promptHref(`${ask}\n\n${source}`);
}
