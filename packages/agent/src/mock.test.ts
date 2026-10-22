import { z } from "zod";
import { describe, expect, it } from "vitest";
import { EditResultSchema } from "./specialists/editing";
import { FinalReviewPayload, PostWritingPayload, specialistOutputSchema } from "./specialists/envelope";
import { createScriptedChatModel, SCRIPTED_DRAFT, SCRIPTED_IDEAS, SCRIPTED_SLIDES, scriptedAi, scriptedModel } from "./mock";

type Prompt = { role: string; content: unknown }[];

/** Calls doStream directly and returns the emitted parts. */
async function play(model: ReturnType<typeof scriptedModel>, prompt: Prompt = [], tools: string[] = []) {
  const { stream } = await model.doStream({
    prompt: prompt as never,
    tools: tools.map((name) => ({ type: "function", name, inputSchema: {} })) as never,
  });
  const parts: { type: string; [k: string]: unknown }[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return parts;
    parts.push(value as never);
  }
}

const user = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const toolResult = (toolName: string, toolCallId = "c1") => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId, toolName, output: { type: "text", value: "ok" } }],
});
const textOf = (parts: { type: string; delta?: unknown }[]) =>
  parts.filter((p) => p.type === "text-delta").map((p) => p.delta).join("");
const calls = (parts: { type: string; toolName?: unknown; input?: unknown }[]) =>
  parts.filter((p) => p.type === "tool-call").map((p) => ({ toolName: p.toolName, input: JSON.parse(p.input as string) }));

describe("scriptedModel", () => {
  it("plays one step per call and repeats the last step", async () => {
    const model = scriptedModel([
      { toolCalls: [{ toolName: "viewMemory", input: { includeContents: null } }] },
      { text: "Done here." },
    ]);
    const first = await play(model);
    expect(calls(first)).toEqual([{ toolName: "viewMemory", input: { includeContents: null } }]);
    expect(first.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "tool-calls" } });
    const second = await play(model);
    expect(textOf(second)).toBe("Done here.");
    expect(second.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } });
    expect(textOf(await play(model))).toBe("Done here.");
    expect(model.doStreamCalls).toHaveLength(3);
  });
});

describe("createScriptedChatModel", () => {
  const all = ["saveMemory", "searchKB", "viewMemory", "delegateWriting", "createDocument"];

  it("routes 'remember' to saveMemory, then replies once the tool ran", async () => {
    const model = createScriptedChatModel();
    const first = await play(model as never, [user("Remember that I run a design studio in Pune")], all);
    expect(calls(first)).toEqual([
      { toolName: "saveMemory", input: { category: "about", topic: null, facts: ["I run a design studio in Pune"] } },
    ]);
    const second = await play(model as never, [user("Remember that I run a design studio in Pune"), toolResult("saveMemory")], all);
    expect(calls(second)).toEqual([]);
    expect(textOf(second)).toBe("Saved that to your memory.");
  });

  it("routes 'knowledge' to searchKB and anything else to a plain reply", async () => {
    const model = createScriptedChatModel();
    expect(calls(await play(model as never, [user("Search my knowledge for pricing")], all))[0]!.toolName).toBe("searchKB");
    expect(textOf(await play(model as never, [user("Hello")], all))).toBe("Mock reply.");
  });

  it("paces a markdown reply asked for 'slowly' so it can be stopped mid-reply", async () => {
    const model = createScriptedChatModel({ chunkDelayMs: 1 });
    const t0 = Date.now();
    const fast = textOf(await play(model as never, [user("Show me markdown")], all));
    const fastMs = Date.now() - t0;
    const t1 = Date.now();
    const slow = textOf(await play(model as never, [user("Show me markdown, slowly")], all));
    const slowMs = Date.now() - t1;
    expect(slow).toBe(fast);
    // About 70 words at 120 ms each: several seconds, against a few milliseconds unpaced.
    expect(slowMs).toBeGreaterThan(5_000);
    expect(fastMs).toBeLessThan(1_000);
  }, 20_000);

  it("routes 'draft' to delegateWriting then createDocument, but only with tools it was given", async () => {
    const model = createScriptedChatModel();
    expect(calls(await play(model as never, [user("Draft a post about hiring")], all))[0]!.toolName).toBe("delegateWriting");
    const first = calls(await play(model as never, [user("Draft a post about hiring")], all))[0]!;
    expect((first.input as { specialty: string }).specialty).toBe("post");
    expect((first.input as { request: string }).request.length).toBeGreaterThanOrEqual(40);
    expect(calls(await play(model as never, [user("Draft a post about hiring"), toolResult("delegateWriting", "call_w9")], all))).toEqual([
      { toolName: "createDocument", input: { title: expect.any(String), kind: "text", specialistHandoffToolCallId: "call_w9" } },
    ]);
    // Without the writing tools (before they exist) it just replies.
    expect(textOf(await play(model as never, [user("Draft a post about hiring")], ["saveMemory"]))).toBe("Mock reply.");
  });
});

