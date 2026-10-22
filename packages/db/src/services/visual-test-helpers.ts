// Test helpers for the visuals, credits and brand-theme service tests (not exported from the package).
import { prisma } from "../client";
import { assertTestDatabase } from "../test-db";
import { ensureAccount } from "./account";
import { recordObject } from "./storage-objects";
import type { CreateVisualInput } from "./visuals";

export const PREFIX = "vtest_vis";

export async function cleanupVisualTests() {
  await assertTestDatabase(prisma);
  const users = { clerkId: { startsWith: PREFIX } };
  await prisma.team.deleteMany({ where: { memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

export type TestAccount = { userId: string; profileId: string; teamId: string };

export async function account(tag: string): Promise<TestAccount> {
  const acc = await ensureAccount({ clerkId: `${PREFIX}_${tag}`, email: `${PREFIX}_${tag}@example.test`, firstName: "V", teamNameSuffix: " (vis)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id, teamId: acc.team.id };
}

export async function secondProfile(a: TestAccount): Promise<TestAccount> {
  const p = await prisma.profile.create({ data: { teamId: a.teamId, ownerUserId: a.userId, name: "Second" } });
  return { ...a, profileId: p.id };
}

export function newDocument(profileId: string, title = "A post") {
  return prisma.document.create({ data: { profileId, title } });
}

let n = 0;
export async function object(a: TestAccount, kind: "VISUAL" | "LOGO" | "REFERENCE" = "VISUAL") {
  n += 1;
  return recordObject({
    profileId: a.profileId,
    teamId: a.teamId,
    key: `p/${a.profileId}/${kind.toLowerCase()}/t${Date.now()}${n}.png`,
    store: kind === "REFERENCE" ? "PRIVATE" : "PUBLIC",
    kind,
    contentType: "image/png",
    bytes: 10,
    sha256: "cd".repeat(32),
    width: 1080,
    height: 1350,
    url: `https://blob.example/${kind}${n}.png`,
  });
}

export function visualInput(a: TestAccount, requestId: string, over: Partial<CreateVisualInput> = {}): CreateVisualInput {
  return {
    profileId: a.profileId,
    teamId: a.teamId,
    userId: a.userId,
    requestId,
    type: "INFOGRAPHIC",
    aspect: "PORTRAIT_4_5",
    userPrompt: "A simple infographic",
    useBrandColours: true,
    ...over,
  };
}

export function setBalance(teamId: string, balance: number, periodStartedAt = new Date()) {
  return prisma.creditAccount.upsert({
    where: { teamId },
    create: { teamId, balance, periodStartedAt },
    update: { balance, periodStartedAt },
  });
}
