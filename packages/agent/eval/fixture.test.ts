import { getSelectedVoice, getStrategy, hybridSearch, listMemory, prisma } from "@brandloop/db";
import { fakeEmbedder } from "@brandloop/ai/testing";
import { afterAll, describe, expect, it } from "vitest";
import { EVAL_FIXTURE, evalRowsLeft, removeEvalUser, seedEvalProfile, type EvalIdentity } from "./fixture";

/** Not the live eval's identity, so running these tests never deletes a live eval run's user. */
const identity: EvalIdentity = { clerkId: "user_test_eval_unit", email: "eval-unit@example.test", teamSuffix: " (eval-unit)" };

describe("eval fixture", () => {
  afterAll(async () => {
    await removeEvalUser(identity);
  });

  it("seeds identity, voice, rules, strategy, two searchable knowledge items and a selected writing style", async () => {
    const { profileId } = await seedEvalProfile({ identity });
    const keys = (await listMemory(profileId)).map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining(["identity/about", "identity/story", "identity/personal", "writing/rules", "voice/style", "strategy/themes"]),
    );
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    expect(profile.fullName).toBe(EVAL_FIXTURE.profile.fullName);
    expect(profile.jobTitle).toBe(EVAL_FIXTURE.profile.jobTitle);

    const strategy = await getStrategy(profileId);
    expect(strategy?.positioning).toBe(EVAL_FIXTURE.strategy.positioning);
    expect((strategy?.recurringSeries as unknown[]).length).toBeGreaterThanOrEqual(3);

    const items = await prisma.knowledgeItem.findMany({ where: { profileId } });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === "READY")).toBe(true);
    const hits = await hybridSearch(profileId, "proof of concept", { embedder: null, limit: 5 });
    expect(hits.length).toBeGreaterThan(0);

    const voice = await getSelectedVoice(profileId);
    expect(voice?.name).toBe(EVAL_FIXTURE.writingStyle.name);
  });

  it("embeds the knowledge chunks when given an embedder", async () => {
    const { profileId } = await seedEvalProfile({ embedder: fakeEmbedder(), identity });
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "KnowledgeChunk" WHERE "profileId" = ${profileId} AND embedding IS NOT NULL`;
    expect(Number(rows[0]!.n)).toBe(2);
  });

  it("seeding twice replaces the previous eval user instead of piling up", async () => {
    await seedEvalProfile({ identity });
    await seedEvalProfile({ identity });
    expect(await prisma.user.count({ where: { clerkId: identity.clerkId } })).toBe(1);
  });

  it("removeEvalUser also clears a memberless team left by an interrupted seed", async () => {
    await prisma.team.create({ data: { name: `Orphan${identity.teamSuffix}` } });
    await removeEvalUser(identity);
    expect(await prisma.team.count({ where: { name: { endsWith: identity.teamSuffix } } })).toBe(0);
  });

  it("removeEvalUser leaves no rows behind", async () => {
    const { profileId } = await seedEvalProfile({ identity });
    await removeEvalUser(identity);
    expect(await evalRowsLeft(profileId, identity)).toEqual({
      users: 0,
      teams: 0,
      profiles: 0,
      memoryDocs: 0,
      strategies: 0,
      voiceStyles: 0,
      knowledgeItems: 0,
      knowledgeChunks: 0,
      chats: 0,
      documents: 0,
    });
  });
});
