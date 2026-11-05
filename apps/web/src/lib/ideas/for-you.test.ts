import { describe, expect, it } from "vitest";
import { groupIdeas, setHidden, type IdeaDto, type WeekDto } from "./for-you";

const idea = (id: string, week: string, over: Partial<IdeaDto> = {}): IdeaDto => ({
  id, weekStartOn: week, origin: "weekly", position: 0, category: "c", title: id, detail: "d", prompt: "p", sourceKind: "pillar", sourceRef: null, drafted: false, chatId: null, hidden: false, createdAt: "2026-11-02T00:00:00Z", ...over,
});
const weeks: WeekDto[] = [
  { weekStartOn: "2026-11-02", ideas: [idea("a", "2026-11-02"), idea("b", "2026-11-02", { hidden: true }), idea("c", "2026-11-02", { origin: "chat" })] },
  { weekStartOn: "2026-10-26", ideas: [idea("d", "2026-10-26"), idea("e", "2026-10-26", { hidden: true })] },
];

describe("groupIdeas", () => {
  it("splits this week, chats, hidden and earlier weeks", () => {
    const g = groupIdeas(weeks, "2026-11-02");
    expect(g.hasBatch).toBe(true);
    expect(g.thisWeek.map((i) => i.id)).toEqual(["a"]);
    expect(g.fromChats.map((i) => i.id)).toEqual(["c"]);
    expect(g.hidden.map((i) => i.id)).toEqual(["b", "e"]);
    expect(g.earlier).toEqual([{ weekStartOn: "2026-10-26", ideas: [weeks[1]!.ideas[0]] }]);
  });

  it("has no batch when only chat ideas exist this week", () => {
    const g = groupIdeas([{ weekStartOn: "2026-11-02", ideas: [idea("c", "2026-11-02", { origin: "chat" })] }], "2026-11-02");
    expect(g.hasBatch).toBe(false);
    expect(g.thisWeek).toEqual([]);
  });

  it("setHidden flips one idea", () => {
    expect(groupIdeas(setHidden(weeks, "b", false), "2026-11-02").hidden.map((i) => i.id)).toEqual(["e"]);
  });
});
