import { describe, expect, it } from "vitest";
import { finalizeAbortedParts, STOPPED_STEP, toStoredParts } from "./persist";
import type { ChatUIMessage } from "./tools";

type Parts = ChatUIMessage["parts"];

describe("toStoredParts", () => {
  it("drops reasoning and data parts and finalizes unfinished tool parts", () => {
    const parts = [
      { type: "step-start" },
      { type: "reasoning", text: "thinking", state: "done" },
      { type: "text", text: "Hello", state: "done" },
      { type: "data-textDelta", data: { id: "x", text: "y" } },
      { type: "source-url", sourceId: "s1", url: "https://example.com" },
      { type: "source-document", sourceId: "s2", mediaType: "text/plain", title: "t" },
      { type: "file", mediaType: "image/png", url: "https://example.com/a.png" },
      { type: "tool-searchKB", toolCallId: "c1", state: "output-available", input: { query: "x", limit: null }, output: "ok" },
      { type: "tool-readKB", toolCallId: "c2", state: "input-available", input: { id: "k1" } },
      { type: "tool-viewMemory", toolCallId: "c3", state: "input-streaming", input: undefined },
      { type: "dynamic-tool", toolName: "x", toolCallId: "c4", state: "output-available", input: {}, output: 1 },
    ] as unknown as Parts;

    const stored = toStoredParts(parts);
    expect(stored.map((p) => p.type)).toEqual([
      "step-start",
      "text",
      "source-url",
      "file",
      "tool-searchKB",
      "tool-readKB",
      "tool-viewMemory",
    ]);

    const final = finalizeAbortedParts(stored);
    const tools = final.filter((p) => p.type.startsWith("tool-")) as unknown as Record<string, unknown>[];
    expect(tools[0]).toMatchObject({ state: "output-available", output: "ok" });
    expect(tools[1]).toMatchObject({ state: "output-error", errorText: STOPPED_STEP, input: { id: "k1" } });
    expect(tools[2]).toMatchObject({ state: "output-error", errorText: "This step stopped before it completed." });
    // Pure: the input array is untouched.
    expect((stored[5] as { state: string }).state).toBe("input-available");
  });

  it("marks text still streaming as done", () => {
    const stored = toStoredParts([{ type: "text", text: "Hal", state: "streaming" }] as unknown as Parts);
    expect(stored[0]).toEqual({ type: "text", text: "Hal", state: "done" });
  });
});

describe("toStoredParts and tool error text", () => {
  it("replaces provider-executed error text and caps ours", () => {
    const stored = toStoredParts([
      { type: "tool-web_search", toolCallId: "ws_1", state: "output-error", input: {}, errorText: '{"status":"failed","raw":"provider internals"}', providerExecuted: true },
      { type: "tool-searchKB", toolCallId: "c1", state: "output-error", input: {}, errorText: "x".repeat(2000) },
    ] as unknown as Parts) as unknown as { errorText: string }[];
    expect(stored[0]!.errorText).toBe("The web_search step failed.");
    expect(stored[1]!.errorText.length).toBeLessThanOrEqual(500);
  });
});
