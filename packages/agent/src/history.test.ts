import { describe, expect, it } from "vitest";
import { OMITTED_OUTPUT, windowHistory } from "./history";
import type { ChatUIMessage } from "./tools";

let n = 0;
const msg = (role: "user" | "assistant", parts: unknown[]): ChatUIMessage =>
  ({ id: `m${++n}`, role, parts }) as ChatUIMessage;
const text = (role: "user" | "assistant", t: string) => msg(role, [{ type: "text", text: t }]);
const toolPart = (output: unknown) => ({
  type: "tool-searchKB",
  toolCallId: `call_${++n}`,
  state: "output-available",
  input: { query: "pricing", limit: 10 },
  output,
});
const alternating = (count: number) =>
  Array.from({ length: count }, (_, i) => text(i % 2 === 0 ? "user" : "assistant", `message ${i}`));

describe("windowHistory", () => {
  it("keeps the last 24 messages and starts at a user message", () => {
    const out = windowHistory(alternating(40));
    expect(out.length).toBeLessThanOrEqual(24);
    expect(out.length).toBeGreaterThanOrEqual(23);
    expect(out[0]!.role).toBe("user");
    expect((out.at(-1)!.parts[0] as { text: string }).text).toBe("message 39");
  });

  it("starts at a user message even when the cut lands on an assistant", () => {
    const msgs = alternating(41); // 24 from the end lands on an assistant message
    const out = windowHistory(msgs);
    expect(out[0]!.role).toBe("user");
    expect(out.length).toBe(23);
  });

  it("omits tool outputs older than the last 6 messages but keeps inputs", () => {
    const old = msg("assistant", [toolPart("old result text")]);
    const msgs = [text("user", "find pricing"), old, ...alternating(8)];
    const out = windowHistory(msgs);
    const part = out[1]!.parts[0] as { output: unknown; input: unknown; state: string };
    expect(part.output).toBe("[output omitted; call the tool again if you need it]");
    expect(OMITTED_OUTPUT).toBe("[output omitted; call the tool again if you need it]");
    expect(part.input).toEqual({ query: "pricing", limit: 10 });
    expect(part.state).toBe("output-available");
    // the caller's messages are not mutated
    expect((old.parts[0] as { output: unknown }).output).toBe("old result text");
  });

  it("keeps recent tool outputs whole when small", () => {
    const out = windowHistory([text("user", "find"), msg("assistant", [toolPart("fresh result")])]);
    expect((out[1]!.parts[0] as { output: unknown }).output).toBe("fresh result");
  });

  it("truncates a recent 10,000-char tool output to 4,000 chars plus a marker", () => {
    const big = "abcdefghij".repeat(1000);
    const out = windowHistory([text("user", "find"), msg("assistant", [toolPart(big)])]);
    const output = (out[1]!.parts[0] as { output: string }).output;
    expect(output.startsWith(big.slice(0, 4000))).toBe(true);
    expect(output.slice(4000)).toMatch(/^\n\[truncated: 6,000 more characters\]$/);
  });

  it("truncates a large object output as JSON", () => {
    const out = windowHistory([text("user", "find"), msg("assistant", [toolPart({ rows: "x".repeat(9000) })])]);
    const output = (out[1]!.parts[0] as { output: string }).output;
    expect(typeof output).toBe("string");
    expect(output.startsWith('{"rows":"xxx')).toBe(true);
    expect(output).toMatch(/\[truncated: [\d,]+ more characters\]$/);
  });

  it("drops reasoning parts", () => {
    const out = windowHistory([
      text("user", "hi"),
      msg("assistant", [{ type: "reasoning", text: "thinking" }, { type: "text", text: "hello" }]),
    ]);
    expect(out[1]!.parts.map((p) => p.type)).toEqual(["text"]);
  });

  it("drops oldest messages to fit 96,000 chars", () => {
    const msgs = Array.from({ length: 10 }, (_, i) => text(i % 2 === 0 ? "user" : "assistant", "y".repeat(20_000)));
    const out = windowHistory(msgs);
    const size = out.reduce((s, m) => s + JSON.stringify(m.parts).length, 0);
    expect(size).toBeLessThanOrEqual(96_000);
    expect(out[0]!.role).toBe("user");
    expect(out.at(-1)).toEqual(msgs.at(-1));
    expect(out.length).toBe(4); // 4 × ~20k fit; a 5th would pass 96k
  });

  it("honours option overrides", () => {
    expect(windowHistory(alternating(10), { maxMessages: 4 })).toHaveLength(4);
  });

  it("returns an empty window for no messages", () => {
    expect(windowHistory([])).toEqual([]);
  });
});
