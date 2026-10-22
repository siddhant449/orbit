import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return {};
});
void env;

import { createVisualWithDebit, getCredits, getVisual, listVersions, prisma, saveTheme, startOp } from "@brandloop/db";
import { mockImageProvider, ProviderError, type ImageProvider } from "@brandloop/visuals";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { handleVisualJob } from "./handle-visual-job";
import { getVisualDeps } from "./deps";
import { TransientJobError } from "@brandloop/jobs";
import { installVisualsEnv, makeAccount, newPost, wipe, type TestAccount } from "./test-helpers";

const PREFIX = "vtest_vjob";
let a: TestAccount;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  await wipe(PREFIX);
  a = await makeAccount(PREFIX, 1);
});
afterAll(async () => {
  await wipe(PREFIX);
});
afterEach(async () => {
  await cleanup?.();
});

let n = 0;
async function create(over: Record<string, unknown> = {}) {
  n += 1;
  const { visual } = await createVisualWithDebit(
    { profileId: a.profileId, teamId: a.teamId, userId: a.userId, requestId: `job-${Date.now()}-${n}`, type: "INFOGRAPHIC", aspect: "PORTRAIT_4_5", userPrompt: "Three habits as a list", useBrandColours: false, ...over },
    new Date(),
  );
  return visual;
}
const ctx = (attempt = 1) => ({ attempt, maxAttempts: 3 });
const balance = async () => (await getCredits(a.teamId)).balance;

beforeEach(async () => {
  await prisma.creditAccount.upsert({ where: { teamId: a.teamId }, create: { teamId: a.teamId, balance: 30 }, update: { balance: 30, periodStartedAt: new Date() } });
  await prisma.creditLedger.deleteMany({ where: { teamId: a.teamId } });
});

