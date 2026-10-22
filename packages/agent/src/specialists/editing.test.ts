import { describe, expect, it } from "vitest";
import { fakeAi } from "../test/fixtures";
import { editDocumentText } from "./editing";

const document = { id: "doc_1", title: "T", version: 3, text: "Old hook.\n\nBody stays." };
const input = {
  document,
  description: "Make the hook shorter",
  editRequirements: ["Shorten the first line"],
  editScope: "local-change" as const,
  grounding: "<voice>\nWarm\n</voice>",
};

describe("editDocumentText", () => {
  it("returns the edited text and summary, prompting with the post, requirements and grounding", async () => {
    const ai = fakeAi({ text: "Hook.\n\nBody stays.", changeSummary: "Shortened the hook", unmetRequirements: [] });
    const out = await editDocumentText(ai, input);
    expect(out).toEqual({ ok: true, text: "Hook.\n\nBody stays.", changeSummary: "Shortened the hook" });
    expect(ai.calls).toHaveLength(1);
    expect(ai.calls[0]!.model).toBe("generate");
    expect(ai.calls[0]!.prompt).toContain('<open_document id="doc_1" version="3"');
    expect(ai.calls[0]!.prompt).toContain("Shorten the first line");
    expect(ai.calls[0]!.prompt).toContain("<voice>");
    expect(ai.calls[0]!.system).toMatch(/local-change|only the part/i);
  });

  it("retries once on unmet requirements, then reports them", async () => {
    const ai = fakeAi({ text: "x", changeSummary: "s", unmetRequirements: ["Add a CTA"] });
    const out = await editDocumentText(ai, { ...input, editRequirements: ["Add a CTA"] });
    expect(out).toEqual({ ok: false, missed: ["Add a CTA"] });
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls[1]!.system).toContain("Add a CTA");
  });

  it("succeeds when the retry meets every requirement", async () => {
    let n = 0;
    const ai = fakeAi(() =>
      n++ === 0
        ? { text: "x", changeSummary: "s", unmetRequirements: ["Add a CTA"] }
        : { text: "With a CTA.", changeSummary: "Added a CTA", unmetRequirements: [] },
    );
    expect(await editDocumentText(ai, input)).toEqual({ ok: true, text: "With a CTA.", changeSummary: "Added a CTA" });
  });

  it("reports a reason for an empty or unusable result after one retry, and passes the abort signal", async () => {
    const controller = new AbortController();
    const ai = fakeAi({ text: "  ", changeSummary: "s", unmetRequirements: [] });
    const out = await editDocumentText(ai, { ...input, abortSignal: controller.signal });
    expect(out).toMatchObject({ ok: false, reason: expect.any(String) });
    expect(ai.calls).toHaveLength(2);
    expect(ai.calls.every((c) => c.abortSignal === controller.signal)).toBe(true);
  });

  it("rethrows an abort", async () => {
    const ai = fakeAi(() => {
      throw new DOMException("Aborted", "AbortError");
    });
    await expect(editDocumentText(ai, input)).rejects.toMatchObject({ name: "AbortError" });
  });
});
