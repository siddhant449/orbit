import { z } from "zod";
import { describe, expect, it } from "vitest";
import { PostWritingPayload, specialistOutputSchema } from "./specialists/envelope";
import { createScriptedChatModel, SCRIPTED_DRAFT, scriptedAi, scriptedModel } from "./mock";

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

describe("scriptedAi", () => {
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
});
