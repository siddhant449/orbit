import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => {
  class AccountError extends Error {}
  class MemoryVersionConflict extends Error {
    currentVersion = 1;
  }
  return {
    AccountError,
    MemoryVersionConflict,
    assertProfileAccess: vi.fn(),
    appendMemoryLines: vi.fn(),
    editMemoryLine: vi.fn(),
    deleteMemoryLine: vi.fn(),
  };
});
vi.mock("@brandloop/db", () => db);
vi.mock("@brandloop/ai", () => ({ StrategySchema: {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/account", () => ({
  getAccount: async () => ({ user: { id: "u1" }, currentProfile: { id: "p1" } }),
}));

import { addMemoryAction, deleteMemoryLineAction, editMemoryLineAction } from "./actions";

beforeEach(() => vi.resetAllMocks());

describe("memory actions", () => {
  it("turn a MemoryVersionConflict into a friendly failure", async () => {
    db.appendMemoryLines.mockRejectedValue(new db.MemoryVersionConflict());
    expect(await addMemoryAction("identity/about", "x")).toEqual({
      ok: false,
      error: "Your memory changed while saving. Try again.",
    });
  });

  it("still maps AccountError and rethrows unknown errors", async () => {
    db.deleteMemoryLine.mockRejectedValueOnce(new db.AccountError("Gone"));
    expect(await deleteMemoryLineAction("identity/about", 0, "a")).toEqual({ ok: false, error: "Gone" });
    db.editMemoryLine.mockRejectedValueOnce(new Error("boom"));
    await expect(editMemoryLineAction("identity/about", 0, "b", "a")).rejects.toThrow("boom");
  });

  it("passes expectedText through to the db layer", async () => {
    await editMemoryLineAction("identity/about", 2, "new", "old");
    expect(db.editMemoryLine).toHaveBeenCalledWith("p1", "identity/about", 2, "new", "old");
    await deleteMemoryLineAction("identity/about", 2, "old");
    expect(db.deleteMemoryLine).toHaveBeenCalledWith("p1", "identity/about", 2, "old");
  });
});
