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

import { getCredits, getVisual, listVersions, prisma, setLogo } from "@brandloop/db";
import { mockImageProvider, ProviderError, type ImageProvider } from "@brandloop/visuals";
import sharp from "sharp";
import { idleJobs } from "@/lib/jobs";
import { storeFile } from "@/lib/storage";
import { createVisualHandler, getVisualHandler } from "./handlers";
import { editHandler, logoHandler, revertHandler, versionsHandler } from "./edit-handlers";
import { installVisualsEnv, makeAccount, secondProfile, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vedit";
let a: TestAccount;
let b: TestAccount;
let cleanup: () => Promise<void>;
const as = (x: TestAccount) => void (env.account = { user: { id: x.userId }, currentProfile: { id: x.profileId, teamId: x.teamId } });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (payload?: unknown, method = "POST") => new Request("http://t/x", { method, body: payload === undefined ? undefined : JSON.stringify(payload) });

async function make() {
  const res = await createVisualHandler(req({ source: "library", prompt: "Three habits", visualType: "INFOGRAPHIC", useBrandColours: false, requestId: crypto.randomUUID() }));
  const id = (await res.json()).visual.id as string;
  await idleJobs();
  return id;
}
const edit = (id: string, prompt = "Make the headline bigger") => editHandler(req({ prompt, requestId: crypto.randomUUID() }), ctx(id));
const state = async (id: string) => (await (await getVisualHandler(req(undefined, "GET"), ctx(id))).json());

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
  await prisma.brandTheme.deleteMany({ where: { profileId: a.profileId } });
  cleanup = await installVisualsEnv();
});
afterEach(async () => {
  await idleJobs();
  await cleanup();
});

describe("POST /api/visuals/:id/edit", () => {
  it("202 then the job adds an EDIT version with the rewritten instruction; edits are free", async () => {
    const id = await make();
    const res = await edit(id);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ id, status: "PROCESSING", activeOp: "edit", imageUrl: expect.any(String), remainingEdits: 5 });
    await idleJobs();
    const s = await state(id);
    expect(s).toMatchObject({ status: "COMPLETED", activeOp: null, currentVersion: 1, editCount: 1, remainingEdits: 4, error: null });
    const versions = await (await versionsHandler(req(undefined, "GET"), ctx(id))).json();
    expect(versions.versions.map((v: { version: number; kind: string }) => [v.version, v.kind])).toEqual([[0, "GENERATED"], [1, "EDIT"]]);
    expect(versions.versions[1]).toMatchObject({ editPrompt: "Make the headline bigger", imageUrl: expect.any(String), createdAt: expect.any(String) });
    expect(versions.versions[1].imageUrl).not.toBe(versions.versions[0].imageUrl);
    expect((await getCredits(a.teamId)).balance).toBe(29); // only the generation cost a credit
  });

  it("the model rewrite is used when an AI client exists (extract model), and the raw words otherwise", async () => {
    await cleanup();
    const ai = { text: vi.fn(async () => "Increase the headline size."), json: vi.fn() };
    cleanup = await installVisualsEnv(mockImageProvider(), { ai: ai as never });
    // the classifier also runs on the instruction: let it allow
    ai.json.mockResolvedValue({ allowed: true, category: null, reason: null });
    const id = await make();
    await edit(id);
    await idleJobs();
    expect(ai.text).toHaveBeenCalledTimes(1);
    expect((await listVersions(a.profileId, id))[1]!.editPrompt).toBe("Increase the headline size.");
  });

  it("refuses an unsafe instruction (422) before any op starts", async () => {
    const id = await make();
    const res = await edit(id, "Add the Nike logo and a photo of Elon Musk");
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "refused" });
    expect((await state(id)).activeOp).toBeNull();
  });

  it("409 visual_in_progress while another op runs; versions stay linear", async () => {
    await cleanup();
    cleanup = await installVisualsEnv(mockImageProvider({ delayMs: 200 }));
    const id = await make();
    expect((await edit(id)).status).toBe(202);
    const second = await edit(id, "Make it blue");
    expect(second.status).toBe(409);
    expect((await second.json()).code).toBe("visual_in_progress");
    expect((await revertHandler(req({ version: 0 }), ctx(id))).status).toBe(409);
    await idleJobs();
    expect((await listVersions(a.profileId, id)).map((v) => v.version)).toEqual([0, 1]);
  });

  it("a failed edit keeps the current version and doesn't consume an edit", async () => {
    await cleanup();
    const refusing: ImageProvider = { ...mockImageProvider(), edit: async () => { throw new ProviderError("refused", false); } };
    cleanup = await installVisualsEnv(refusing);
    const id = await make();
    await edit(id);
    await idleJobs();
    const s = await state(id);
    expect(s).toMatchObject({ status: "COMPLETED", activeOp: null, currentVersion: 0, editCount: 0, remainingEdits: 5 });
    expect(s.error).toMatch(/declined/i);
    expect((await listVersions(a.profileId, id)).length).toBe(1);
  });

  it("the 5th edit is OK and the 6th returns 409 edit_limit", async () => {
    const id = await make();
    for (let i = 1; i <= 5; i++) {
      expect((await edit(id, `Change number ${i}`)).status).toBe(202);
      await idleJobs();
    }
    expect((await state(id)).remainingEdits).toBe(0);
    const sixth = await edit(id, "One more");
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).code).toBe("edit_limit");
  });

  it("404 for another profile's visual, 400 for a bad body", async () => {
    const id = await make();
    expect((await editHandler(req({ prompt: "", requestId: "abcdefgh" }), ctx(id))).status).toBe(400);
    as(b);
    expect((await edit(id)).status).toBe(404);
    expect((await versionsHandler(req(undefined, "GET"), ctx(id))).status).toBe(404);
    expect((await revertHandler(req({ version: 0 }), ctx(id))).status).toBe(404);
    expect((await logoHandler(req({}), ctx(id))).status).toBe(404);
  });
});

