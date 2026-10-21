import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}));

const { MainNav } = await import("./nav-link");
const { SprintCard, sprintCopy } = await import("./sprint-card");

describe("MainNav", () => {
  it("renders the six links inside nav Main, the current one marked", () => {
    const html = renderToStaticMarkup(<MainNav pathname="/ideas" />);
    expect(html).toMatch(/^<nav aria-label="Main"/);
    const names = [...html.matchAll(/<a [^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, "").replace("⌘J", "").trim());
    expect(names).toEqual(["New draft", "Posts", "Ideas", "Activities", "Engage", "Analytics"]);
    expect(html).toMatch(/<a href="\/ideas"[^>]*aria-current="page"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("hides the shortcut hint from the accessible name and exposes it as a key shortcut", () => {
    const html = renderToStaticMarkup(<MainNav pathname="/" />);
    expect(html).toMatch(/<a href="\/"[^>]*aria-keyshortcuts="Meta\+J Control\+J"/);
    expect(html).toMatch(/<kbd aria-hidden="true"[^>]*>⌘J<\/kbd>/);
  });
});

describe("SprintCard", () => {
  it("not started: honest copy, empty ring, links to the sprint", () => {
    expect(sprintCopy({ kind: "not-started" })).toEqual({
      label: "30-day sprint",
      title: "Not started",
      meta: "Start when you're ready",
      day: null,
      progress: 0,
    });
    const html = renderToStaticMarkup(<SprintCard state={{ kind: "not-started" }} />);
    expect(html).toContain('href="/challenge"');
    expect(html).toContain('aria-label="Sprint progress, 0 of 30"');
    expect(html).not.toContain("contrarian");
  });

  it("active: day and title, posted of planned", () => {
    expect(sprintCopy({ kind: "active", day: 4, title: "A list post", posted: 3, planned: 22 })).toEqual({
      label: "30-day sprint",
      title: "Day 4 · A list post",
      meta: "3 of 22 posted",
      day: 4,
      progress: 4,
    });
  });
});
