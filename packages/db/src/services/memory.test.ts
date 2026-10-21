import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { assertProfileAccess, ensureAccount } from "./account";
import {
  appendMemoryLines,
  deleteMemoryLine,
  editMemoryLine,
  listMemory,
  memoryLines,
  upsertMemory,
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

describe("profile access", () => {
  it("hides another team's profile", async () => {
    const mine = await setup();
    const other = await ensureAccount(clerk(2));
    await expect(assertProfileAccess(mine.userId, other.currentProfile!.id)).rejects.toThrow(/not found/);
    await expect(assertProfileAccess(mine.userId, mine.profileId)).resolves.toMatchObject({ id: mine.profileId });
  });
});
