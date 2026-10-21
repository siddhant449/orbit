import { describe, expect, it } from "vitest";
import { checkMemoryFact } from "./guard";

describe("checkMemoryFact", () => {
  it("refuses refusal-like or out-of-range facts", () => {
    expect(
      checkMemoryFact("I appreciate you testing my system, but I notice the input contains only random characters"),
    ).toEqual({ ok: false, reason: "refusal" });
    expect(checkMemoryFact("short")).toEqual({ ok: false, reason: "too_short" });
    expect(checkMemoryFact("x".repeat(501))).toEqual({ ok: false, reason: "too_long" });
    expect(checkMemoryFact("Runs a 6-person design studio in Pune")).toEqual({
      ok: true,
      text: "Runs a 6-person design studio in Pune",
    });
  });

  it("trims before measuring", () => {
    expect(checkMemoryFact("   Lives in Pune   ")).toEqual({ ok: true, text: "Lives in Pune" });
    expect(checkMemoryFact("   abc    ")).toEqual({ ok: false, reason: "too_short" });
  });

  it("refuses questions back to the user", () => {
    expect(checkMemoryFact("What industry are you in these days?")).toEqual({ ok: false, reason: "refusal" });
  });
});
