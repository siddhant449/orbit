import type { IdeaRow } from "@brandloop/db";

/** What the For you page works with: the API's week groups, with dates as ISO strings. */
export type IdeaDto = Omit<IdeaRow, "createdAt"> & { createdAt: string };
export type WeekDto = { weekStartOn: string; ideas: IdeaDto[] };

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** The page's groups: this week's weekly ideas to show, this week's chat ideas, every hidden idea, and the earlier weeks. */
export function groupIdeas(weeks: WeekDto[], currentWeek: string) {
  const all = weeks.flatMap((w) => w.ideas);
  const visible = (i: IdeaDto) => !i.hidden;
  const here = weeks.find((w) => w.weekStartOn === currentWeek)?.ideas ?? [];
  return {
    hasBatch: here.some((i) => i.origin === "weekly"),
    thisWeek: here.filter((i) => i.origin === "weekly" && visible(i)),
    fromChats: here.filter((i) => i.origin === "chat" && visible(i)),
    hidden: all.filter((i) => i.hidden),
    earlier: weeks.filter((w) => w.weekStartOn !== currentWeek).map((w) => ({ weekStartOn: w.weekStartOn, ideas: w.ideas.filter(visible) })).filter((w) => w.ideas.length > 0),
  };
}

export function setHidden(weeks: WeekDto[], id: string, hidden: boolean): WeekDto[] {
  return weeks.map((w) => ({ ...w, ideas: w.ideas.map((i) => (i.id === id ? { ...i, hidden } : i)) }));
}
