import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { listMedia, prisma, freezeMedia } from "@brandloop/db";
import { idleJobs } from "@/lib/jobs";
import { attachHandler, detachHandler, listMediaHandler } from "./attach-handlers";
import { createVisualHandler, deleteVisualHandler, getVisualHandler, listVisualsHandler, patchVisualHandler } from "./handlers";
import { editHandler, revertHandler } from "./edit-handlers";
import { installVisualsEnv, makeAccount, newPost, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vattach";
let a: TestAccount;
let b: TestAccount;
let cleanup: () => Promise<void>;
const as = (x: TestAccount) => void (env.account = { user: { id: x.userId }, currentProfile: { id: x.profileId, teamId: x.teamId } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (payload?: unknown, method = "POST", url = "http://t/x") => new Request(url, { method, body: payload === undefined ? undefined : JSON.stringify(payload) });
const attach = (id: string, documentId: string) => attachHandler(req({ documentId }), ctx(id));

async function make(documentId?: string) {
  const res = await createVisualHandler(req({ source: documentId ? "post" : "library", documentId, prompt: "Three habits", visualType: "INFOGRAPHIC", useBrandColours: false, requestId: crypto.randomUUID() }));
  const id = (await res.json()).visual.id as string;
  await idleJobs();
  return id;
}

beforeAll(async () => {
  await wipe(PREFIX);
  a = await makeAccount(PREFIX, 1);
  b = await makeAccount(PREFIX, 2);
});
afterAll(async () => {
  await wipe(PREFIX);
});
beforeEach(async () => {
  as(a);
  await prisma.visual.deleteMany({ where: { teamId: a.teamId } });
  await prisma.creditAccount.upsert({ where: { teamId: a.teamId }, create: { teamId: a.teamId, balance: 30 }, update: { balance: 30, periodStartedAt: new Date() } });
  cleanup = await installVisualsEnv();
});
afterEach(async () => {
  await idleJobs();
  await cleanup();
});

describe("attach, detach and drafts following edits", () => {
  it("attach puts the current image on the post; an edit then a revert move the draft's media; reload persists", async () => {
    const doc = await newPost(a.profileId);
    const id = await make(doc.id);
    const first = await (await getVisualHandler(req(undefined, "GET"), ctx(id))).json();
    const res = await attach(id, doc.id);
    expect(res.status).toBe(200);
    expect((await res.json()).media).toMatchObject({ documentId: doc.id, visualId: id, position: 0, frozen: false });

    await editHandler(req({ prompt: "Make the headline bigger", requestId: crypto.randomUUID() }), ctx(id));
    await idleJobs();
    const [afterEdit] = await listMedia(a.profileId, doc.id);
    const edited = await (await getVisualHandler(req(undefined, "GET"), ctx(id))).json();
    expect(edited.imageUrl).not.toBe(first.imageUrl);
    const obj = await prisma.storageObject.findUnique({ where: { id: afterEdit!.storageObjectId } });
    expect(obj?.url).toBe(edited.imageUrl);

    await revertHandler(req({ version: 0 }), ctx(id));
    const [afterRevert] = await listMedia(a.profileId, doc.id);
    expect((await prisma.storageObject.findUnique({ where: { id: afterRevert!.storageObjectId } }))?.url).toBe(first.imageUrl);
  });

  it("a published (frozen) post's media stays put while the library image is edited", async () => {
    const doc = await newPost(a.profileId);
    const id = await make();
    await attach(id, doc.id);
    await freezeMedia(doc.id);
    const [before] = await listMedia(a.profileId, doc.id);
    await editHandler(req({ prompt: "Change the colours", requestId: crypto.randomUUID() }), ctx(id));
    await idleJobs();
    expect((await listMedia(a.profileId, doc.id))[0]!.storageObjectId).toBe(before!.storageObjectId);
    // and it can't be detached
    expect((await detachHandler(req(undefined, "DELETE", `http://t/x?documentId=${doc.id}`), ctx(id))).status).toBe(404);
  });

  it("detach removes it from a draft; deleting the visual detaches it from drafts", async () => {
    const doc = await newPost(a.profileId);
    const one = await make();
    const two = await make();
    await attach(one, doc.id);
    await attach(two, doc.id);
    expect((await detachHandler(req(undefined, "DELETE", `http://t/x?documentId=${doc.id}`), ctx(one))).status).toBe(204);
    expect((await listMedia(a.profileId, doc.id)).map((m) => m.visualId)).toEqual([two]);
    expect((await deleteVisualHandler(req(undefined, "DELETE"), ctx(two))).status).toBe(204);
    expect(await listMedia(a.profileId, doc.id)).toEqual([]);
    expect((await detachHandler(req(undefined, "DELETE"), ctx(one))).status).toBe(400);
  });

  it("attaching a 21st image gives 422 media_limit", async () => {
    const doc = await newPost(a.profileId);
    const id = await make();
    const o = await prisma.storageObject.findFirstOrThrow({ where: { profileId: a.profileId, kind: "VISUAL" } });
    await prisma.postMedia.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ documentId: doc.id, kind: "IMAGE" as const, position: i, storageObjectId: o.id })) });
    const res = await attach(id, doc.id);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("media_limit");
  });

  it("a visual that is still generating can't be attached (409)", async () => {
    await cleanup();
    const { mockImageProvider } = await import("@brandloop/visuals");
    cleanup = await installVisualsEnv(mockImageProvider({ delayMs: 300 }));
    const doc = await newPost(a.profileId);
    const created = await (await createVisualHandler(req({ source: "library", prompt: "x list", visualType: "GENERAL", useBrandColours: false, requestId: crypto.randomUUID() }))).json();
    const res = await attach(created.visual.id, doc.id);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("visual_not_ready");
  });

  it("cross-profile: another profile can't attach my visual, or attach to my post", async () => {
    const doc = await newPost(a.profileId);
    const id = await make();
    as(b);
    expect((await attach(id, doc.id)).status).toBe(404);
    const theirs = await newPost(b.profileId);
    expect((await attach(id, theirs.id)).status).toBe(404);
    as(a);
    expect((await attach(id, theirs.id)).status).toBe(404);
    expect((await attachHandler(req({}), ctx(id))).status).toBe(400);
  });
});

