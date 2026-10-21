import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { assertProfileAccess, ensureAccount } from "./account";
import {
  MemoryVersionConflict,
  appendMemoryLines,
  deleteMemoryLine,
  editMemoryLine,
  getMemoryVersion,
  listMemory,
  memoryLines,
  replaceInSection,
  upsertMemory,
  withMemoryRetry,
  writeSection,
} from "./memory";

const clerk = (n: number) => ({
  clerkId: `user_test_mem${n}`,
  email: `mem${n}@example.test`,
  firstName: `Mem${n}`,
  teamNameSuffix: " (test)",
});

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}

beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function setup() {
  const state = await ensureAccount(clerk(1));
  return { userId: state.user.id, profileId: state.currentProfile!.id };
}

describe("upsertMemory", () => {
  it("rejects invalid keys", async () => {
    const { profileId } = await setup();
    await expect(upsertMemory(profileId, "Bad Key", "x", "USER")).rejects.toThrow(/key/i);
  });

  it("creates then updates, and lists ordered by key", async () => {
    const { profileId } = await setup();
    await upsertMemory(profileId, "writing/rules", "r1", "USER");
    await upsertMemory(profileId, "identity/about", "a", "USER");
    await upsertMemory(profileId, "writing/rules", "r2", "EXTRACTED");
    const docs = await listMemory(profileId);
    expect(docs.map((d) => d.key)).toEqual(["identity/about", "writing/rules"]);
    expect(docs[1]!.content).toBe("r2");
    expect(docs[1]!.source).toBe("EXTRACTED");
  });
});

describe("appendMemoryLines", () => {
  it("dedupes ignoring case and whitespace", async () => {
    const { profileId } = await setup();
    const doc = await appendMemoryLines(profileId, "identity/personal", [
      "Runs a design studio",
      "runs a design studio ",
    ], "USER");
    expect(doc.content).toBe("- Runs a design studio");
    const again = await appendMemoryLines(profileId, "identity/personal", ["RUNS  A DESIGN STUDIO", "Has a dog"], "USER");
    expect(again.content).toBe("- Runs a design studio\n- Has a dog");
  });
});

describe("line editing", () => {
  it("edits and deletes by raw line index, keeping indent and marker", async () => {
    const { profileId } = await setup();
    const key = "identity/story";
    await upsertMemory(profileId, key, "- a\n  - a1\n- b", "USER");
    expect(memoryLines("- a\n  - a1\n- b")).toEqual([
      { index: 0, text: "a", depth: 0 },
      { index: 1, text: "a1", depth: 1 },
      { index: 2, text: "b", depth: 0 },
    ]);
    const edited = await editMemoryLine(profileId, key, 1, "A1!");
    expect(edited.content).toBe("- a\n  - A1!\n- b");
    const deleted = await deleteMemoryLine(profileId, key, 2);
    expect(deleted.content).toBe("- a\n  - A1!");
  });

  it("rejects non-bullet or out-of-range lines", async () => {
    const { profileId } = await setup();
    await upsertMemory(profileId, "identity/story", "intro\n- a", "USER");
    await expect(editMemoryLine(profileId, "identity/story", 0, "x")).rejects.toThrow(/line/i);
    await expect(deleteMemoryLine(profileId, "identity/story", 9)).rejects.toThrow(/line/i);
  });
});

describe("expectedText guard", () => {
  it("throws on mismatch and leaves content unchanged; succeeds on match", async () => {
    const { profileId } = await setup();
    const key = "identity/about";
    await upsertMemory(profileId, key, "- A\n- B", "USER");
    const msg = "This memory changed. Refresh and try again.";
    await expect(editMemoryLine(profileId, key, 1, "Z", "A")).rejects.toThrow(msg);
    await expect(deleteMemoryLine(profileId, key, 1, "A")).rejects.toThrow(msg);
    expect((await listMemory(profileId))[0]!.content).toBe("- A\n- B");
    await editMemoryLine(profileId, key, 1, "B2", " B ");
    await deleteMemoryLine(profileId, key, 0, "A");
    expect((await listMemory(profileId))[0]!.content).toBe("- B2");
  });
});

describe("profile access", () => {
  it("hides another team's profile", async () => {
    const mine = await setup();
    const other = await ensureAccount(clerk(2));
    await expect(assertProfileAccess(mine.userId, other.currentProfile!.id)).rejects.toThrow(/not found/);
    await expect(assertProfileAccess(mine.userId, mine.profileId)).resolves.toMatchObject({ id: mine.profileId });
  });
});

