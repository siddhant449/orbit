import { describe, expect, it } from "vitest";
import { gettingStarted } from "./activity";

describe("gettingStarted", () => {
  it("maps real onboarding signals to checklist rows", () => {
    const list = gettingStarted({ strategy: true, identity: false, knowledge: true, voice: false, drafts: 0 });
    expect(list.items.map((i) => [i.id, i.done])).toEqual([
      ["strategy", true],
      ["about-you", false],
      ["knowledge", true],
      ["voice", false],
      ["first-draft", false],
    ]);
    expect(list.done).toBe(2);
    expect(list.items.every((i) => i.href.startsWith("/"))).toBe(true);
  });
});
