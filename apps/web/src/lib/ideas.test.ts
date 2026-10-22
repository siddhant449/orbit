import { describe, expect, it } from "vitest";
import type { AiClient } from "@brandloop/ai";
import {
  buildIdeasPrompt,
  clampIdeaCount,
  generateIdeas,
  ideaDraftPrompt,
  takePendingDraft,
  PENDING_DRAFT_KEY,
  weekOf,
  type Idea,
  type IdeasContext,
} from "./ideas";

const idea = (n: number): Idea => ({
  title: `Idea ${n}`,
  angle: `Angle ${n}`,
  hook: `Hook ${n}`,
  format: "text",
  contentType: "educational",
  why: `Why ${n}`,
});

const strategy = {
  goal: "build_authority" as const,
  goalWhy: "g",
  positioning: "The pricing person for B2B founders",
  positioningWhy: "p",
  tagline: "t",
  expertise: "SaaS pricing",
  expertiseWhy: "e",
  contentMix: [{ type: "educational" as const, percent: 100 }],
  audienceBalance: [{ level: "narrow" as const, percent: 100, note: "founders" }],
  contentFormats: [{ format: "carousel" as const, perWeek: 2, note: "n" }],
  recurringSeries: [{ name: "Pricing teardown", weekday: "tue" as const, description: "One pricing page a week" }],
};

const ctx = (over: Partial<IdeasContext> = {}): IdeasContext => ({
  strategy,
  memoryIndex: "identity/\n  identity/about.md, who they are (updated 2026-10-01)",
  coreMemory: "[memory file: identity/about.md]\n- Runs a pricing consultancy",
  recentPosts: [{ title: "Annual plans", text: "Why annual plans hide churn" }],
  weekOf: "2026-10-19",
  ...over,
});

function fakeAi(ideas: Idea[]): AiClient & { calls: { system: string; prompt: string }[] } {
  const calls: { system: string; prompt: string }[] = [];
  return {
    calls,
    async text() {
      throw new Error("not used");
    },
    async json({ system, prompt, schema }) {
      calls.push({ system, prompt });
      return schema.parse({ ideas });
    },
  };
}

describe("clampIdeaCount", () => {
  it("defaults to 5 and keeps the count between 3 and 8", () => {
    expect(clampIdeaCount(undefined)).toBe(5);
    expect(clampIdeaCount("x")).toBe(5);
    expect(clampIdeaCount(1)).toBe(3);
    expect(clampIdeaCount(20)).toBe(8);
    expect(clampIdeaCount(6.7)).toBe(6);
  });
});

describe("weekOf", () => {
  it("returns the Monday of the week in the profile's time zone", () => {
    // Thursday 22 Oct 2026, 10:00 UTC
    expect(weekOf(new Date("2026-10-22T10:00:00Z"), "UTC")).toBe("2026-10-19");
    // Sunday 25 Oct 23:30 UTC is already Monday 26 Oct in Tokyo
    expect(weekOf(new Date("2026-10-25T23:30:00Z"), "Asia/Tokyo")).toBe("2026-10-26");
    // Monday 26 Oct 03:00 UTC is still Sunday in Los Angeles
    expect(weekOf(new Date("2026-10-26T03:00:00Z"), "America/Los_Angeles")).toBe("2026-10-19");
  });

  it("falls back to UTC for an unknown time zone", () => {
    expect(weekOf(new Date("2026-10-22T10:00:00Z"), "Not/AZone")).toBe("2026-10-19");
  });
});

describe("buildIdeasPrompt", () => {
  it("includes the strategy, memory and recent posts inside data tags, and asks for exactly N ideas", () => {
    const { system, prompt } = buildIdeasPrompt(ctx(), 4);
    expect(system).toMatch(/not instructions/i);
    expect(prompt).toContain("<strategy>");
    expect(prompt).toContain("The pricing person for B2B founders");
    expect(prompt).toContain("Pricing teardown (Tuesday)");
    expect(prompt).toContain("<memory_index>");
    expect(prompt).toContain("Runs a pricing consultancy");
    expect(prompt).toContain("<recent_posts>");
    expect(prompt).toContain("Annual plans");
    expect(prompt).toMatch(/exactly 4 post ideas/);
    expect(prompt).toContain("2026-10-19");
  });

  it("says plainly when there is no strategy, memory or posts yet", () => {
    const { prompt } = buildIdeasPrompt(ctx({ strategy: null, memoryIndex: "", coreMemory: "", recentPosts: [] }), 5);
    expect(prompt).toContain("(no strategy yet)");
    expect(prompt).toContain("(no memory yet)");
    expect(prompt).toContain("(no posts yet)");
  });

  it("truncates long post text so the prompt stays bounded", () => {
    const { prompt } = buildIdeasPrompt(ctx({ recentPosts: [{ title: "Long", text: "a".repeat(5000) }] }), 5);
    expect(prompt.length).toBeLessThan(5000);
  });
});

describe("generateIdeas", () => {
  it("calls the model once with the ideas schema and returns exactly N ideas", async () => {
    const ai = fakeAi([1, 2, 3, 4, 5, 6].map(idea));
    const out = await generateIdeas(ai, ctx(), 4);
    expect(ai.calls).toHaveLength(1);
    expect(out.map((i) => i.title)).toEqual(["Idea 1", "Idea 2", "Idea 3", "Idea 4"]);
  });

  it("drops ideas without a hook and trims fields", async () => {
    const ai = fakeAi([{ ...idea(1), hook: "  " }, { ...idea(2), title: "  Two  " }]);
    const out = await generateIdeas(ai, ctx(), 3);
    expect(out).toEqual([{ ...idea(2), title: "Two" }]);
  });

  it("fails clearly when the model returns no usable ideas", async () => {
    await expect(generateIdeas(fakeAi([]), ctx(), 3)).rejects.toThrow(/no ideas/i);
  });
});

describe("ideaDraftPrompt", () => {
  it("asks for a draft built on the idea's hook, angle and format", () => {
    const p = ideaDraftPrompt({ ...idea(1), format: "carousel" });
    expect(p).toMatch(/^Draft a LinkedIn post/);
    expect(p).toContain("Hook 1");
    expect(p).toContain("Angle 1");
    expect(p).toContain("carousel");
  });
});

describe("takePendingDraft", () => {
  function store(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => data.get(k) ?? null,
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  }

  it("returns the pending prompt once and clears it", () => {
    const s = store({ [PENDING_DRAFT_KEY]: "Draft a LinkedIn post about X" });
    expect(takePendingDraft(s)).toBe("Draft a LinkedIn post about X");
    expect(takePendingDraft(s)).toBeNull();
  });

  it("ignores blank values and storage that throws", () => {
    expect(takePendingDraft(store({ [PENDING_DRAFT_KEY]: "  " }))).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
    };
    expect(takePendingDraft(broken)).toBeNull();
  });
});
