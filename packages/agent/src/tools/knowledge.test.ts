import { fakeEmbedder } from "@brandloop/ai/testing";
import { createKnowledge, prisma, replaceChunks } from "@brandloop/db";
import { tool } from "ai";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { cleanup, testContext, testProfile } from "../test/fixtures";
import { buildTools } from "./index";
import { listKBText, readKBText, searchKBText } from "./knowledge";

let p: string;
const embedder = fakeEmbedder();
const filler = (topic: string, words = 110) =>
  Array.from({ length: words }, (_, i) => `${topic}${i % 7 === 0 ? "." : ""}`).join(" ");

async function addText(profileId: string, title: string, chunks: string[]) {
  const item = await createKnowledge(profileId, { type: "TEXT", title, content: chunks.join("\n\n") });
  const vectors = await embedder.embed(chunks.map((c) => `${title}\n\n${c}`));
  await replaceChunks(
    profileId,
    "KNOWLEDGE",
    item.id,
    chunks.map((text, ordinal) => ({ ordinal, title, text, embedding: vectors[ordinal]! })),
  );
  return item;
}

beforeEach(async () => {
  await cleanup();
  p = (await testProfile()).profileId;
});
afterAll(cleanup);

describe("searchKB", () => {
  it("searchKB returns plain-text records", async () => {
    const mvp = await addText(p, "MVP vs POC", [`An MVP ships to real users; a POC proves feasibility. ${filler("mvp")}`]);
    await addText(p, "Hiring notes", [`We hire slowly and onboard carefully. ${filler("hiring")}`]);
    const out = await searchKBText(p, fakeEmbedder(), "MVP vs POC", 10);
    expect(out).toMatch(/^id: .+\ntitle: MVP vs POC\ntype: text\ncontent:\n/);
    expect(out.startsWith(`id: ${mvp.id}\n`)).toBe(true);
    expect(out).toContain("An MVP ships to real users");
  });

  it("inlines small items whole and excerpts large ones", async () => {
    const small = `Pricing anchors on outcomes. ${filler("pricing")}`;
    await addText(p, "Pricing small", [small]);
    const chunkA = `Pricing tiers explained for agencies. ${filler("tiers", 300)}`;
    const chunkB = `Discounts and pricing for annual plans. ${filler("annual", 300)}`;
    const chunkC = `Unrelated appendix about office plants. ${filler("plants", 300)}`;
    await addText(p, "Pricing large", [chunkA, chunkB, chunkC]);

    const out = await searchKBText(p, fakeEmbedder(), "pricing", 10);
    const records = out.split("\n\n---\n\n");
    expect(records).toHaveLength(2);
    const smallRec = records.find((r) => r.includes("title: Pricing small"))!;
    const largeRec = records.find((r) => r.includes("title: Pricing large"))!;
    expect(smallRec.endsWith(small)).toBe(true);
    expect(largeRec.endsWith("(excerpt; call readKB for the full text)")).toBe(true);
    expect(largeRec).not.toContain("office plants");
  });

  it("reports no matches and never returns another profile's items", async () => {
    const other = (await testProfile(2)).profileId;
    await addText(other, "Secret roadmap", [`Roadmap secret plans. ${filler("roadmap")}`]);
    expect(await searchKBText(p, fakeEmbedder(), "roadmap secret", 10)).toBe(
      'No knowledge base items match "roadmap secret".',
    );
  });

  it("falls back to full-text search without an embedder", async () => {
    await addText(p, "MVP vs POC", [`An MVP ships to real users. ${filler("mvp")}`]);
    expect(await searchKBText(p, null, "MVP", 10)).toMatch(/^id: .+\ntitle: MVP vs POC\n/);
  });
});

