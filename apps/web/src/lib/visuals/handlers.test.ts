import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string; teamId: string } | null; team: { id: string } } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { getCredits, getTheme, prisma, saveTheme, setDecision } from "@brandloop/db";
import { mockImageProvider } from "@brandloop/visuals";
import { idleJobs } from "@/lib/jobs";
import {
  createVisualHandler, creditsHandler, deleteVisualHandler, getActiveHandler, getVisualHandler, listVisualsHandler, patchVisualHandler,
} from "./handlers";
import { installVisualsEnv, makeAccount, newPost, secondProfile, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vroute";
let a: TestAccount;
let b: TestAccount;
let cleanup: () => Promise<void>;

const as = (x: TestAccount) => void (env.account = { user: { id: x.userId }, team: { id: x.teamId }, currentProfile: { id: x.profileId, teamId: x.teamId } });
const body = (over: Record<string, unknown> = {}) => ({
  source: "library", prompt: "Three habits as a numbered list", visualType: "INFOGRAPHIC", aspect: "PORTRAIT_4_5", useBrandColours: false, requestId: crypto.randomUUID(), ...over,
});
const post = (payload: unknown) => createVisualHandler(new Request("http://test/api/visuals", { method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload) }));
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const get = (id: string) => getVisualHandler(new Request("http://test/x"), ctx(id));

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
  await prisma.creditAccount.upsert({ where: { teamId: a.teamId }, create: { teamId: a.teamId, balance: 30 }, update: { balance: 30, periodStartedAt: new Date() } });
  await prisma.visual.deleteMany({ where: { teamId: a.teamId } });
  await prisma.creditLedger.deleteMany({ where: { teamId: a.teamId } });
  await prisma.brandTheme.deleteMany({ where: { profileId: a.profileId } });
  cleanup = await installVisualsEnv();
});
afterEach(async () => {
  await idleJobs();
  await cleanup();
});

