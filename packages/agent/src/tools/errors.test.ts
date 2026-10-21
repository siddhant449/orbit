import { afterEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  appendMemoryLines: vi.fn(),
  listMemory: vi.fn(),
  hybridSearch: vi.fn(),
}));

vi.mock("@brandloop/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@brandloop/db")>();
  return {
    ...orig,
    appendMemoryLines: (...a: unknown[]) => db.appendMemoryLines(...a),
    listMemory: (...a: unknown[]) => db.listMemory(...a),
    hybridSearch: (...a: unknown[]) => db.hybridSearch(...a),
    prisma: {
      ...orig.prisma,
      memoryDoc: { findUnique: async () => null },
      knowledgeItem: {
        findMany: async () => [{ id: "k1", title: "MVP vs POC", type: "TEXT", content: "Short body.", status: "READY" }],
      },
    },
  };
});

const { MemoryVersionConflict } = await import("@brandloop/db");
const { AiUnavailableError } = await import("@brandloop/ai");
const { testContext } = await import("../test/fixtures");
const { buildTools } = await import("./index");

const opts = { toolCallId: "c1", messages: [], context: {} as never };
const ctx = () => testContext({ profileId: "p_mock", userId: "u_mock" });
const run = async (name: string, input: unknown, c?: Awaited<ReturnType<typeof ctx>>) =>
  (await (buildTools(c ?? (await ctx())) as Record<string, { execute?: (i: unknown, o: typeof opts) => unknown }>)[
    name
  ]!.execute!(input, opts)) as string;

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("tool errors become results", () => {
  it("reports a memory version conflict after retries", async () => {
    db.appendMemoryLines.mockRejectedValue(new MemoryVersionConflict(7));
    expect(await run("saveMemory", { category: "about", topic: null, facts: ["Runs a design studio in Pune"] })).toBe(
      "Failed: your memory changed while saving. Read it again and retry.",
    );
  });

  it("turns any other throw into a Failed line and logs only the message", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.listMemory.mockRejectedValue(new Error("connection reset"));
    expect(await run("viewMemory", { includeContents: false })).toBe("Failed: something went wrong running viewMemory.");
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]!.join(" ")).toContain("connection reset");
    expect(log.mock.calls[0]!.some((a) => a instanceof Error)).toBe(false);
  });

  it("falls back to full-text search when the embedded search fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    db.hybridSearch.mockImplementation(async (_p: string, _q: string, o: { embedder: unknown }) => {
      if (o.embedder) throw new AiUnavailableError();
      return [{ sourceType: "KNOWLEDGE", sourceId: "k1", score: 1, chunks: [{ id: "c", ordinal: 0, text: "Short body.", score: 1 }] }];
    });
    const out = await run("searchKB", { query: "MVP", limit: 10 });
    expect(out).toContain("id: k1\ntitle: MVP vs POC\ntype: text\ncontent:\nShort body.");
    expect(db.hybridSearch).toHaveBeenCalledTimes(2);
    expect(db.hybridSearch.mock.calls[1]![2]).toMatchObject({ embedder: null });
  });
});