describe("readKB and listKB", () => {
  it("readKB uses the markdown format and fails cleanly for unknown ids", async () => {
    const item = await addText(p, "Title", [`Body text here. ${filler("body")}`]);
    const out = await readKBText(p, item.id);
    expect(out.startsWith("# Title\n\nType: text\n\nContent:\nBody text here.")).toBe(true);
    expect(await readKBText(p, "x")).toBe("Failed: no knowledge base item with id x.");
    const other = (await testProfile(2)).profileId;
    expect(await readKBText(other, item.id)).toBe(`Failed: no knowledge base item with id ${item.id}.`);
  });

  it("readKB caps at 20,000 chars and explains processing items", async () => {
    const item = await createKnowledge(p, { type: "TEXT", title: "Huge", content: filler("huge", 8000) });
    const out = await readKBText(p, item.id);
    expect(out.length).toBeLessThanOrEqual(20_000 + 80);
    expect(out).toMatch(/\[output truncated at 20,000 characters\]$/);
    const pending = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/post" });
    expect(await readKBText(p, pending.id)).toMatch(/still being processed/);
  });

  it("listKB lists items newest first, filters by type and handles empty", async () => {
    expect(await listKBText(p, { type: null, limit: 20 })).toBe("The knowledge base is empty.");
    const a = await addText(p, "First", [filler("first")]);
    const b = await createKnowledge(p, { type: "URL", sourceUrl: "https://example.com/x", title: "A link" });
    const out = await listKBText(p, { type: null, limit: 20 });
    expect(out.split("\n")).toEqual([
      expect.stringMatching(new RegExp(`^${b.id} \\| A link \\| url \\| processing \\| \\d{4}-\\d{2}-\\d{2}$`)),
      expect.stringMatching(new RegExp(`^${a.id} \\| First \\| text \\| ready \\| \\d{4}-\\d{2}-\\d{2}$`)),
    ]);
    expect((await listKBText(p, { type: "TEXT", limit: 20 })).split("\n")).toHaveLength(1);
    expect((await listKBText(p, { type: null, limit: 1 })).split("\n")).toHaveLength(1);
  });
});

describe("buildTools", () => {
  const sel = { knowledgeIds: [], writingStyleId: null, webSearchEnabled: true, quickLinkKey: null, formatId: null };

  it("buildTools exposes the seventeen tools", async () => {
    expect(Object.keys(buildTools(await testContext())).sort()).toEqual([
      "analyzePost",
      "createDocument",
      "delegateEditing",
      "delegateWriting",
      "editMemory",
      "generateHooks",
      "getContentStrategy",
      "getPostVersions",
      "listKB",
      "proposeDocumentEdits",
      "readKB",
      "readMemory",
      "saveMemory",
      "searchKB",
      "searchMemory",
      "updateDocument",
      "viewMemory",
    ]);
  });

  it("includes web_search only when enabled and provided", async () => {
    const fakeTool = tool({ description: "x", inputSchema: z.object({}), execute: async () => "" });
    expect(
      Object.keys(buildTools(await testContext({ selections: { ...sel, webSearchEnabled: false } }), { webSearchTool: fakeTool })),
    ).not.toContain("web_search");
    expect(Object.keys(buildTools(await testContext(), { webSearchTool: fakeTool }))).toContain("web_search");
    expect(Object.keys(buildTools(await testContext()))).not.toContain("web_search");
  });

  it("getContentStrategy explains a missing strategy", async () => {
    const ctx = await testContext();
    const out = await buildTools(ctx).getContentStrategy.execute!({}, { toolCallId: "c", messages: [], context: {} as never });
    expect(out).toContain("No content strategy yet"); // framed as strategy data since fix round 1
    await prisma.strategy.create({ data: { profileId: ctx.profileId, positioning: "Design ops", tagline: "Calm ops" } });
    const out2 = (await buildTools(ctx).getContentStrategy.execute!({}, { toolCallId: "c", messages: [], context: {} as never })) as string;
    expect(out2).toContain("Positioning: Design ops");
    expect(out2).toContain("Tagline: Calm ops");
  });
});
