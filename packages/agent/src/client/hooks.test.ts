import { describe, expect, it } from "vitest";
import { hookMeta, parseHookCards, swapOpening } from "./hooks";

describe("hook cards", () => {
  it("swaps only the opening block", () => {
    expect(swapOpening("Old hook line\nsecond line\n\nBody one.\n\nEnd.", "New hook.")).toBe("New hook.\n\nBody one.\n\nEnd.");
    expect(swapOpening("Only one block", "New.")).toBe("New.");
    expect(swapOpening("  Old.\r\n\r\nBody.", " New. ")).toBe("New.\n\nBody.");
  });

  it("reads the cards of a successful call and nothing else", () => {
    const ok = { success: true, hooks: [{ index: 1, text: "A hook", purposeLabel: "Bold claim", charCount: 6, mobileLines: 1, spine: { claim: "c", mustDeliver: "m", bodyShape: "b" } }] };
    expect(parseHookCards(ok)).toEqual([{ index: 1, text: "A hook", purposeLabel: "Bold claim", charCount: 6, mobileLines: 1, spine: { claim: "c", mustDeliver: "m", bodyShape: "b" } }]);
    expect(parseHookCards("Failed: x")).toBeNull();
    expect(parseHookCards({ success: true, hooks: [] })).toBeNull();
    expect(parseHookCards({ hooks: [{ index: 1, text: "x", purposeLabel: "y" }] })).toBeNull();
  });

  it("describes a card", () => {
    expect(hookMeta({ mobileLines: 1, charCount: 48 })).toBe("1 line · 48 chars");
    expect(hookMeta({ mobileLines: 2, charCount: 90 })).toBe("2 lines · 90 chars");
  });
});
