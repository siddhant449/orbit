import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, generateText } from "ai";
import { describe, expect, it } from "vitest";
import { windowHistory } from "./history";
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

  it("drops past provider-executed steps but keeps the reply text", () => {
    const out = windowHistory(history());
    expect(out[1]!.parts.some((p) => p.type === "tool-web_search")).toBe(false);
    expect(out[1]!.parts).toContainEqual({ type: "text", text: "Here is what changed." });
  });

  // OpenAI rejects a replayed web_search_call (or its item_reference) without the reasoning item that produced
  // it, and reasoning is never replayed, so a chat that once searched failed on every later message.
  it("sends OpenAI no web_search_call or item reference, with store on or off", async () => {
    const window = windowHistory(history());
    for (const store of [false, true]) {
      const input = await openAiInput(window, store);
      expect(input.some((i) => i.type === "web_search_call" || i.type === "item_reference")).toBe(false);
      expect(JSON.stringify(input)).toContain("Here is what changed.");
    }
  });
});
