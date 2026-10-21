import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, generateText } from "ai";
import { describe, expect, it } from "vitest";
import { OMITTED_OUTPUT, windowHistory } from "./history";
import type { ChatUIMessage } from "./tools";

let n = 0;
const msg = (role: "user" | "assistant", parts: unknown[]): ChatUIMessage =>
  ({ id: `w${++n}`, role, parts }) as ChatUIMessage;
const text = (role: "user" | "assistant", t: string) => msg(role, [{ type: "text", text: t }]);

/** What the OpenAI provider streams for a hosted web search, as the UI message stores it. */
const searchOutput = {
  action: { type: "search", query: "linkedin algorithm 2026" },
  sources: Array.from({ length: 80 }, (_, i) => ({ type: "url", url: `https://example.com/article-${i}-${"x".repeat(40)}` })),
};
const webSearchPart = {
  type: "tool-web_search",
  toolCallId: "ws_0123456789abcdef",
  state: "output-available",
  input: {},
  output: searchOutput,
  providerExecuted: true,
};

/** Runs the window through the real OpenAI provider and returns the request body it would send. No network. */
async function openAiInput(window: ChatUIMessage[], store: boolean) {
  let captured: { input: Record<string, unknown>[] } | null = null;
  const provider = createOpenAI({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      captured = JSON.parse(String(init!.body));
      throw new Error("captured");
    },
  });
  const tools = { web_search: provider.tools.webSearch({}) };
  const messages = await convertToModelMessages(window, { tools });
  await generateText({
    model: provider("gpt-test"),
    messages,
    tools,
    maxRetries: 0,
    providerOptions: { openai: { store } },
  }).catch(() => {});
  return captured!.input;
}

describe("windowHistory and provider-executed web search", () => {
  const history = () => [
    text("user", "What changed on LinkedIn?"),
    msg("assistant", [{ type: "step-start" }, webSearchPart, { type: "text", text: "Here is what changed." }]),
    ...Array.from({ length: 8 }, (_, i) => text(i % 2 === 0 ? "user" : "assistant", `later ${i}`)),
  ];

  it("keeps a provider-executed tool output intact even when old or large", () => {
    expect(JSON.stringify(searchOutput).length).toBeGreaterThan(4_000);
    const out = windowHistory(history());
    const part = out[1]!.parts[1] as { output: unknown };
    expect(part.output).not.toBe(OMITTED_OUTPUT);
    expect(part.output).toEqual(searchOutput);
    const recent = windowHistory(history().slice(0, 2));
    expect((recent[1]!.parts[1] as { output: unknown }).output).toEqual(searchOutput);
  });

  it("round-trips to OpenAI as a web_search_call (store off) or an item reference (store on)", async () => {
    const window = windowHistory(history());
    const unstored = await openAiInput(window, false);
    expect(unstored).toContainEqual(
      expect.objectContaining({ type: "web_search_call", id: "ws_0123456789abcdef", status: "completed" }),
    );
    expect(unstored.some((i) => i.type === "function_call_output")).toBe(false);

    const stored = await openAiInput(window, true);
    expect(stored).toContainEqual({ type: "item_reference", id: "ws_0123456789abcdef" });
    expect(stored.some((i) => i.type === "function_call_output")).toBe(false);
  });
});
