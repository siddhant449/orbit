import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  class AccountError extends Error {}
  class MemoryVersionConflict extends Error {
    currentVersion: number;
    constructor(v: number) {
      super("Memory changed since you loaded it.");
      this.currentVersion = v;
    }
  }
  return {
    AccountError,
    MemoryVersionConflict,
    getMemoryVersion: vi.fn(),
    listMemory: vi.fn(),
    writeSection: vi.fn(),
    keyToPath: (k: string) => `${k}.md`,
    pathToKey: (p: string) => (/^[a-z0-9/-]+\.md$/.test(p) ? p.replace(/\.md$/, "") : null),
    sectionMeta: () => ({ title: "T", description: "D" }),
  };
});
vi.mock("@brandloop/db", () => db);

import { patchUserMemory, readUserMemory } from "./user-memory";

beforeEach(() => vi.resetAllMocks());

describe("readUserMemory", () => {
  it("returns the version and every section", async () => {
    db.getMemoryVersion.mockResolvedValue(7);
    db.listMemory.mockResolvedValue([
      { key: "identity/about", content: "- A", source: "USER", pinned: false, updatedAt: "now" },
    ]);
    const res = await readUserMemory("p1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      version: 7,
      sections: [
        {
          key: "identity/about",
          path: "identity/about.md",
          title: "T",
          description: "D",
          content: "- A",
          source: "USER",
          pinned: false,
          updatedAt: "now",
        },
      ],
    });
  });
});

describe("patchUserMemory", () => {
  const ok = { target: "identity/about.md", content: "- A", expectedVersion: 3 };

  it("writes and returns the bumped version", async () => {
    db.writeSection.mockResolvedValue({ version: 4 });
    const res = await patchUserMemory("p1", ok);
    expect(res).toEqual({ status: 200, body: { success: true, version: 4 } });
    expect(db.writeSection).toHaveBeenCalledWith("p1", "identity/about", "- A", "USER", { expectedVersion: 3 });
  });

  it("deletes only on exactly null", async () => {
    db.writeSection.mockResolvedValue({ version: 5 });
    expect((await patchUserMemory("p1", { ...ok, content: null })).status).toBe(200);
    expect(db.writeSection).toHaveBeenCalledWith("p1", "identity/about", null, "USER", { expectedVersion: 3 });
  });

  it.each([
    ["no body", null],
    ["bad target", { ...ok, target: "nope" }],
    ["non-string target", { ...ok, target: 4 }],
    ["number content", { ...ok, content: 4 }],
    ["missing content", { target: ok.target, expectedVersion: 3 }],
    ["empty content", { ...ok, content: "" }],
    ["whitespace content", { ...ok, content: "  \n " }],
    ["too long", { ...ok, content: "x".repeat(20_001) }],
    ["missing version", { target: ok.target, content: "- A" }],
    ["fractional version", { ...ok, expectedVersion: 1.5 }],
    ["negative version", { ...ok, expectedVersion: -1 }],
    ["string version", { ...ok, expectedVersion: "3" }],
  ])("400 for %s", async (_name, body) => {
    const res = await patchUserMemory("p1", body);
    expect(res.status).toBe(400);
    expect(db.writeSection).not.toHaveBeenCalled();
  });

  it("409 with code, error and current version on conflict", async () => {
    db.writeSection.mockRejectedValue(new db.MemoryVersionConflict(9));
    const res = await patchUserMemory("p1", ok);
    expect(res).toEqual({
      status: 409,
      body: { code: "memory_version_conflict", error: "Memory changed since you loaded it.", version: 9 },
    });
  });

  it("400 for an AccountError, rethrows anything else", async () => {
    db.writeSection.mockRejectedValueOnce(new db.AccountError("Nope"));
    expect(await patchUserMemory("p1", ok)).toEqual({ status: 400, body: { error: "Nope" } });
    db.writeSection.mockRejectedValueOnce(new Error("boom"));
    await expect(patchUserMemory("p1", ok)).rejects.toThrow("boom");
  });
});