describe("POST /api/visuals", () => {
  it("returns 202 with the pending visual and the balance, then the job completes it and GET shows the image", async () => {
    const res = await post(body());
    expect(res.status).toBe(202);
    const out = await res.json();
    expect(out.balance).toBe(29);
    expect(out.visual).toMatchObject({ status: "PENDING", imageUrl: null, currentVersion: 0, editCount: 0, maxEdits: 5, remainingEdits: 5, aspect: "PORTRAIT_4_5", type: "INFOGRAPHIC", documentId: null });
    await idleJobs();
    const done = await (await get(out.visual.id)).json();
    expect(done).toMatchObject({ status: "COMPLETED", error: null });
    expect(done.imageUrl).toMatch(/^\/api\/files\/public\/p\/.+\/visual\//);
    expect((await getCredits(a.teamId)).balance).toBe(29);
  });

  it("402 out_of_credits when the balance is 0, without calling the provider", async () => {
    const gen = vi.fn();
    await cleanup();
    cleanup = await installVisualsEnv({ id: "spy", generate: gen, edit: gen });
    await prisma.creditAccount.update({ where: { teamId: a.teamId }, data: { balance: 0 } });
    const res = await post(body());
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ code: "out_of_credits", balance: 0, refillsAt: expect.any(String) });
    await idleJobs();
    expect(gen).not.toHaveBeenCalled();
  });

  it("409 needs_brand_confirmation with a proposal, then accept, then re-POST gives 202", async () => {
    const first = await post(body({ useBrandColours: true }));
    expect(first.status).toBe(409);
    const j = await first.json();
    expect(j).toMatchObject({ code: "needs_brand_confirmation", proposal: { accent: "#4F5FF5", decision: "NONE" } });
    expect((await getCredits(a.teamId)).balance).toBe(30);
    await setDecision(a.profileId, true, j.proposal);
    expect((await post(body({ useBrandColours: true }))).status).toBe(202);
    // skipping also unblocks, and useBrandColours:false never asks
    await prisma.brandTheme.deleteMany({ where: { profileId: a.profileId } });
    expect((await post(body({ useBrandColours: false }))).status).toBe(202);
    await idleJobs(); // at most two images may be in flight per team
    await setDecision(a.profileId, false);
    expect((await post(body({ useBrandColours: true }))).status).toBe(202);
  });

  it("422 refused for a real-person prompt, with the balance unchanged and the provider not called", async () => {
    const gen = vi.fn();
    await cleanup();
    cleanup = await installVisualsEnv({ id: "spy", generate: gen, edit: gen });
    const res = await post(body({ prompt: "A photorealistic portrait of Barack Obama giving a speech" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "refused", category: "real_person", error: expect.stringMatching(/real, identifiable people/) });
    await idleJobs();
    expect(gen).not.toHaveBeenCalled();
    expect((await getCredits(a.teamId)).balance).toBe(30);
    expect(await prisma.visual.count({ where: { teamId: a.teamId } })).toBe(0);
  });

  it("refuses every other unsafe category before any credit is spent", async () => {
    const cases: [string, string][] = [
      ["A fake screenshot of a tweet from our CEO", "deceptive"],
      ["Put the Nike logo on the shirt", "trademark"],
      ["A nude figure on a beach", "sexual"],
      ["Graphic gore with a severed head", "violent"],
      ["A swastika flag", "hateful"],
    ];
    for (const [prompt, category] of cases) {
      const res = await post(body({ prompt }));
      expect(res.status, prompt).toBe(422);
      expect((await res.json()).category).toBe(category);
    }
    // custom instructions are screened too
    expect((await post(body({ customInstructions: "make it look like Elon Musk, photo of Elon Musk" }))).status).toBe(422);
    expect((await getCredits(a.teamId)).balance).toBe(30);
  });

  it("the classifier runs before the debit and can refuse what the blocklist misses", async () => {
    await cleanup();
    const ai = { json: vi.fn(async () => ({ allowed: false, category: "real_person", reason: "x" })), text: vi.fn() };
    cleanup = await installVisualsEnv(mockImageProvider(), { ai: ai as never });
    const res = await post(body({ prompt: "A group portrait of the current G7 leaders" }));
    expect(res.status).toBe(422);
    expect(ai.json).toHaveBeenCalledTimes(1);
    expect((await getCredits(a.teamId)).balance).toBe(30);
  });

  it("409 visual_in_progress for a second generate on the same post, no debit", async () => {
    const doc = await newPost(a.profileId);
    expect((await post(body({ source: "post", documentId: doc.id }))).status).toBe(202);
    const res = await post(body({ source: "post", documentId: doc.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("visual_in_progress");
    expect((await getCredits(a.teamId)).balance).toBe(29);
  });

  it("the same requestId gives the same id and one debit", async () => {
    const requestId = crypto.randomUUID();
    const one = await (await post(body({ requestId }))).json();
    const two = await post(body({ requestId }));
    expect(two.status).toBe(202);
    expect((await two.json()).visual.id).toBe(one.visual.id);
    await idleJobs();
    expect((await getCredits(a.teamId)).balance).toBe(29);
    expect(await prisma.visual.count({ where: { teamId: a.teamId } })).toBe(1);
  });

  it("422 post_required when source is post and the post is missing, deleted or another profile's", async () => {
    expect((await post(body({ source: "post" }))).status).toBe(422);
    expect((await post(body({ source: "post", documentId: "nope" }))).status).toBe(422);
    const theirs = await newPost(b.profileId);
    const res = await post(body({ source: "post", documentId: theirs.id }));
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe("post_required");
    const gone = await newPost(a.profileId);
    await prisma.document.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    expect((await post(body({ source: "post", documentId: gone.id }))).status).toBe(422);
    expect((await getCredits(a.teamId)).balance).toBe(30);
  });

  it("400 for a malformed body or no profile, and 503 when disabled", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(body({ visualType: "WALLPAPER" }))).status).toBe(400);
    expect((await post(body({ requestId: "" }))).status).toBe(400);
    expect((await post(body({ prompt: "" }))).status).toBe(400);
    expect((await post(body({ prompt: "x".repeat(2001) }))).status).toBe(400);
    env.account = { user: { id: a.userId }, team: { id: a.teamId }, currentProfile: null };
    expect((await post(body())).status).toBe(400);
    as(a);
    vi.stubEnv("VISUALS_ENABLED", "0");
    const off = await post(body());
    expect(off.status).toBe(503);
    expect((await off.json()).code).toBe("visuals_disabled");
  });
});

