import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { getCredits, OutOfCreditsError } from "./credits";
import {
  beginEdit, completeEdit, completeGenerate, createVisualWithDebit, failEdit, failVisual, getActiveForDocument, getVisual,
  listVersions, listVisuals, revertVisual, startOp, VisualError,
} from "./visuals";
import { account, cleanupVisualTests, newDocument, object, secondProfile, setBalance, visualInput, type TestAccount } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const now = new Date("2026-10-22T10:00:00Z");

/** A COMPLETED visual with version 0. */
async function completed(a: TestAccount, requestId: string, over = {}) {
  const { visual } = await createVisualWithDebit(visualInput(a, requestId, over), now);
  expect(await startOp(visual.id, "generate")).not.toBeNull();
  const obj = await object(a);
  await completeGenerate(visual.id, { storageObjectId: obj.id, width: 1080, height: 1350, provider: "mock", builtPrompt: "p" });
  return { id: visual.id, obj };
}

async function doEdit(a: TestAccount, id: string, n: number) {
  await beginEdit(a.profileId, id);
  expect(await startOp(id, "edit")).not.toBeNull();
  const obj = await object(a);
  return completeEdit(id, { storageObjectId: obj.id, editPrompt: `edit ${n}`, kind: "EDIT", width: 1080, height: 1350 });
}

describe("createVisualWithDebit", () => {
  it("debits once per requestId and returns the same visual on retry", async () => {
    const a = await account("v1");
    const first = await createVisualWithDebit(visualInput(a, "r1"), now);
    expect(first).toMatchObject({ created: true, balance: 29 });
    expect(first.visual).toMatchObject({ status: "PENDING", activeOp: "generate", currentVersion: 0, editCount: 0, maxEdits: 5 });
    const again = await createVisualWithDebit(visualInput(a, "r1"), now);
    expect(again).toMatchObject({ created: false, balance: 29 });
    expect(again.visual.id).toBe(first.visual.id);
    expect((await getCredits(a.teamId, now)).balance).toBe(29);
    const rows = await prisma.creditLedger.findMany({ where: { teamId: a.teamId, reason: "GENERATE" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ delta: -1, balanceAfter: 29, visualId: first.visual.id, profileId: a.profileId });
  });

  it("20 parallel creates on balance 5: exactly 5 succeed, 15 OutOfCredits, ledger sum matches", async () => {
    const a = await account("v2");
    await setBalance(a.teamId, 5, now);
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => createVisualWithDebit(visualInput(a, `p${i}`), now)));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(5);
    const rejected = results.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(rejected).toHaveLength(15);
    expect(rejected.every((x) => x.reason instanceof OutOfCreditsError)).toBe(true);
    expect((await getCredits(a.teamId, now)).balance).toBe(0);
    const sum = await prisma.creditLedger.aggregate({ where: { teamId: a.teamId }, _sum: { delta: true } });
    expect(sum._sum.delta).toBe(-5);
    expect(await prisma.visual.count({ where: { teamId: a.teamId } })).toBe(5);
  });

  it("OutOfCreditsError carries the balance and the refill date; a retry of an existing request still succeeds at 0", async () => {
    const a = await account("v3");
    await setBalance(a.teamId, 1, now);
    const ok = await createVisualWithDebit(visualInput(a, "x"), now);
    const err = await createVisualWithDebit(visualInput(a, "y"), now).catch((e) => e);
    expect(err).toBeInstanceOf(OutOfCreditsError);
    expect(err).toMatchObject({ balance: 0, refillsAt: new Date(now.getTime() + 30 * 86_400_000) });
    expect((await createVisualWithDebit(visualInput(a, "x"), now)).visual.id).toBe(ok.visual.id);
    expect(await prisma.visual.count({ where: { teamId: a.teamId } })).toBe(1);
  });

  it("refills lazily inside the debit transaction", async () => {
    const a = await account("v4");
    await setBalance(a.teamId, 0, new Date(now.getTime() - 31 * 86_400_000));
    expect((await createVisualWithDebit(visualInput(a, "z"), now)).balance).toBe(29);
  });

  it("one active generation per post", async () => {
    const a = await account("v5");
    const doc = await newDocument(a.profileId);
    await createVisualWithDebit(visualInput(a, "d1", { documentId: doc.id }), now);
    const err = await createVisualWithDebit(visualInput(a, "d2", { documentId: doc.id }), now).catch((e) => e);
    expect(err).toBeInstanceOf(VisualError);
    expect(err.code).toBe("in_progress");
    expect((await getCredits(a.teamId, now)).balance).toBe(29); // refused without a debit
    // another post is fine, and so is the same post once the first finished
    const other = await newDocument(a.profileId);
    await createVisualWithDebit(visualInput(a, "d3", { documentId: other.id }), now);
  });

  it("refuses a document of another profile", async () => {
    const a = await account("v6");
    const b = await account("v7");
    const doc = await newDocument(b.profileId);
    await expect(createVisualWithDebit(visualInput(a, "q", { documentId: doc.id }), now)).rejects.toMatchObject({ code: "not_found" });
    expect((await getCredits(a.teamId, now)).balance).toBe(30);
  });
});

