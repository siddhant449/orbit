import { describe, expect, it } from "vitest";
import { isActive, primaryNav, mobileTabs } from "./nav";

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