describe("revert", () => {
  it("revert to v0 after two edits creates v3 = REVERT with v0's object, and imageUrl equals v0's", async () => {
    const id = await make();
    await edit(id, "First change");
    await idleJobs();
    await edit(id, "Second change");
    await idleJobs();
    const res = await revertHandler(req({ version: 0 }), ctx(id));
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({ id, currentVersion: 3, editCount: 2, status: "COMPLETED" });
    const versions = (await (await versionsHandler(req(undefined, "GET"), ctx(id))).json()).versions;
    expect(versions[3]).toMatchObject({ version: 3, kind: "REVERT" });
    expect(out.imageUrl).toBe(versions[0].imageUrl);
    expect((await revertHandler(req({ version: 3 }), ctx(id))).status).toBe(422); // already current
    expect((await revertHandler(req({ version: 99 }), ctx(id))).status).toBe(422);
    expect((await revertHandler(req({ version: "x" }), ctx(id))).status).toBe(400);
  });
});

describe("logo", () => {
  async function addLogo() {
    const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: "#ff0000" } }).png().toBuffer();
    const stored = await storeFile(a.profileId, a.teamId, "LOGO", png, "image/png");
    await setLogo(a.profileId, stored.id);
  }

  it("409 no_logo without a theme logo, and nothing starts", async () => {
    const id = await make();
    const res = await logoHandler(req({}), ctx(id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("no_logo");
    expect((await state(id)).activeOp).toBeNull();
  });

  it("composites the logo at 92/92/8 as a LOGO version inside the image, counts as an edit", async () => {
    await addLogo();
    const id = await make();
    const res = await logoHandler(req({}), ctx(id));
    expect(res.status).toBe(202);
    await idleJobs();
    const s = await state(id);
    expect(s).toMatchObject({ currentVersion: 1, editCount: 1, activeOp: null, error: null });
    const versions = await listVersions(a.profileId, id);
    expect(versions[1]).toMatchObject({ kind: "LOGO", width: 1080, height: 1350 });
    // pixel check: red logo bbox is inside the image near the bottom-right corner
    const bytes = (await (await import("@/lib/storage")).readFile(a.profileId, versions[1]!.storageObjectId))!.bytes;
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x1 = -1, y1 = -1, x0 = info.width, y0 = info.height;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    }
    expect(x1).toBeLessThanOrEqual(info.width - 1);
    expect(y1).toBeLessThanOrEqual(info.height - 1);
    expect(x1 - x0 + 1).toBe(86);
    expect(x0).toBeGreaterThan(900);
    expect(y0).toBeGreaterThan(1200);
  });

  it("accepts a custom placement, rejects nonsense, and the logo op respects the op lock and edit cap", async () => {
    await addLogo();
    const id = await make();
    expect((await logoHandler(req({ x: "left" }), ctx(id))).status).toBe(400);
    expect((await logoHandler(req({ x: 10, y: 10, sizePercent: 12 }), ctx(id))).status).toBe(202);
    expect((await logoHandler(req({}), ctx(id))).status).toBe(409);
    await idleJobs();
    expect((await getVisual(a.profileId, id))!.visual.editCount).toBe(1);
  });
});

describe("cross-profile", () => {
  it("a second profile on the team cannot edit", async () => {
    const id = await make();
    as(await secondProfile(a));
    expect((await edit(id)).status).toBe(404);
  });
});
