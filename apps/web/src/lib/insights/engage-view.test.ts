import { describe, expect, it } from "vitest";
import {
  REPLY_SOURCE_MAX,
  authorLine,
  focusMeta,
  initialQueue,
  PROMPT_MAX,
  leadsWithIntent,
  queueReducer,
  queueSummary,
  replyHref,
  redraftHref,
  replyPrompt,
  rowMeta,
  sessionView,
  visibleQueue,
  type QueuePost,
} from "./engage-view";

const NOW = new Date("2026-10-22T12:00:00Z");

// Fixture in tests only (ruling A14).
function post(id: string, over: Partial<QueuePost> = {}): QueuePost {
  return {
    id,
    author: { name: `Author ${id}`, headline: "Role, Company" },
    excerpt: `Excerpt ${id}`,
    postUrl: `https://www.linkedin.com/feed/update/urn:li:activity:${id}`,
    postedAt: "2026-10-22T11:00:00Z",
    commentCount: 10,
    fit: "medium",
    listIds: ["plan"],
    reason: "On your audience plan",
    draft: null,
    status: "new",
    ...over,
  };
}

describe("visibleQueue", () => {
  const posts = [
    post("a", { fit: "low", postedAt: "2026-10-22T11:50:00Z" }),
    post("b", { fit: "high", postedAt: "2026-10-22T08:00:00Z" }),
    post("c", { fit: "high", postedAt: "2026-10-22T11:00:00Z", listIds: ["founders"] }),
    post("d", { fit: "high", status: "done", postedAt: "2026-10-22T11:59:00Z" }),
    post("e", { status: "skipped" }),
  ];

  it("sorts open posts by fit, then recency; done posts sink to the end; skipped posts leave", () => {
    expect(visibleQueue(posts, null).map((p) => p.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("filters by list", () => {
    expect(visibleQueue(posts, "founders").map((p) => p.id)).toEqual(["c"]);
  });
});

describe("queueSummary", () => {
  it("counts the open posts", () => {
    expect(queueSummary(8)).toBe("8 posts · sorted by fit, then recency");
    expect(queueSummary(1)).toBe("1 post · sorted by fit, then recency");
    expect(queueSummary(0)).toBe("Nothing left in the queue");
  });
});

describe("queueReducer", () => {
  const posts = [post("a", { fit: "high" }), post("b"), post("c", { fit: "low" })];

  it("focuses the first open post", () => {
    expect(initialQueue(posts, null).focusedId).toBe("a");
  });

  it("skip and done move focus to the next open post", () => {
    let s = initialQueue(posts, null);
    s = queueReducer(s, { type: "skip", id: "a" });
    expect(s.focusedId).toBe("b");
    expect(s.posts.find((p) => p.id === "a")?.status).toBe("skipped");
    s = queueReducer(s, { type: "done", id: "b" });
    expect(s.focusedId).toBe("c");
    s = queueReducer(s, { type: "done", id: "c" });
    expect(s.focusedId).toBeNull();
  });

  it("focus picks an open post and ignores done ones", () => {
    let s = initialQueue(posts, null);
    s = queueReducer(s, { type: "focus", id: "c" });
    expect(s.focusedId).toBe("c");
    s = queueReducer(s, { type: "done", id: "b" });
    s = queueReducer(s, { type: "focus", id: "b" });
    expect(s.focusedId).toBe("c");
  });

  it("filter changes the list and refocuses within it", () => {
    const withList = [post("a", { fit: "high" }), post("z", { listIds: ["ops"] })];
    let s = initialQueue(withList, null);
    s = queueReducer(s, { type: "filter", listId: "ops" });
    expect(s.listId).toBe("ops");
    expect(s.focusedId).toBe("z");
  });

  it("drafted stores a new draft and marks the post draft-ready", () => {
    let s = initialQueue(posts, null);
    s = queueReducer(s, { type: "drafted", id: "b", draft: "Nice point." });
    expect(s.posts.find((p) => p.id === "b")).toMatchObject({ draft: "Nice point.", status: "draft_ready" });
  });
});

describe("row copy", () => {
  it("names the author with their headline", () => {
    expect(authorLine(post("a"))).toBe("Author a · Role, Company");
    expect(authorLine(post("a", { author: { name: "Solo", headline: null } }))).toBe("Solo");
  });

  it("rowMeta is age and comment count", () => {
    expect(rowMeta(post("a"), NOW)).toBe("1h · 10 comments");
    expect(rowMeta(post("a", { commentCount: 1 }), NOW)).toBe("1h · 1 comment");
  });

  it("focusMeta adds why it's in the queue", () => {
    expect(focusMeta(post("a", { postedAt: "2026-10-22T11:20:00Z", commentCount: 12 }), NOW)).toBe(
      "On your audience plan · posted 40 min ago · 12 comments so far",
    );
    expect(focusMeta(post("a", { reason: null }), NOW)).toBe("Posted 1h ago · 10 comments so far");
  });
});

describe("leads", () => {
  it("counts unhandled leads as intent", () => {
    const base = { name: "N", headline: null, url: "https://www.linkedin.com/in/n", at: "2026-10-22T10:00:00Z", kind: "question" as const, text: "t" };
    expect(leadsWithIntent([{ ...base, id: "1", handled: false }, { ...base, id: "2", handled: true }])).toBe(1);
  });
});

describe("sessionView", () => {
  it("rings the minutes against the twenty-minute goal", () => {
    expect(sessionView({ minutes: 12, commentsPosted: 3, commentGoal: 8, dmsAnswered: 2, dmGoal: 3 })).toEqual({
      ring: { value: 12, max: 20, label: "12m" },
      lines: ["3 of 8 comments posted", "2 of 3 DMs answered"],
    });
  });

  it("caps the ring at the goal and handles a single comment", () => {
    const v = sessionView({ minutes: 31, commentsPosted: 1, commentGoal: 1, dmsAnswered: 0, dmGoal: 0 });
    expect(v.ring).toEqual({ value: 20, max: 20, label: "31m" });
    expect(v.lines).toEqual(["1 of 1 comment posted"]);
  });
});

describe("reply drafting", () => {
  it("builds a chat prompt around the pasted comment", () => {
    const p = replyPrompt("  Great post, but how did you measure churn?  ");
    expect(p).toContain("Great post, but how did you measure churn?");
    expect(p.startsWith("Help me reply to this comment")).toBe(true);
  });

  it("links to a new chat with the prompt prefilled, or nothing for blank text", () => {
    const href = replyHref("How did you measure churn?");
    expect(href?.startsWith("/?prompt=")).toBe(true);
    expect(decodeURIComponent(href!.slice("/?prompt=".length))).toContain("How did you measure churn?");
    expect(replyHref("   ")).toBeNull();
  });

  it("caps very long pasted text with an ellipsis inside the closing quote, within the prompt limit", () => {
    const p = replyPrompt("x".repeat(REPLY_SOURCE_MAX + 500));
    expect(p.match(/x+/)![0].length).toBe(REPLY_SOURCE_MAX);
    expect(p.endsWith('…"')).toBe(true);
    expect(Array.from(p).length).toBeLessThanOrEqual(PROMPT_MAX);
  });

  it("counts code points, so emoji are never split", () => {
    const p = replyPrompt("😀".repeat(REPLY_SOURCE_MAX + 10));
    expect(Array.from(p).length).toBeLessThanOrEqual(PROMPT_MAX);
    expect(p).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(p.endsWith('😀…"')).toBe(true);
  });

  it("leaves short text untouched", () => {
    expect(replyPrompt("Short one.").endsWith('"Short one."')).toBe(true);
  });
});

describe("redraftHref", () => {
  const p = post("a", { excerpt: "We cut our vendor list.", draft: "Same here." });
  const decode = (href: string) => decodeURIComponent(href.slice("/?prompt=".length));

  it("asks chat for a first comment when there is no draft", () => {
    const text = decode(redraftHref(post("a", { excerpt: "We cut our vendor list." }), "draft"));
    expect(text).toContain("Draft a comment");
    expect(text).toContain("Author a · Role, Company");
    expect(text).toContain("We cut our vendor list.");
  });

  it("asks for another angle or a shorter version of the current draft", () => {
    expect(decode(redraftHref(p, "angle"))).toContain("different angle");
    expect(decode(redraftHref(p, "angle"))).toContain("Same here.");
    expect(decode(redraftHref(p, "shorter"))).toContain("shorter");
  });

  it("fits the prompt limit with huge posts and drafts, closing quote intact", () => {
    const big = post("a", { excerpt: "e".repeat(5000), draft: "d".repeat(5000) });
    for (const mode of ["draft", "angle", "shorter"] as const) {
      const text = decode(redraftHref(big, mode));
      expect(Array.from(text).length).toBeLessThanOrEqual(PROMPT_MAX);
      expect(text.endsWith('…"')).toBe(true);
    }
  });
});