describe("memory version", () => {
  it("bumps memoryVersion on every write path", async () => {
    const { profileId: p } = await setup();
    expect(await getMemoryVersion(p)).toBe(0);
    await upsertMemory(p, "identity/about", "- A", "USER"); // 1
    await appendMemoryLines(p, "identity/about", ["B"], "USER"); // 2
    await editMemoryLine(p, "identity/about", 0, "A2"); // 3
    await deleteMemoryLine(p, "identity/about", 1); // 4
    expect(await getMemoryVersion(p)).toBe(4);
  });

  it("does not bump when an append adds nothing new", async () => {
    const { profileId: p } = await setup();
    await appendMemoryLines(p, "identity/about", ["A"], "USER");
    await appendMemoryLines(p, "identity/about", ["a "], "USER");
    expect(await getMemoryVersion(p)).toBe(1);
  });

  it("rejects a stale expectedVersion and leaves content unchanged", async () => {
    const { profileId: p } = await setup();
    await writeSection(p, "writing/rules", "- Do X", "USER"); // version 1
    const err = await writeSection(p, "writing/rules", "- Y", "USER", { expectedVersion: 0 }).catch((e) => e);
    expect(err).toBeInstanceOf(MemoryVersionConflict);
    expect(err.currentVersion).toBe(1);
    expect((await listMemory(p))[0]!.content).toBe("- Do X");
    expect(await getMemoryVersion(p)).toBe(1);
  });

  it("accepts the current expectedVersion and returns the new version", async () => {
    const { profileId: p } = await setup();
    await writeSection(p, "writing/rules", "- Do X", "USER");
    const { doc, version } = await writeSection(p, "writing/rules", "- Y", "EXTRACTED", { expectedVersion: 1 });
    expect(version).toBe(2);
    expect(doc).toMatchObject({ key: "writing/rules", content: "- Y", source: "EXTRACTED" });
  });

  it("deletes a section with null content", async () => {
    const { profileId: p } = await setup();
    await writeSection(p, "topics/pricing", "- Premium", "USER"); // 1
    const out = await writeSection(p, "topics/pricing", null, "USER"); // 2
    expect(out).toEqual({ doc: null, version: 2 });
    expect(await listMemory(p)).toEqual([]);
    expect(await getMemoryVersion(p)).toBe(2);
  });

  it("rejects an invalid key without bumping the version", async () => {
    const { profileId: p } = await setup();
    await expect(writeSection(p, "../x", "a", "USER")).rejects.toThrow(/key/i);
    expect(await getMemoryVersion(p)).toBe(0);
  });

  it("keeps the version per profile", async () => {
    const mine = await setup();
    const other = await ensureAccount(clerk(2));
    await upsertMemory(mine.profileId, "identity/about", "- A", "USER");
    expect(await getMemoryVersion(other.currentProfile!.id)).toBe(0);
  });

  it("keeps both lines under concurrent appends", async () => {
    const { profileId: p } = await setup();
    await Promise.all([
      appendMemoryLines(p, "identity/personal", ["One fact here"], "USER"),
      appendMemoryLines(p, "identity/personal", ["Two fact here"], "USER"),
    ]);
    const c = (await listMemory(p))[0]!.content;
    expect(c).toContain("One fact here");
    expect(c).toContain("Two fact here");
    expect(await getMemoryVersion(p)).toBe(2);
  });
});

describe("withMemoryRetry", () => {
  it("retries on conflict with a fresh version, then gives up after the attempt limit", async () => {
    const { profileId: p } = await setup();
    const seen: number[] = [];
    const result = await withMemoryRetry(p, async (version) => {
      seen.push(version);
      if (seen.length === 1) await writeSection(p, "identity/about", "- Raced", "USER"); // someone else writes first
      return writeSection(p, "identity/about", "- Mine", "USER", { expectedVersion: version });
    });
    expect(seen).toEqual([0, 1]);
    expect(result.version).toBe(2);

    let calls = 0;
    await expect(
      withMemoryRetry(p, async (version) => {
        calls++;
        await writeSection(p, "identity/about", `- Race ${calls}`, "USER");
        return writeSection(p, "identity/about", "- Mine", "USER", { expectedVersion: version });
      }),
    ).rejects.toBeInstanceOf(MemoryVersionConflict);
    expect(calls).toBe(3);
  });

  it("does not retry other errors", async () => {
    const { profileId: p } = await setup();
    let calls = 0;
    await expect(
      withMemoryRetry(p, async () => {
        calls++;
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(calls).toBe(1);
  });
});

describe("replaceInSection", () => {
  it("replaces exactly one occurrence", async () => {
    const { profileId: p } = await setup();
    await upsertMemory(p, "voice/style", "- Short sentences\n- Plain words", "USER"); // 1
    const out = await replaceInSection(p, "voice/style", "Plain words", "Concrete words", "EXTRACTED");
    expect(out).toEqual({ ok: true, version: 2 });
    const doc = (await listMemory(p))[0]!;
    expect(doc.content).toBe("- Short sentences\n- Concrete words");
    expect(doc.source).toBe("EXTRACTED");
  });

  it("reports missing, absent and ambiguous matches without writing", async () => {
    const { profileId: p } = await setup();
    expect(await replaceInSection(p, "voice/style", "a", "b", "USER")).toEqual({
      ok: false,
      reason: "missing_section",
      count: 0,
    });
    await upsertMemory(p, "voice/style", "- ab\n- ab", "USER"); // 1
    expect(await replaceInSection(p, "voice/style", "ab", "c", "USER")).toEqual({
      ok: false,
      reason: "ambiguous",
      count: 2,
    });
    expect(await replaceInSection(p, "voice/style", "zz", "c", "USER")).toEqual({
      ok: false,
      reason: "not_found",
      count: 0,
    });
    expect((await listMemory(p))[0]!.content).toBe("- ab\n- ab");
    expect(await getMemoryVersion(p)).toBe(1);
  });
});