describe("handleVisualJob: generate", () => {
  it("success gives v0 as a cropped PNG in the public store, COMPLETED, and the credit stays debited", async () => {
    cleanup = await installVisualsEnv();
    const post = await newPost(a.profileId);
    const v = await create({ documentId: post.id });
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("ok");
    const got = (await getVisual(a.profileId, v.id))!;
    expect(got.visual).toMatchObject({ status: "COMPLETED", activeOp: null, provider: "mock", error: null });
    expect(got.visual.builtPrompt).toContain("Hiring is a product problem.");
    expect(got.current).toMatchObject({ version: 0, kind: "GENERATED", width: 1080, height: 1350 });
    expect(got.current!.storageObject).toMatchObject({ store: "PUBLIC", kind: "VISUAL", contentType: "image/png" });
    expect(got.current!.storageObject.url).toMatch(/^\/api\/files\/public\/p\//);
    expect(await balance()).toBe(29);
  });

  it("uses the profile's brand colours in the prompt only when asked", async () => {
    cleanup = await installVisualsEnv();
    await saveTheme(a.profileId, { background: "#010203", accent: "#A1B2C3", headline: "#111111", bodyText: "#222222", caption: "#333333", line: "#444444", bar: "#555555", highlightBar: "#666666" }, "manual");
    const on = await create({ useBrandColours: true });
    const off = await create({ useBrandColours: false });
    await handleVisualJob(getVisualDeps(), { visualId: on.id, op: "generate" }, ctx());
    await handleVisualJob(getVisualDeps(), { visualId: off.id, op: "generate" }, ctx());
    expect((await getVisual(a.profileId, on.id))!.visual.builtPrompt).toContain("#A1B2C3");
    expect((await getVisual(a.profileId, off.id))!.visual.builtPrompt).not.toContain("#A1B2C3");
    await prisma.brandTheme.deleteMany({ where: { profileId: a.profileId } });
  });

  it("provider refused gives FAILED, a refund, and the balance back to 30", async () => {
    cleanup = await installVisualsEnv(mockImageProvider({ fail: "refused" }));
    const v = await create();
    expect(await balance()).toBe(29);
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("failed");
    const got = (await getVisual(a.profileId, v.id))!.visual;
    expect(got).toMatchObject({ status: "FAILED", activeOp: null, error: "This image request was declined. Try a different description." });
    expect(await balance()).toBe(30);
    expect(await prisma.creditLedger.count({ where: { visualId: v.id, reason: "REFUND" } })).toBe(1);
  });

  it("verification_required and unavailable fail with the unavailable copy and refund", async () => {
    for (const code of ["verification_required", "unavailable"] as const) {
      const fail: ImageProvider = { id: "x", generate: async () => { throw new ProviderError(code, false); }, edit: async () => { throw new ProviderError(code, false); } };
      cleanup = await installVisualsEnv(fail);
      const v = await create();
      await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx());
      expect((await getVisual(a.profileId, v.id))!.visual).toMatchObject({ status: "FAILED", error: "Image generation is unavailable right now. Your credit was returned." });
      expect(await balance()).toBe(30);
      await cleanup();
    }
  });

  it("a timeout aborts the provider signal and refunds", async () => {
    let signal: AbortSignal | undefined;
    const slow: ImageProvider = {
      id: "slow",
      generate: (o) => new Promise((_res, rej) => { signal = o.abortSignal; o.abortSignal?.addEventListener("abort", () => rej(new ProviderError("timeout", false))); }),
      edit: async () => { throw new Error("n/a"); },
    };
    cleanup = await installVisualsEnv(slow, { timeoutMs: 30 });
    const v = await create();
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("failed");
    expect(signal?.aborted).toBe(true);
    expect((await getVisual(a.profileId, v.id))!.visual).toMatchObject({ status: "FAILED", error: expect.stringMatching(/credit was returned/) });
    expect(await balance()).toBe(30);
  });

  it("a duplicate delivery after COMPLETED is ignored, with one version and one provider call", async () => {
    const inner = mockImageProvider();
    const gen = vi.fn(inner.generate);
    cleanup = await installVisualsEnv({ ...inner, generate: gen });
    const v = await create();
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("ok");
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("ignored");
    expect(gen).toHaveBeenCalledTimes(1);
    expect(await listVersions(a.profileId, v.id)).toHaveLength(1);
  });

  it("a concurrent duplicate delivery runs the provider once", async () => {
    const inner = mockImageProvider({ delayMs: 50 });
    const gen = vi.fn(inner.generate);
    cleanup = await installVisualsEnv({ ...inner, generate: gen });
    const v = await create();
    const [x, y] = await Promise.all([
      handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx()),
      handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx()),
    ]);
    expect([x, y].sort()).toEqual(["ignored", "ok"]);
    expect(gen).toHaveBeenCalledTimes(1);
  });

  it("a retryable error twice then success gives one debit and no refund", async () => {
    cleanup = await installVisualsEnv(mockImageProvider({ fail: "unavailable", failTimes: 2 }));
    const v = await create();
    await expect(handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(1))).rejects.toBeInstanceOf(TransientJobError);
    expect((await getVisual(a.profileId, v.id))!.visual).toMatchObject({ status: "PENDING", activeOp: "generate" });
    await expect(handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(2))).rejects.toBeInstanceOf(TransientJobError);
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(3))).toBe("ok");
    expect(await balance()).toBe(29);
    expect(await prisma.creditLedger.count({ where: { visualId: v.id, reason: "REFUND" } })).toBe(0);
  });

  it("a retryable error on the final attempt fails the visual and refunds", async () => {
    cleanup = await installVisualsEnv(mockImageProvider({ fail: "unavailable" }));
    const v = await create();
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(3))).toBe("failed");
    expect((await getVisual(a.profileId, v.id))!.visual.status).toBe("FAILED");
    expect(await balance()).toBe(30);
  });

  it("a storage failure is treated as transient, then fails with a refund on the last attempt", async () => {
    cleanup = await installVisualsEnv(mockImageProvider());
    const v = await create({ documentId: undefined });
    // Break the blob store by pointing the root at a file path that can't be a directory.
    const blocker = join(tmpdir(), `vis-blocker-${Date.now()}`);
    await writeFile(blocker, "a file, not a directory");
    vi.stubEnv("STORAGE_LOCAL_ROOT", join(blocker, "sub"));
    (await import("@/lib/storage")).resetStoresForTest();
    await expect(handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(1))).rejects.toBeInstanceOf(TransientJobError);
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx(3))).toBe("failed");
    expect(await balance()).toBe(30);
  });

  it("ignores a visual that doesn't exist, a deleted one, and an unknown op", async () => {
    cleanup = await installVisualsEnv();
    expect(await handleVisualJob(getVisualDeps(), { visualId: "nope", op: "generate" }, ctx())).toBe("ignored");
    const v = await create();
    await prisma.visual.update({ where: { id: v.id }, data: { deletedAt: new Date() } });
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("ignored");
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "bogus" as never }, ctx())).toBe("ignored");
  });

  it("the output is exactly the cropped size even if the provider returns another size", async () => {
    const odd: ImageProvider = {
      id: "odd",
      generate: async () => ({ image: { bytes: await sharp({ create: { width: 640, height: 480, channels: 3, background: "#fff" } }).png().toBuffer(), mediaType: "image/png" } }),
      edit: async () => { throw new Error("n/a"); },
    };
    cleanup = await installVisualsEnv(odd);
    const v = await create({ aspect: "SQUARE" });
    await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx());
    expect((await getVisual(a.profileId, v.id))!.current).toMatchObject({ width: 1080, height: 1080 });
  });

  it("startOp is not called twice: a PROCESSING visual from another worker is ignored", async () => {
    cleanup = await installVisualsEnv();
    const v = await create();
    await startOp(v.id, "generate");
    expect(await handleVisualJob(getVisualDeps(), { visualId: v.id, op: "generate" }, ctx())).toBe("ignored");
  });
});