describe("GET /api/documents/:id/media", () => {
  it("lists the attached media in order with URLs, 404s for another profile's post", async () => {
    const doc = await newPost(a.profileId);
    const one = await make();
    await attach(one, doc.id);
    const body = await (await listMediaHandler(req(undefined, "GET"), ctx(doc.id))).json();
    expect(body.media).toHaveLength(1);
    expect(body.media[0]).toMatchObject({ visualId: one, position: 0, width: 1080, height: 1350, contentType: "image/png", frozen: false });
    expect(body.media[0].url).toMatch(/^\/api\/files\/public\//);
    expect((await (await listMediaHandler(req(undefined, "GET"), ctx((await newPost(a.profileId)).id))).json()).media).toEqual([]);
    as(b);
    expect((await listMediaHandler(req(undefined, "GET"), ctx(doc.id))).status).toBe(404);
  });
});

describe("library and alt text", () => {
  it("the library lists newest first with the post title; alt text up to 1,000 persists and rides along on attach", async () => {
    const doc = await newPost(a.profileId);
    const id = await make(doc.id);
    expect((await patchVisualHandler(req({ altText: "A bar chart of signups" }, "PATCH"), ctx(id))).status).toBe(200);
    const list = await (await listVisualsHandler(new Request("http://t/api/visuals"))).json();
    expect(list.items[0]).toMatchObject({ id, documentTitle: "Hiring post", altText: "A bar chart of signups" });
    await attach(id, doc.id);
    expect((await listMedia(a.profileId, doc.id))[0]!.altText).toBe("A bar chart of signups");
    expect((await patchVisualHandler(req({ altText: "x".repeat(1001) }, "PATCH"), ctx(id))).status).toBe(400);
  });
});