describe("generate lifecycle", () => {
  it("startOp is a CAS: a second concurrent start returns null", async () => {
    const a = await account("l1");
    const { visual } = await createVisualWithDebit(visualInput(a, "s1"), now);
    const [x, y] = await Promise.all([startOp(visual.id, "generate"), startOp(visual.id, "generate")]);
    expect([x, y].filter(Boolean)).toHaveLength(1);
    expect(await startOp(visual.id, "edit")).toBeNull(); // wrong op
    expect((await getVisual(a.profileId, visual.id))!.visual.status).toBe("PROCESSING");
  });

  it("a stale PROCESSING visual (crashed worker) can be reclaimed, a fresh one cannot", async () => {
    const a = await account("l2");
    const { visual } = await createVisualWithDebit(visualInput(a, "s2"), now);
    await startOp(visual.id, "generate");
    expect(await startOp(visual.id, "generate")).toBeNull();
    await prisma.visual.update({ where: { id: visual.id }, data: { activeOpStartedAt: new Date(Date.now() - 20 * 60_000) } });
    expect(await startOp(visual.id, "generate")).not.toBeNull();
  });

  it("completeGenerate writes v0 and COMPLETED, clears the op, and is a no-op the second time", async () => {
    const a = await account("l3");
    const { id, obj } = await completed(a, "c1");
    const got = (await getVisual(a.profileId, id))!;
    expect(got.visual).toMatchObject({ status: "COMPLETED", activeOp: null, currentVersion: 0, provider: "mock", builtPrompt: "p", error: null });
    expect(got.current).toMatchObject({ version: 0, kind: "GENERATED", storageObjectId: obj.id, width: 1080 });
    expect(got.current!.storageObject.url).toBe(obj.url);
    const o2 = await object(a);
    expect(await completeGenerate(id, { storageObjectId: o2.id, width: 1, height: 1, provider: "x", builtPrompt: "y" })).toBeNull();
    expect(await prisma.visualVersion.count({ where: { visualId: id } })).toBe(1);
  });

  it("failVisual refunds exactly once even when called twice", async () => {
    const a = await account("l4");
    const { visual } = await createVisualWithDebit(visualInput(a, "f1"), now);
    await startOp(visual.id, "generate");
    expect(await failVisual(visual.id, "Image generation is unavailable right now.", { refund: true })).toBe(true);
    expect(await failVisual(visual.id, "again", { refund: true })).toBe(false);
    expect((await getCredits(a.teamId, now)).balance).toBe(30);
    const got = (await getVisual(a.profileId, visual.id))!.visual;
    expect(got).toMatchObject({ status: "FAILED", activeOp: null, error: "Image generation is unavailable right now." });
    expect(await prisma.creditLedger.count({ where: { visualId: visual.id, reason: "REFUND" } })).toBe(1);
  });

  it("failVisual without refund leaves the balance; a failed visual can't be failed after completion", async () => {
    const a = await account("l5");
    const { visual } = await createVisualWithDebit(visualInput(a, "f2"), now);
    await failVisual(visual.id, "nope", { refund: false });
    expect((await getCredits(a.teamId, now)).balance).toBe(29);
    const done = await completed(a, "f3");
    expect(await failVisual(done.id, "late", { refund: true })).toBe(false);
    expect((await getCredits(a.teamId, now)).balance).toBe(28);
  });

  it("a failed generation frees the post for a new one", async () => {
    const a = await account("l6");
    const doc = await newDocument(a.profileId);
    const { visual } = await createVisualWithDebit(visualInput(a, "g1", { documentId: doc.id }), now);
    await failVisual(visual.id, "x", { refund: true });
    await createVisualWithDebit(visualInput(a, "g2", { documentId: doc.id }), now);
  });
});

