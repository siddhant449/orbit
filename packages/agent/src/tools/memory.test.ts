import { getMemoryVersion, listMemory, prisma, upsertMemory, writeSection } from "@brandloop/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { cleanup, testContext, testProfile } from "../test/fixtures";
import {
  editMemoryText,
  memoryTools,
  readMemoryText,
  saveMemoryFacts,
  searchMemoryText,
  viewMemoryText,
} from "./memory";

let p: string;

beforeEach(async () => {
  await cleanup();
  p = (await testProfile()).profileId;
});
afterAll(cleanup);

describe("saveMemory", () => {
  it("saveMemory appends to writing/rules and bumps the version", async () => {
    expect(
      await saveMemoryFacts(p, { category: "writing_rules", topic: null, facts: ["Prefer short paragraphs in posts"] }),
    ).toBe("✓ Updated writing_rules with 1 item");
    expect(await getMemoryVersion(p)).toBe(1);
    const doc = (await listMemory(p)).find((d) => d.key === "writing/rules")!;
    expect(doc.content).toBe("- Prefer short paragraphs in posts");
    expect(doc.source).toBe("EXTRACTED");
  });

  it("saveMemory refuses assistant-like text and writes nothing", async () => {
    const out = await saveMemoryFacts(p, {
      category: "about",
      topic: null,
      facts: ["Could you provide more details about your role?"],
    });
    expect(out).toBe(
      "Refused: these read like assistant replies or questions, not facts about the user. Nothing was saved.",
    );
    expect(await getMemoryVersion(p)).toBe(0);
    expect(await listMemory(p)).toHaveLength(0);
  });

  it("saves the good facts, counts the refused ones and dedupes", async () => {
    await upsertMemory(p, "identity/about", "- Runs a design studio in Pune", "USER");
    const out = await saveMemoryFacts(p, {
      category: "about",
      topic: null,
      facts: ["Runs a design studio in Pune", "Has 12 years in brand design", "I'd need more context first", "Mentors two juniors"],
    });
    expect(out).toBe("✓ Updated about with 2 items (1 refused)");
    expect((await listMemory(p))[0]!.content).toBe(
      "- Runs a design studio in Pune\n- Has 12 years in brand design\n- Mentors two juniors",
    );
  });

  it("reports nothing new when every fact is already saved", async () => {
    await upsertMemory(p, "identity/story", "- Left agency life in 2019", "USER");
    const before = await getMemoryVersion(p);
    expect(await saveMemoryFacts(p, { category: "story", topic: null, facts: ["left agency life in 2019"] })).toBe(
      "✓ Already saved: nothing new for story",
    );
    expect(await getMemoryVersion(p)).toBe(before);
  });

  it("saveMemory with a topic creates topics/<slug>", async () => {
    expect(
      await saveMemoryFacts(p, { category: "topic", topic: "Design Systems", facts: ["Thinks tokens beat component libraries"] }),
    ).toBe("✓ Updated topic with 1 item");
    expect((await listMemory(p)).map((d) => d.key)).toEqual(["topics/design-systems"]);
    expect(await saveMemoryFacts(p, { category: "topic", topic: null, facts: ["Thinks tokens beat libraries"] })).toMatch(
      /^Failed:/,
    );
  });
});

describe("editMemory", () => {
  it("editMemory replaces once, reports ambiguity, and refuses mirrors", async () => {
    await upsertMemory(p, "identity/about", "- Runs a studio in Mumbai\n- Studio has 6 people\n- Studio has 6 desks", "USER");
    await upsertMemory(p, "strategy/themes", "# Content pillars", "MIRRORED");
    const v = await getMemoryVersion(p);

    expect(await editMemoryText(p, { path: "identity/about.md", find: "Mumbai", replace: "Pune" })).toBe(
      `✓ Updated identity/about.md (memory version ${v + 1})`,
    );
    expect((await listMemory(p)).find((d) => d.key === "identity/about")!.content).toContain("Runs a studio in Pune");

    expect(await editMemoryText(p, { path: "identity/about.md", find: "Studio has 6", replace: "Studio has 7" })).toMatch(
      /^Failed: the find text appears 2 times in identity\/about\.md/,
    );
    expect(await editMemoryText(p, { path: "identity/about.md", find: "Berlin", replace: "Paris" })).toMatch(/^Failed:/);
    expect(await editMemoryText(p, { path: "strategy/themes.md", find: "Content", replace: "Pillars" })).toMatch(
      /^Refused: strategy\/themes\.md mirrors the content strategy/,
    );
    expect(await editMemoryText(p, { path: "identity/story.md", find: "x", replace: "y" })).toBe(
      "Failed: no memory file at identity/story.md. Call viewMemory to see what exists.",
    );
    expect(await getMemoryVersion(p)).toBe(v + 1);
  });

  it("deletes with an empty replace and refuses assistant-like replacements", async () => {
    await upsertMemory(p, "writing/rules", "- Never use emoji\n- Keep posts short", "USER");
    expect(await editMemoryText(p, { path: "writing/rules.md", find: "- Never use emoji\n", replace: "" })).toMatch(/^✓ Updated/);
    expect((await listMemory(p))[0]!.content).toBe("- Keep posts short");
    expect(
      await editMemoryText(p, { path: "writing/rules.md", find: "Keep posts short", replace: "Could you provide your rules?" }),
    ).toMatch(/^Refused:/);
    expect(await editMemoryText(p, { path: "../etc/passwd", find: "a", replace: "b" })).toMatch(/^Failed:/);
  });
});

