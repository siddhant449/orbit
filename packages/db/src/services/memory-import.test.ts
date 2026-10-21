import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiClient } from "@brandloop/ai";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { listMemory } from "./memory";
import { importMemories } from "./memory-import";
import { createJob, getJob, runJob } from "./jobs";

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

const fake = (result: unknown): AiClient =>
  ({ json: async () => result, text: async () => "" }) as unknown as AiClient;

async function profileId(n = 1) {
  const acc = await ensureAccount({
    clerkId: `user_test_job${n}`,
    email: `job${n}@example.test`,
    firstName: "Job",
    teamNameSuffix: " (test)",
  });
  return acc.currentProfile!.id;
}

describe("importMemories", () => {
  it("saves extracted facts as bullet lines", async () => {
    const pid = await profileId();
    const ai = fake({ facts: [{ key: "identity/personal", text: "Runs a design studio" }], refusal: false });
    expect(await importMemories(ai, pid, "I run a design studio")).toEqual({ saved: 1 });
    const docs = await listMemory(pid);
    expect(docs[0]?.content).toContain("- Runs a design studio");
    expect(docs[0]?.source).toBe("IMPORTED");
  });

  it("rejects model refusals disguised as facts and creates nothing", async () => {
    const pid = await profileId();
    const ai = fake({
      facts: [
        {
          key: "identity/about",
          text: "I appreciate you testing my system, but I notice the input contains only random characters",
        },
      ],
      refusal: false,
    });
    await expect(importMemories(ai, pid, "xx")).rejects.toThrow("Couldn't find facts to save");
    expect(await listMemory(pid)).toHaveLength(0);
  });

  it("throws when the model flags a refusal", async () => {
    const pid = await profileId();
    const ai = fake({ facts: [{ key: "identity/about", text: "Founder of a studio" }], refusal: true });
    await expect(importMemories(ai, pid, "x")).rejects.toThrow("Couldn't find facts to save");
  });

  it("drops short facts and unknown keys, and counts only new lines", async () => {
    const pid = await profileId();
    const ai = fake({
      facts: [
        { key: "identity/about", text: "short" },
        { key: "secrets/stuff", text: "Not an allowed key at all" },
        { key: "topics/design-systems", text: "Writes about design systems" },
        { key: "topics/design-systems", text: "Writes about design systems" },
      ],
      refusal: false,
    });
    expect(await importMemories(ai, pid, "x")).toEqual({ saved: 1 });
    expect((await listMemory(pid)).map((d) => d.key)).toEqual(["topics/design-systems"]);
  });
});

describe("jobs", () => {
  it("runs to DONE with output", async () => {
    const pid = await profileId();
    const job = await createJob(pid, "MEMORY_IMPORT", { a: 1 });
    expect(job.status).toBe("QUEUED");
    await runJob(job.id, async () => ({ saved: 2 }));
    const done = await getJob(pid, job.id);
    expect(done?.status).toBe("DONE");
    expect(done?.output).toEqual({ saved: 2 });
  });

  it("records FAILED with the error message", async () => {
    const pid = await profileId();
    const job = await createJob(pid, "MEMORY_IMPORT", {});
    await runJob(job.id, async () => {
      throw new Error("boom");
    });
    const failed = await getJob(pid, job.id);
    expect(failed?.status).toBe("FAILED");
    expect(failed?.error).toBe("boom");
  });

  it("does not expose a job to another profile", async () => {
    const a = await profileId(1);
    const b = await profileId(2);
    const job = await createJob(a, "MEMORY_IMPORT", {});
    expect(await getJob(b, job.id)).toBeNull();
  });
});