describe("edits", () => {
  it("edit cap: the 6th edit throws edit_limit; revert stays allowed", async () => {
    const a = await account("e1");
    const { id } = await completed(a, "e1");
    for (let i = 1; i <= 5; i++) expect(await doEdit(a, id, i)).toBe(i);
    expect((await getVisual(a.profileId, id))!.visual).toMatchObject({ editCount: 5, currentVersion: 5 });
    await expect(beginEdit(a.profileId, id)).rejects.toMatchObject({ code: "edit_limit" });
    const reverted = await revertVisual(a.profileId, id, 0);
    expect(reverted.version).toBe(6);
    expect((await getVisual(a.profileId, id))!.visual.editCount).toBe(5);
  });

  it("only one operation at a time: edit during generation and a second edit both fail with in_progress", async () => {
    const a = await account("e2");
    const gen = await createVisualWithDebit(visualInput(a, "e2"), now);
    await expect(beginEdit(a.profileId, gen.visual.id)).rejects.toMatchObject({ code: "in_progress" });
    const { id } = await completed(a, "e2b");
    await beginEdit(a.profileId, id);
    await expect(beginEdit(a.profileId, id)).rejects.toMatchObject({ code: "in_progress" });
    await expect(revertVisual(a.profileId, id, 0)).rejects.toMatchObject({ code: "in_progress" });
  });

  it("two edits started at once: exactly one wins", async () => {
    const a = await account("e3");
    const { id } = await completed(a, "e3");
    const r = await Promise.allSettled([beginEdit(a.profileId, id), beginEdit(a.profileId, id)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("edit failure keeps the current version and leaves editCount unchanged", async () => {
    const a = await account("e4");
    const { id } = await completed(a, "e4");
    await beginEdit(a.profileId, id);
    await startOp(id, "edit");
    expect(await failEdit(id, "The edit didn't work. Try again.")).toBe(true);
    const got = (await getVisual(a.profileId, id))!;
    expect(got.visual).toMatchObject({ status: "COMPLETED", activeOp: null, editCount: 0, currentVersion: 0, error: "The edit didn't work. Try again." });
    expect(await failEdit(id, "again")).toBe(false);
    await beginEdit(a.profileId, id); // can edit again, and the old error clears
    expect((await getVisual(a.profileId, id))!.visual.error).toBeNull();
  });

  it("a logo counts as an edit and is recorded as a LOGO version", async () => {
    const a = await account("e5");
    const { id } = await completed(a, "e5");
    await beginEdit(a.profileId, id, "logo");
    expect((await getVisual(a.profileId, id))!.visual.activeOp).toBe("logo");
    expect(await startOp(id, "logo")).not.toBeNull();
    const o = await object(a);
    expect(await completeEdit(id, { storageObjectId: o.id, editPrompt: null, kind: "LOGO", width: 1080, height: 1350 })).toBe(1);
    expect((await listVersions(a.profileId, id)).map((v) => v.kind)).toEqual(["GENERATED", "LOGO"]);
    expect((await getVisual(a.profileId, id))!.visual.editCount).toBe(1);
  });

  it("another profile can't edit, revert or read a visual", async () => {
    const a = await account("e6");
    const p2 = await secondProfile(a);
    const { id } = await completed(a, "e6");
    expect(await getVisual(p2.profileId, id)).toBeNull();
    await expect(beginEdit(p2.profileId, id)).rejects.toMatchObject({ code: "not_found" });
    await expect(revertVisual(p2.profileId, id, 0)).rejects.toMatchObject({ code: "not_found" });
    expect(await listVersions(p2.profileId, id)).toEqual([]);
  });

  it("a visual that is still generating or failed can't be edited", async () => {
    const a = await account("e7");
    const failed = await createVisualWithDebit(visualInput(a, "e7"), now);
    await failVisual(failed.visual.id, "x", { refund: true });
    await expect(beginEdit(a.profileId, failed.visual.id)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("revert and versions", () => {
  it("revert to v0 after two edits creates v3 = REVERT with v0's object", async () => {
    const a = await account("r1");
    const { id, obj } = await completed(a, "r1");
    await doEdit(a, id, 1);
    await doEdit(a, id, 2);
    const reverted = await revertVisual(a.profileId, id, 0);
    expect(reverted.version).toBe(3);
    const got = (await getVisual(a.profileId, id))!;
    expect(got.visual).toMatchObject({ currentVersion: 3, editCount: 2, status: "COMPLETED", activeOp: null });
    expect(got.current).toMatchObject({ version: 3, kind: "REVERT", storageObjectId: obj.id });
    const versions = await listVersions(a.profileId, id);
    expect(versions.map((v) => [v.version, v.kind])).toEqual([[0, "GENERATED"], [1, "EDIT"], [2, "EDIT"], [3, "REVERT"]]);
    expect(versions[1]!.editPrompt).toBe("edit 1");
    expect(versions[3]!.storageObject.url).toBe(obj.url);
  });

  it("revert refuses an unknown version and the current one", async () => {
    const a = await account("r2");
    const { id } = await completed(a, "r2");
    await expect(revertVisual(a.profileId, id, 9)).rejects.toMatchObject({ code: "invalid" });
    await expect(revertVisual(a.profileId, id, 0)).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("reads", () => {
  it("getActiveForDocument returns the running op for the post", async () => {
    const a = await account("q1");
    const doc = await newDocument(a.profileId);
    expect(await getActiveForDocument(a.profileId, doc.id)).toBeNull();
    const { visual } = await createVisualWithDebit(visualInput(a, "q1", { documentId: doc.id }), now);
    expect((await getActiveForDocument(a.profileId, doc.id))?.id).toBe(visual.id);
    const p2 = await secondProfile(a);
    expect(await getActiveForDocument(p2.profileId, doc.id)).toBeNull();
    await failVisual(visual.id, "x", { refund: true });
    expect(await getActiveForDocument(a.profileId, doc.id)).toBeNull();
  });

  it("listVisuals is newest first, paginates by cursor, filters by post, and is profile-scoped", async () => {
    const a = await account("q2");
    const doc = await newDocument(a.profileId, "Pricing post");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const { visual } = await createVisualWithDebit(visualInput(a, `lv${i}`, i === 4 ? { documentId: doc.id } : {}), now);
      ids.push(visual.id);
      await new Promise((r) => setTimeout(r, 15));
    }
    const page1 = await listVisuals(a.profileId, { limit: 2 });
    expect(page1.items.map((v) => v.id)).toEqual([ids[4], ids[3]]);
    expect(page1.items[0]!.document?.title).toBe("Pricing post");
    const page2 = await listVisuals(a.profileId, { limit: 2, cursor: page1.nextCursor! });
    expect(page2.items.map((v) => v.id)).toEqual([ids[2], ids[1]]);
    const page3 = await listVisuals(a.profileId, { limit: 2, cursor: page2.nextCursor! });
    expect(page3.items.map((v) => v.id)).toEqual([ids[0]]);
    expect(page3.nextCursor).toBeNull();
    expect((await listVisuals(a.profileId, { documentId: doc.id })).items.map((v) => v.id)).toEqual([ids[4]]);
    const p2 = await secondProfile(a);
    expect((await listVisuals(p2.profileId, {})).items).toEqual([]);
  });

  it("another team can't see credits of this team (credits are keyed by team)", async () => {
    const a = await account("q3");
    const b = await account("q4");
    await createVisualWithDebit(visualInput(a, "t"), now);
    expect((await getCredits(b.teamId, now)).balance).toBe(30);
  });
});
