import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnchorHTMLAttributes } from "react";

vi.mock("next/link", () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}));

const { HomeCards } = await import("./home-cards");

// Orbit's artboard sample content: none of it may ever render (ruling A14).
const SAMPLES = ["The contrarian take", "Comment on 8 posts", "Tue · The checklist", "Reply to 3 DMs", "4 left", "3 to review", "Day 2", "Resets in 7h"];

function expectNoSamples(html: string) {
  for (const s of SAMPLES) expect(html).not.toContain(s);
}

describe("HomeCards", () => {
  it("with no strategy: sprint, activities and strategy empty states, honest copy only", () => {
    const html = renderToStaticMarkup(<HomeCards strategy={null} latestChat={null} />);
    expect(html).toContain("Today&#x27;s post");
    expect(html).toContain("Start the 30-day sprint");
    expect(html).toContain("One proven format every weekday");
    expect(html).toContain('href="/challenge"');
    expect(html).toContain("Daily goals arrive with Activities");
    expect(html).toContain("Build your strategy");
    expect(html).toContain('href="/strategy"');
    expectNoSamples(html);
  });

  it("with a strategy: the next slots from the plan and an Open link to /strategy", () => {
    const html = renderToStaticMarkup(
      <HomeCards
        strategy={{ slots: [{ day: "Thu", title: "Thursday take" }, { day: "Fri", title: "Friday wins" }] }}
        latestChat={null}
      />,
    );
    expect(html).toContain("Your plan");
    expect(html).toContain("Thursday take");
    expect(html).toContain("Friday wins");
    expect(html).not.toContain("Build your strategy");
    expect(html).toMatch(/href="\/strategy"[^>]*>[\s\S]*Open/);
    expectNoSamples(html);
  });

  it("a strategy without slots still points at the plan instead of inventing rows", () => {
    const html = renderToStaticMarkup(<HomeCards strategy={{ slots: [] }} latestChat={null} />);
    expect(html).toContain("Your plan");
    expect(html).toContain("Add a series or format to your strategy");
    expectNoSamples(html);
  });

  it("shows the latest chat as the mobile third card when one exists", () => {
    const html = renderToStaticMarkup(
      <HomeCards strategy={null} latestChat={{ id: "c1", title: "Launch notes", lastActivityAt: "2026-10-22T09:00:00.000Z" }} />,
    );
    expect(html).toContain("Latest draft");
    expect(html).toContain("Launch notes");
    expect(html).toContain('href="/chat/c1"');
    expectNoSamples(html);
  });
});
