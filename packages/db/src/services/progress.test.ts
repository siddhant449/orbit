import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { ensureAccount } from "./account";
import { getOrCreateChat } from "./chat";
import { createDocumentForChat } from "./documents";
import { getProgressSignals } from "./progress";

// Scoped to this file's own users: the database is shared with other test runs.
const PREFIX = "user_test_progress";
const clerk = { clerkId: `${PREFIX}1`, email: "progress1@example.test", firstName: "Progress", teamNameSuffix: " (progress test)" };

async function cleanup() {
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: PREFIX } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(progress test)" } } });
}

let profileId: string;
let userId: string;

async function draft(title: string) {
  const chat = randomUUID();
  await getOrCreateChat(profileId, userId, chat);
  return createDocumentForChat(profileId, chat, { title, text: "Body" });
}

beforeEach(async () => {
  await cleanup();
  const s = await ensureAccount(clerk);
  profileId = s.currentProfile!.id;
  userId = s.user.id;
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("getProgressSignals", () => {
  it("is empty for a new profile", async () => {
    expect(await getProgressSignals(profileId, new Date(0))).toEqual({
      draftDates: [],
      draftTotal: 0,
      hasStrategy: false,
      knowledgeReady: 0,
      hasOwnVoice: false,
      hasIdentity: false,
    });
  });

  it("returns live draft dates since a date, the all-time total, and onboarding signals", async () => {
    const a = await draft("Old");
    await prisma.document.update({ where: { id: a.id }, data: { createdAt: new Date("2020-01-01T00:00:00Z") } });
    await draft("New");
    const gone = await draft("Deleted");
    await prisma.document.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });
    await prisma.strategy.create({ data: { profileId } });
    await prisma.voiceStyle.create({ data: { profileId, kind: "OWN", name: "Mine", samplePosts: [] } });
    await prisma.memoryDoc.create({ data: { profileId, key: "identity/about", content: "" } });
    expect((await getProgressSignals(profileId, new Date(0))).hasIdentity).toBe(false);
    await prisma.memoryDoc.updateMany({ where: { profileId, key: "identity/about" }, data: { content: "- Runs a design studio" } });

    const s = await getProgressSignals(profileId, new Date("2025-01-01T00:00:00Z"));
    expect(s.draftDates).toHaveLength(1);
    expect(s.draftTotal).toBe(2);
    expect(s.hasStrategy).toBe(true);
    expect(s.hasOwnVoice).toBe(true);
    expect(s.knowledgeReady).toBe(0);
    expect(s.hasIdentity).toBe(true);
  });

  it("counts only a voice learned from the writer's own posts", async () => {
    await prisma.voiceStyle.create({ data: { profileId, kind: "URL", name: "Link", samplePosts: [] } });
    expect((await getProgressSignals(profileId, new Date(0))).hasOwnVoice).toBe(false);
  });
});
