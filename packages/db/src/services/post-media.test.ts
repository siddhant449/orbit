import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { attachVisual, detachVisual, freezeMedia, listMedia, POST_MEDIA_MAX, PostMediaError } from "./post-media";
import { beginEdit, completeEdit, completeGenerate, createVisualWithDebit, deleteVisual, revertVisual, startOp } from "./visuals";
import { account, cleanupVisualTests, newDocument, object, secondProfile, visualInput, type TestAccount } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

const now = new Date();
let n = 0;
async function completed(a: TestAccount) {
  n += 1;
  const { visual } = await createVisualWithDebit(visualInput(a, `pm${Date.now()}${n}`), now);
  await startOp(visual.id, "generate");
  const obj = await object(a);
  await completeGenerate(visual.id, { storageObjectId: obj.id, width: 1080, height: 1350, provider: "mock", builtPrompt: "p" });
  return { id: visual.id, obj };
}
async function edit(a: TestAccount, id: string) {
  await beginEdit(a.profileId, id);
  await startOp(id, "edit");
  const obj = await object(a);
  await completeEdit(id, { storageObjectId: obj.id, editPrompt: "x", kind: "EDIT", width: 1080, height: 1350 });
  return obj;
}

describe("attach and detach", () => {
  it("attach creates a PostMedia with the current object and the visual's alt text; attaching again is idempotent", async () => {
    const a = await account("m1");
    const doc = await newDocument(a.profileId);
    const v = await completed(a);
    await prisma.visual.update({ where: { id: v.id }, data: { altText: "A chart" } });
    const m = await attachVisual(a.profileId, v.id, doc.id);
    expect(m).toMatchObject({ documentId: doc.id, visualId: v.id, storageObjectId: v.obj.id, kind: "IMAGE", position: 0, altText: "A chart", frozenAt: null });
    expect((await attachVisual(a.profileId, v.id, doc.id)).id).toBe(m.id);
    expect(await listMedia(a.profileId, doc.id)).toHaveLength(1);
  });

  it("detach removes it; another profile's visual or post is not found", async () => {
    const a = await account("m2");
    const p2 = await secondProfile(a);
    const doc = await newDocument(a.profileId);
    const v = await completed(a);
    await expect(attachVisual(p2.profileId, v.id, doc.id)).rejects.toMatchObject({ code: "not_found" });
    const otherDoc = await newDocument(p2.profileId);
    await expect(attachVisual(a.profileId, v.id, otherDoc.id)).rejects.toMatchObject({ code: "not_found" });
    await attachVisual(a.profileId, v.id, doc.id);
    expect(await detachVisual(p2.profileId, v.id, doc.id)).toBe(false);
    expect(await detachVisual(a.profileId, v.id, doc.id)).toBe(true);
    expect(await detachVisual(a.profileId, v.id, doc.id)).toBe(false);
    expect(await listMedia(a.profileId, doc.id)).toEqual([]);
  });

  it("only a completed, idle visual can be attached", async () => {
    const a = await account("m3");
    const doc = await newDocument(a.profileId);
    const { visual } = await createVisualWithDebit(visualInput(a, `pm-pending-${Date.now()}`), now);
    await expect(attachVisual(a.profileId, visual.id, doc.id)).rejects.toMatchObject({ code: "not_ready" });
  });

  it("attaching a 21st image gives a limit error", async () => {
    const a = await account("m4");
    const doc = await newDocument(a.profileId);
    const o = await object(a);
    await prisma.postMedia.createMany({
      data: Array.from({ length: POST_MEDIA_MAX }, (_, i) => ({ documentId: doc.id, kind: "IMAGE" as const, position: i, storageObjectId: o.id })),
    });
    const v = await completed(a);
    const err = await attachVisual(a.profileId, v.id, doc.id).catch((e) => e);
    expect(err).toBeInstanceOf(PostMediaError);
    expect(err.code).toBe("limit");
  });

  it("positions follow attach order", async () => {
    const a = await account("m5");
    const doc = await newDocument(a.profileId);
    const one = await completed(a);
    const two = await completed(a);
    await attachVisual(a.profileId, one.id, doc.id);
    await attachVisual(a.profileId, two.id, doc.id);
    expect((await listMedia(a.profileId, doc.id)).map((m) => [m.visualId, m.position])).toEqual([[one.id, 0], [two.id, 1]]);
  });
});

describe("a draft's media follows the visual's current version", () => {
  it("an edit after attach moves the draft's PostMedia to the new object and clears the LinkedIn asset", async () => {
    const a = await account("f1");
    const doc = await newDocument(a.profileId);
    const v = await completed(a);
    await attachVisual(a.profileId, v.id, doc.id);
    await prisma.postMedia.updateMany({ where: { visualId: v.id }, data: { linkedinAssetUrn: "urn:li:image:abc" } });
    const next = await edit(a, v.id);
    const [m] = await listMedia(a.profileId, doc.id);
    expect(m).toMatchObject({ storageObjectId: next.id, linkedinAssetUrn: null });
  });

  it("a revert moves it back to the earlier object", async () => {
    const a = await account("f2");
    const doc = await newDocument(a.profileId);
    const v = await completed(a);
    await attachVisual(a.profileId, v.id, doc.id);
    await edit(a, v.id);
    await revertVisual(a.profileId, v.id, 0);
    expect((await listMedia(a.profileId, doc.id))[0]!.storageObjectId).toBe(v.obj.id);
  });

  it("a frozen (published) post's media stays on the old object", async () => {
    const a = await account("f3");
    const draft = await newDocument(a.profileId);
    const published = await newDocument(a.profileId, "Published");
    const v = await completed(a);
    await attachVisual(a.profileId, v.id, draft.id);
    await attachVisual(a.profileId, v.id, published.id);
    expect(await freezeMedia(published.id)).toBe(1);
    const next = await edit(a, v.id);
    expect((await listMedia(a.profileId, draft.id))[0]!.storageObjectId).toBe(next.id);
    expect((await listMedia(a.profileId, published.id))[0]!).toMatchObject({ storageObjectId: v.obj.id });
    await revertVisual(a.profileId, v.id, 0);
    expect((await listMedia(a.profileId, published.id))[0]!.storageObjectId).toBe(v.obj.id);
    // a frozen row can't be detached either
    expect(await detachVisual(a.profileId, v.id, published.id)).toBe(false);
  });

  it("deleting the visual detaches it from drafts only", async () => {
    const a = await account("f4");
    const draft = await newDocument(a.profileId);
    const published = await newDocument(a.profileId, "Published");
    const v = await completed(a);
    await attachVisual(a.profileId, v.id, draft.id);
    await attachVisual(a.profileId, v.id, published.id);
    await freezeMedia(published.id);
    expect(await deleteVisual(a.profileId, v.id)).toBe(true);
    expect(await listMedia(a.profileId, draft.id)).toEqual([]);
    expect(await listMedia(a.profileId, published.id)).toHaveLength(1);
  });
});
