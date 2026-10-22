import { describe, expect, it } from "vitest";
import { CATEGORIES, FRAMEWORKS, HOOK_PURPOSES } from "../library";
import { SKILL_NOTES } from "./prompts";

describe("skill notes", () => {
  it("are rendered from the library: every purpose, framework and category appears", () => {
    for (const p of HOOK_PURPOSES) expect(SKILL_NOTES.hooks).toContain(p.label);
    for (const f of FRAMEWORKS) expect(SKILL_NOTES.frameworks).toContain(f.name);
    for (const c of CATEGORIES) expect(SKILL_NOTES["post-formats"]).toContain(c.label);
  });
});