describe("readMemory, viewMemory, searchMemory", () => {
  it("readMemory and viewMemory use the documented formats", async () => {
    expect(await viewMemoryText(p, false)).toBe("Memory is empty. Nothing has been saved about this user yet.");
    expect(await viewMemoryText(p, true)).toBe("Memory is empty. Nothing has been saved about this user yet.");

    await writeSection(p, "identity/about", "- Runs a design studio in Pune", "USER");
    await writeSection(p, "voice/style", "## Rhythm\nShort sentences.", "USER");
    const index = await viewMemoryText(p, false);
    expect(index).toMatch(/^identity\/\n  identity\/about\.md, Who the user is: role, company, positioning \(updated \d{4}-\d{2}-\d{2}\)/);
    expect(index).toContain("voice/style.md");
    expect(index).not.toContain("Runs a design studio");

    const full = await viewMemoryText(p, true);
    expect(full).toContain("[memory file: identity/about.md | description: Who the user is: role, company, positioning]");
    expect(full).toContain("Runs a design studio in Pune");
    expect(full).not.toContain("Short sentences.");

    expect(await readMemoryText(p, "voice/style.md")).toBe(
      "[memory file: voice/style.md | title: Voice and style | description: How the user writes: sentence rhythm, structure, signature moves, and explicit content rules | version: 2]\n" +
        "(everything below this line is the stored file content, verbatim; editMemory find text must match it exactly)\n\n" +
        "## Rhythm\nShort sentences.",
    );
    expect(await readMemoryText(p, "identity/story.md")).toBe(
      "Failed: no memory file at identity/story.md. Call viewMemory to see what exists.",
    );
  });

  it("searchMemory ranks bullet lines and reports no match", async () => {
    await writeSection(p, "identity/about", "- Runs a design studio in Pune\n- Loves design systems", "USER");
    await writeSection(p, "writing/rules", "- No emoji", "USER");
    expect(await searchMemoryText(p, "design studio")).toBe(
      "identity/about.md: Runs a design studio in Pune\nidentity/about.md: Loves design systems",
    );
    expect(await searchMemoryText(p, "kayaking")).toBe('No memory lines match "kayaking".');
  });

  it("only touches the caller's profile", async () => {
    const other = (await testProfile(2)).profileId;
    await writeSection(other, "identity/about", "- Secret other profile fact", "USER");
    expect(await viewMemoryText(p, true)).toBe("Memory is empty. Nothing has been saved about this user yet.");
    expect(await readMemoryText(p, "identity/about.md")).toMatch(/^Failed:/);
    expect(await searchMemoryText(p, "secret")).toMatch(/^No memory lines match/);
  });
});

describe("memoryTools", () => {
  it("caps tool output at the tool output limit", async () => {
    const huge = Array.from({ length: 400 }, (_, i) => `- Fact number ${i} ${"z".repeat(40)}`).join("\n");
    await writeSection(p, "identity/about", huge, "USER");
    const tools = memoryTools(await testContext({ profileId: p, userId: (await prisma.profile.findUniqueOrThrow({ where: { id: p } })).ownerUserId }));
    const out = (await tools.readMemory.execute!({ path: "identity/about.md" }, { toolCallId: "c1", messages: [], context: {} as never })) as string;
    expect(out.length).toBeLessThanOrEqual(12_000 + 80);
    expect(out).toMatch(/\[output truncated at 12,000 characters\]$/);
  });

  it("the learning guard keeps a writing request from becoming a remembered fact (the Kleo case)", async () => {
    const test = "Write one LinkedIn post for founders hiring their first engineer. No personal details. Just a test.";
    const out = await saveMemoryFacts(p, { category: "about", topic: null, facts: ["Has hired their first engineer"] }, test);
    expect(out).toMatch(/^Refused: nothing was saved/);
    expect((await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId: p, key: "identity/about" } } }))?.content ?? "").not.toMatch(/first engineer/);
    const ok = await saveMemoryFacts(p, { category: "about", topic: null, facts: ["Runs a design studio in Pune"] }, "I run a design studio in Pune.");
    expect(ok).toMatch(/^✓ Updated about/);
  });
});
