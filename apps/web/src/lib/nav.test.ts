import { describe, expect, it } from "vitest";
import { isActive, mobileTabs, paletteValue, primaryNav, sectionFor, sections } from "./nav";

describe("primary nav", () => {
  it("is Orbit's six items in order, New draft carrying the ⌘J hint and no counts yet", () => {
    expect(primaryNav.map((i) => i.label)).toEqual(["New draft", "Posts", "Ideas", "Activities", "Engage", "Analytics"]);
    expect(primaryNav.map((i) => i.href)).toEqual(["/", "/posts", "/ideas", "/activities", "/engage", "/analytics"]);
    expect(primaryNav[0]!.shortcut).toBe("⌘J");
    expect(primaryNav.every((i) => i.count === undefined)).toBe(true);
  });

  it("New draft is current on home only, not inside a chat (p03)", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/chat/abc", "/")).toBe(false);
    expect(isActive("/posts/1", "/posts")).toBe(true);
  });

  it("mobile tab bar: Home, Posts, Ideas, Activities, Analytics", () => {
    expect(mobileTabs.map((t) => t.label)).toEqual(["Home", "Posts", "Ideas", "Activities", "Analytics"]);
  });
});

describe("section nav (O3: E10-E12, D7)", () => {
  const settings = sections.find((s) => s.id === "settings")!;
  const ideas = sections.find((s) => s.id === "ideas")!;
  const labels = (g: (typeof sections)[number]["groups"][number]) => g.items.map((i) => i.label);

  it("Settings follows p14: Integrations first, Billing and subscription, Talk to us", () => {
    expect(settings.groups.map((g) => g.label)).toEqual(["Account", "Support"]);
    expect(labels(settings.groups[0]!)).toEqual(["Integrations", "Manage account", "Memories", "Manage team", "Billing and subscription"]);
    expect(labels(settings.groups[1]!)).toEqual(["Community", "Talk to us"]);
    expect(settings.groups[0]!.items.find((i) => i.label === "Manage account")!.href).toBe("/settings");
  });

  it("Ideas follows p13 with Strategy first in Discover and Knowledge under My library", () => {
    expect(ideas.groups.map((g) => g.label)).toEqual(["Discover", "Carousels", "My library"]);
    expect(labels(ideas.groups[0]!)).toEqual(["Strategy", "For you", "Swipe file", "Following", "Hooks"]);
    expect(labels(ideas.groups[1]!)).toEqual(["Created by you"]);
    expect(labels(ideas.groups[2]!)).toEqual(["All saves", "Knowledge"]);
    expect(ideas.groups[2]!.items.find((i) => i.label === "Knowledge")!.href).toBe("/knowledge-base");
    expect(sectionFor("/knowledge-base")?.id).toBe("ideas");
  });

  it("the palette keyword \"templates\" still finds Hooks at /templates", () => {
    const hooks = ideas.groups[0]!.items.find((i) => i.label === "Hooks")!;
    expect(hooks.href).toBe("/templates");
    expect(paletteValue(hooks).split(" ")).toContain("templates");
    expect(paletteValue(hooks)).toMatch(/^Hooks /);
  });
});
