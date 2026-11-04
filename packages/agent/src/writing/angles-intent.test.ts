import { describe, expect, it } from "vitest";
import { wantsAnglesPanel } from "./angles-intent";

const yes = (t: string, o: { hasPost?: boolean; picked?: boolean } = {}) => wantsAnglesPanel({ userText: t, pickedAngle: Boolean(o.picked), hasPost: Boolean(o.hasPost) });

describe("wantsAnglesPanel", () => {
  it.each([
    "You decide and give me some suggestions for todays post.",
    "give me some angles",
    "Show me a few different angles for this post.",
    "suggest what to write",
    "suggestions for today's post",
    "show me a few directions",
    "create a post on llm",
    "write a post about hiring",
    "post on pricing",
    "Write the post on remote work culture",
  ])("opens for %s", (t) => expect(yes(t)).toBe(true));

  it.each([
    "write a post arguing small teams should skip fine-tuning",
    "create a post on why llms hallucinate",
    "write a post about hiring for culture fit in startups today",
    "Day 1 of my 30-day sprint: The origin story. Help me write this post.\n\nShape:\n1. The moment\n2. The turn\nIf you need details only I would know, ask me one or two short questions first, then draft it.",
    "Here are my answers:\n\n1. Q\nA",
    "give me post ideas for this week",
    "give me five hook options",
    "rewrite the opening lines",
    "thanks",
  ])("stays closed for %s", (t) => expect(yes(t)).toBe(false));

  it("is closed after an angle was picked", () => expect(yes("give me some angles", { picked: true })).toBe(false));
  it("with a post open, only an explicit angles ask opens it", () => {
    expect(yes("give me some different angles for this", { hasPost: true })).toBe(true);
    expect(yes("give me some options for the ending", { hasPost: true })).toBe(false);
    expect(yes("create a post on llm", { hasPost: true })).toBe(false);
  });
});
