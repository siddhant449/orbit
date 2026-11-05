import type { DayKey } from "./days";

/** Items counted per local day: drafts (documents created) or posted posts (`postedAt`, marked by the writer). */
export type DraftsByDay = Record<DayKey, number>;

export type ChecklistItem = { id: string; title: string; detail: string; action: string; href: string; done: boolean };

/** Getting started, mapped to steps that exist in Orbit today; each row is done only when the data says so. */
export function gettingStarted(s: { strategy: boolean; identity: boolean; knowledge: boolean; voice: boolean; drafts: number }) {
  const items: ChecklistItem[] = [
    {
      id: "strategy",
      title: "Build your content strategy",
      detail: "Orbit turns what it knows about you into positioning, a content mix and an audience plan.",
      action: "Build",
      href: "/strategy",
      done: s.strategy,
    },
    {
      id: "about-you",
      title: "Tell Orbit about you",
      detail: "Your role, your story and what you're known for, saved as memories.",
      action: "Open",
      href: "/settings/memories",
      done: s.identity,
    },
    {
      id: "knowledge",
      title: "Connect your knowledge",
      detail: "Add notes, documents or links Orbit can draw on when it writes.",
      action: "Open",
      href: "/knowledge-base",
      done: s.knowledge,
    },
    {
      id: "voice",
      title: "Teach Orbit your voice",
      detail: "Paste three of your posts from the voice menu in the composer.",
      action: "Set it up",
      href: "/",
      done: s.voice,
    },
    {
      id: "first-draft",
      title: "Write your first draft",
      detail: "Start from an idea, a note or today's sprint format.",
      action: "Write",
      href: "/",
      done: s.drafts > 0,
    },
  ];
  return { items, done: items.filter((i) => i.done).length };
}