describe("GET routes and cross-profile access", () => {
  it("another profile's visual is 404 for GET, PATCH and DELETE; the library is profile-scoped", async () => {
    const created = await (await post(body())).json();
    await idleJobs();
    as(b);
    expect((await get(created.visual.id)).status).toBe(404);
    expect((await patchVisualHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify({ altText: "x" }) }), ctx(created.visual.id))).status).toBe(404);
    expect((await deleteVisualHandler(new Request("http://t", { method: "DELETE" }), ctx(created.visual.id))).status).toBe(404);
    expect((await (await listVisualsHandler(new Request("http://t/api/visuals"))).json()).items).toEqual([]);
    as(a);
    expect((await get(created.visual.id)).status).toBe(200);
  });

  it("a second profile on the same team can't read it either, but shares the credits", async () => {
    const created = await (await post(body())).json();
    await idleJobs();
    const p2 = await secondProfile(a);
    as(p2);
    expect((await get(created.visual.id)).status).toBe(404);
    expect((await (await creditsHandler()).json()).balance).toBe(29);
  });

  it("GET /api/visuals/active resumes a running generation for the post, and is empty otherwise", async () => {
    const doc = await newPost(a.profileId);
    await cleanup();
    cleanup = await installVisualsEnv(mockImageProvider({ delayMs: 300 }));
    const created = await (await post(body({ source: "post", documentId: doc.id }))).json();
    const active = await (await getActiveHandler(new Request(`http://t/api/visuals/active?documentId=${doc.id}`))).json();
    expect(active).toMatchObject({ active: true, isEdit: false, visual: { id: created.visual.id } });
    await idleJobs();
    expect(await (await getActiveHandler(new Request(`http://t/api/visuals/active?documentId=${doc.id}`))).json()).toMatchObject({ active: false, visual: null });
    expect((await getActiveHandler(new Request("http://t/api/visuals/active"))).status).toBe(400);
  });

  it("GET /api/visuals lists newest first with the post title and paginates", async () => {
    const doc = await newPost(a.profileId);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await (await post(body(i === 2 ? { source: "post", documentId: doc.id } : {}))).json()).visual.id);
      await idleJobs();
      await new Promise((r) => setTimeout(r, 15));
    }
    const page1 = await (await listVisualsHandler(new Request("http://t/api/visuals?limit=2"))).json();
    expect(page1.items.map((v: { id: string }) => v.id)).toEqual([ids[2], ids[1]]);
    expect(page1.items[0]).toMatchObject({ documentTitle: "Hiring post", status: "COMPLETED" });
    expect(page1.items[0].imageUrl).toBeTruthy();
    const page2 = await (await listVisualsHandler(new Request(`http://t/api/visuals?limit=2&cursor=${page1.nextCursor}`))).json();
    expect(page2.items.map((v: { id: string }) => v.id)).toEqual([ids[0]]);
    expect(page2.nextCursor).toBeNull();
  });

  it("GET /api/credits refills lazily", async () => {
    await prisma.creditAccount.update({ where: { teamId: a.teamId }, data: { balance: 2, periodStartedAt: new Date(Date.now() - 31 * 86_400_000) } });
    const c = await (await creditsHandler()).json();
    expect(c).toMatchObject({ balance: 30, monthlyAllocation: 30, hasAddon: false });
    expect(new Date(c.refillsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("PATCH sets alt text (up to 1,000) and DELETE soft-deletes", async () => {
    const created = await (await post(body())).json();
    await idleJobs();
    const patch = (payload: unknown) => patchVisualHandler(new Request("http://t", { method: "PATCH", body: JSON.stringify(payload) }), ctx(created.visual.id));
    const ok = await patch({ altText: "A numbered list of three habits" });
    expect(ok.status).toBe(200);
    expect((await ok.json()).altText).toBe("A numbered list of three habits");
    expect((await patch({ altText: "x".repeat(1001) })).status).toBe(400);
    expect((await deleteVisualHandler(new Request("http://t", { method: "DELETE" }), ctx(created.visual.id))).status).toBe(204);
    expect((await get(created.visual.id)).status).toBe(404);
    expect((await deleteVisualHandler(new Request("http://t", { method: "DELETE" }), ctx(created.visual.id))).status).toBe(404);
  });

  it("the default theme read does not create a row", async () => {
    expect((await getTheme(a.profileId)).decision).toBe("NONE");
    await saveTheme(a.profileId, await getTheme(a.profileId), "manual");
    expect((await getTheme(a.profileId)).decision).toBe("CONFIRMED");
  });
});
