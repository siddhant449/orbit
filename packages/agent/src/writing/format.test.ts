import { describe, expect, it } from "vitest";
import { FRAMEWORKS, TEMPLATES } from "../library";
import { ChatRequestSchema } from "../types";
import { lintPost } from "./lint";
import { FORMAT_IDS, planHasList, renderFormatBlock, selectFormat } from "./format";
import { resolveRules } from "./rules";

const none = { postType: null, style: null, request: "r" };

describe("selectFormat", () => {
  it("a picked format wins over everything else", () => {
    const f = selectFormat({ ...none, selectedFormatId: "myth-truth", postType: "short" });
    expect(f).toMatchObject({ id: "myth-truth", source: "picked", name: "Myth, truth, proof" });
    expect(f.plan).toEqual(FRAMEWORKS.find((x) => x.id === "myth-truth")!.plan);
  });

  it("a picked template becomes a plan with its skeleton", () => {
    const f = selectFormat({ ...none, selectedFormatId: "fw-named" });
    expect(f.skeleton).toContain("[Name]");
    expect(f.plan.map((b) => b.kind)).toEqual(["numbered", "prose"]);
  });

  it("framework and how-to posts get a list; stories do not; short posts stay within four blocks", () => {
    expect(planHasList(selectFormat({ ...none, selectedFormatId: null, postType: "framework" }).plan)).toBe(true);
    expect(planHasList(selectFormat({ ...none, selectedFormatId: null, postType: "how-to" }).plan)).toBe(true);
    expect(planHasList(selectFormat({ ...none, selectedFormatId: null, postType: "story" }).plan)).toBe(false);
    expect(selectFormat({ ...none, selectedFormatId: null, postType: "short" }).plan.length).toBeLessThanOrEqual(4);
  });

  it("the style's list share breaks ties when the type is unknown", () => {
    const style = { layout: { listPosts: { bullet: 0, numbered: 80 } } } as never;
    const f = selectFormat({ ...none, selectedFormatId: null, style });
    expect(f.source).toBe("style");
    expect(f.plan.find((b) => b.kind === "numbered")).toBeTruthy();
  });

  it("knows every framework and template id, and renders a block of at most 1,200 characters", () => {
    expect(FORMAT_IDS.size).toBe(FRAMEWORKS.length + TEMPLATES.length);
    expect(FORMAT_IDS.has("nope")).toBe(false);
    for (const id of FORMAT_IDS) expect(renderFormatBlock(selectFormat({ ...none, selectedFormatId: id })).length).toBeLessThanOrEqual(1_200);
  });

  it("an unfilled template slot fails the placeholders check", () => {
    const t = TEMPLATES.find((x) => x.id === "edu-one-thing")!;
    const v = lintPost(t.skeleton, resolveRules({ userRulesMarkdown: "", style: null, turn: {} }), { postType: null, groundingText: null, researchDates: null, personalDetails: "allowed" });
    expect(v.violations.some((x) => x.id === "placeholders" && x.level === "hard")).toBe(true);
  });

  it("a plan with a list makes a missing list a target violation", () => {
    const rules = resolveRules({ userRulesMarkdown: "", style: null, turn: {} });
    const ctx = { postType: null, groundingText: null, researchDates: null, personalDetails: "allowed" as const, expectList: true };
    expect(lintPost("Hook.\n\nBody.", rules, ctx).violations.find((v) => v.id === "list-expected")?.level).toBe("target");
    expect(lintPost("Hook.\n\n- a\n- b", rules, ctx).violations.find((v) => v.id === "list-expected")).toBeUndefined();
  });

  it("the chat request accepts a known format id and rejects an unknown one", () => {
    const base = { id: crypto.randomUUID(), runId: crypto.randomUUID(), message: { id: "m", role: "user", parts: [{ type: "text", text: "hi" }] } };
    expect(ChatRequestSchema.safeParse({ ...base, selectedFormatId: "myth-truth" }).success).toBe(true);
    expect(ChatRequestSchema.safeParse(base).data?.selectedFormatId).toBeNull();
    expect(ChatRequestSchema.safeParse({ ...base, selectedFormatId: "not-a-format" }).success).toBe(false);
  });
});
