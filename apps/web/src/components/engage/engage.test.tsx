import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";
import type { EngageSnapshot } from "@/lib/insights/engage-view";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { EngageScreen } = await import("./engage-screen");

const NOW = "2026-10-22T12:00:00Z";

// Connected-state fixture: tests only (ruling A14).
const SNAPSHOT: EngageSnapshot = {
  lists: [
    { id: "plan", name: "Fixture list A" },
    { id: "ops", name: "Fixture list B" },
  ],
  posts: [
    {
      id: "p1",
      author: { name: "Fixture Person", headline: "Fixture role" },
      excerpt: "Fixture excerpt one.",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:1",
      postedAt: "2026-10-22T11:20:00Z",
      commentCount: 12,
      fit: "high",
      listIds: ["plan"],
      reason: "On your audience plan",
      draft: "Fixture draft comment.",
      status: "draft_ready",
    },
    {
      id: "p2",
      author: { name: "Second Person", headline: null },
      excerpt: "Fixture excerpt two.",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:activity:2",
      postedAt: "2026-10-22T09:00:00Z",
      commentCount: 3,
      fit: "medium",
      listIds: ["ops"],
      reason: null,
      draft: null,
      status: "done",
    },
  ],
  leads: [
    { id: "l1", name: "Lead Fixture", headline: null, kind: "question", text: "Asked a fixture question", url: "https://www.linkedin.com/in/x", at: NOW, handled: false },
  ],
  session: { minutes: 7, commentsPosted: 1, commentGoal: 4, dmsAnswered: 0, dmGoal: 1 },
};

const ARTBOARD = ["Lena Marsh", "Tomás Ferreira", "Hanna Lindqvist", "Ledgerly", "7 with intent", "3 of 8 comments posted", "Leads inbox · 7"];

describe("EngageScreen (connected)", () => {
  const html = renderToStaticMarkup(<EngageScreen snapshot={SNAPSHOT} connected now={NOW} />);

  it("renders the focused card with its draft and LinkedIn-only actions", () => {
    expect(html).toContain("Fixture Person · Fixture role");
    expect(html).toContain("On your audience plan · posted 40 min ago · 12 comments so far");
    expect(html).toContain("High fit");
    expect(html).toContain("Fixture draft comment.");
    expect(html).toContain("Open on LinkedIn and paste");
    expect(html).toContain("Another angle");
    expect(html).toContain("Shorter");
  });

  it("lists filters, the queue summary, done rows, leads and the session", () => {
    expect(html).toContain("Fixture list A");
    expect(html).toContain("1 post · sorted by fit, then recency");
    expect(html).toContain("Second Person");
    expect(html).toContain("Done");
    expect(html).toContain("Leads inbox · 1");
    expect(html).toContain("1 with intent");
    expect(html).toContain("Asked a fixture question");
    expect(html).toContain("7m");
    expect(html).toContain("1 of 4 comments posted");
    expect(html).toContain("Orbit never comments for you.");
  });

  it("never offers to post for the user", () => {
    expect(html).not.toMatch(/>(Post comment|Publish|Schedule|Auto)/);
  });
});

describe("EngageScreen (not connected)", () => {
  const html = renderToStaticMarkup(<EngageScreen snapshot={null} connected={false} now={NOW} />);

  it("shows empty states, a Connect LinkedIn pill and the working reply drafter", () => {
    expect(html).toContain("Your comment queue is empty");
    expect(html).toContain('href="/settings/integrations"');
    expect(html).toContain("Connect LinkedIn");
    expect(html).toContain("People who comment on your posts");
    expect(html).toContain("No session yet.");
    expect(html).toContain("Draft a reply");
    expect(html).toContain("Paste the comment here");
    for (const s of ARTBOARD) expect(html).not.toContain(s);
  });

  it("opens on the leads tab when asked", () => {
    const leads = renderToStaticMarkup(<EngageScreen snapshot={null} connected={false} now={NOW} initialTab="leads" />);
    expect(leads).toContain("Leads appear after you connect LinkedIn.");
    expect(leads).not.toContain("Your comment queue is empty");
  });

  it("explains lists on the lists tab", () => {
    const lists = renderToStaticMarkup(<EngageScreen snapshot={null} connected={false} now={NOW} initialTab="lists" />);
    expect(lists).toContain("Each list becomes a filter on the comment queue.");
  });
});
