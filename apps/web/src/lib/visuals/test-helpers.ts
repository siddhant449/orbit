// Shared fixtures for the visuals handler and route tests (real test database, temp-dir local blob store, mock provider).
import { assertTestDatabase } from "@brandloop/db/test-db";
import { ensureAccount, prisma } from "@brandloop/db";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import { mockImageProvider, type ImageProvider } from "@brandloop/visuals";
import { resetStoresForTest } from "@/lib/storage";
import { resetJobsForTest } from "@/lib/jobs";
import { setVisualDepsForTest, type VisualDeps } from "./deps";

export type TestAccount = { userId: string; profileId: string; teamId: string };

export async function wipe(prefix: string) {
  await assertTestDatabase(prisma);
  const users = { clerkId: { startsWith: prefix } };
  await prisma.team.deleteMany({ where: { memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

export async function makeAccount(prefix: string, n: number): Promise<TestAccount> {
  const acc = await ensureAccount({ clerkId: `${prefix}${n}`, email: `${prefix}${n}@example.test`, firstName: "Vis", teamNameSuffix: " (vishandlers)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id, teamId: acc.team.id };
}

export async function secondProfile(a: TestAccount): Promise<TestAccount> {
  const p = await prisma.profile.create({ data: { teamId: a.teamId, ownerUserId: a.userId, name: "Second" } });
  return { ...a, profileId: p.id };
}

export function newPost(profileId: string, text = "Hiring is a product problem.") {
  return prisma.document.create({
    data: { profileId, title: "Hiring post", versions: { create: { version: 1, text, source: "AI_CREATE" } } },
  });
}

/** Installs a temp local blob store, fast job retries and the given provider; returns a cleanup. */
export async function installVisualsEnv(provider: ImageProvider = mockImageProvider(), over: Partial<VisualDeps> = {}) {
  const root = await mkdtemp(join(tmpdir(), "vis-handlers-"));
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_ROOT", root);
  vi.stubEnv("JOBS_DRIVER", "local");
  vi.stubEnv("JOBS_RETRY_DELAY_MS", "0");
  vi.stubEnv("VISUALS_ENABLED", "1");
  resetStoresForTest();
  resetJobsForTest();
  setVisualDepsForTest({ provider, ai: null, quality: "low", timeoutMs: 5_000, loadReference: async () => null, log: () => {}, ...over });
  return async () => {
    setVisualDepsForTest(undefined);
    resetJobsForTest();
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  };
}