describe("createScriptedChatModel: editing", () => {
  const tools = ["delegateWriting", "createDocument", "updateDocument", "proposeDocumentEdits", "delegateEditing"];
  const system = {
    role: "system",
    content: `Rules.\n<open_document id="d1" version="2" title="T">\nThe opening line here.\n\nThe body.\n</open_document>`,
  };

  it("routes 'punchier' to proposeDocumentEdits on the open post's first line, then replies", async () => {
    const model = createScriptedChatModel();
    const ask = user("Make the opening punchier");
    expect(calls(await play(model as never, [system, ask], tools))).toEqual([
      { toolName: "proposeDocumentEdits", input: { instruction: "Make the opening punchier", targetText: "The opening line here." } },
    ]);
    const after = await play(model as never, [system, ask, toolResult("proposeDocumentEdits")], tools);
    expect(calls(after)).toEqual([]);
    expect(textOf(after)).toMatch(/Apply/);
  });

  it("routes 'shorter' to updateDocument and 'review' to delegateEditing", async () => {
    const model = createScriptedChatModel();
    const edit = calls(await play(model as never, [system, user("Make it shorter")], tools))[0]!;
    expect(edit.toolName).toBe("updateDocument");
    expect(edit.input).toMatchObject({ editScope: "whole-document", restoreVersion: null, editRequirements: [expect.any(String)] });
    const review = calls(await play(model as never, [system, user("Review this post for clarity")], tools))[0]!;
    expect(review).toMatchObject({ toolName: "delegateEditing", input: { specialty: "final-review" } });
  });
});

describe("scriptedAi", () => {
  it("returns canned edits, proposals and reviews", async () => {
    const ai = scriptedAi();
    const edit = await ai.json({ model: "generate", system: "s", prompt: "p", schema: EditResultSchema });
    expect(edit).toMatchObject({ unmetRequirements: [] });
    expect((edit as { text: string }).text.length).toBeGreaterThan(0);
    const proposal = await ai.json({ model: "generate", system: "s", prompt: "p", schema: z.object({ replacement: z.string() }) });
    expect((proposal as { replacement: string }).replacement).toBeTruthy();
    const review = await ai.json({ model: "generate", system: "s", prompt: "p", schema: specialistOutputSchema(FinalReviewPayload) });
    expect(review).toMatchObject({ payload: { qualityReview: { score: expect.any(Number) } } });
  });

  it("returns a title for text and a schema-valid canned object for json", async () => {
    const ai = scriptedAi();
    expect(await ai.text({ model: "extract", system: "s", prompt: "p" })).toBe("Mock chat");
    const out = await ai.json({ model: "generate", system: "s", prompt: "p", schema: z.object({ ok: z.boolean() }) });
    expect(out).toEqual({ ok: true });
    const post = await ai.json({ model: "generate", system: "s", prompt: "p", schema: specialistOutputSchema(PostWritingPayload) });
    expect(post.payload).toMatchObject({ readiness: "ready", draft: SCRIPTED_DRAFT });
    await expect(
      ai.json({ model: "generate", system: "s", prompt: "p", schema: z.object({ impossible: z.literal("never") }) }),
    ).rejects.toThrow(/no canned output/i);
  });

  it("returns canned carousel slides for a slides schema", async () => {
    const schema = z.object({ slides: z.array(z.object({ title: z.string().min(1), body: z.string() })).min(3).max(10) });
    const out = await scriptedAi().json({ model: "generate", system: "s", prompt: "p", schema });
    expect(out.slides).toEqual(SCRIPTED_SLIDES);
  });

  it("returns the canned weekly ideas for an ideas-shaped schema", async () => {
    const ai = scriptedAi();
    const schema = z.object({
      ideas: z.array(
        z.object({ title: z.string(), angle: z.string(), hook: z.string(), format: z.string(), contentType: z.string(), why: z.string() }),
      ),
    });
    const out = await ai.json({ model: "generate", system: "s", prompt: "p", schema });
    expect(out.ideas).toHaveLength(SCRIPTED_IDEAS.length);
    expect(out.ideas[0]!.hook).toBeTruthy();
  });
});
