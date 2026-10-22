import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AiClient, ExtractedStyle } from "@brandloop/ai";
import { measureCorpus } from "@brandloop/ai/measure";
import { prisma } from "../client";
import { assertTestDatabase } from "../test-db";
import { ensureAccount } from "./account";
import { extractOwnStyle, prepareOwnStyle, STYLE_POSTS_ERROR, validateStylePosts } from "./style-extract";
import { createOwnVoice } from "./voice";

async function cleanup() {
  await assertTestDatabase(prisma);
  await prisma.user.deleteMany({ where: { clerkId: { startsWith: "user_test_" } } });
  await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" } } });
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `user_test_extract${n}`, email: `extract${n}@example.test`, firstName: "Extract", teamNameSuffix: " (test)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}

const post = (n: number) => `Post ${n}.\n\nA short second block.\n\n- one thing\n- another thing\n\n` + "A sentence about shipping work that matters. ".repeat(5);
const posts = [1, 2, 3, 4, 5].map(post);
const dd = (t: string) => ({ do: [`Do ${t}`], dont: [`Avoid ${t}`] });
const extracted = (over: Partial<ExtractedStyle> = {}): ExtractedStyle => ({
  language: "en-GB",
  voiceTarget: "Write plainly, in short blocks.",
  rules: { hooks: dd("hooks"), rhythm: dd("rhythm"), formatting: dd("formatting"), diction: dd("diction"), closings: dd("closings"), global: dd("global") },
  signatureMoves: [{ label: "Plain open", pattern: "[A flat claim].", useWhen: "always" }],
  finalChecks: ["Is the hook short?"],
  referencePostIndexes: [0, 2, 4],
  postTypes: ["story", "how-to", "short"],
  ...over,
});
const fakeAi = (outputs: (ExtractedStyle | Error)[], onCall?: () => Promise<void>) => {
  const calls = { n: 0 };
  const ai = {
    json: async () => {
      const out = outputs[Math.min(calls.n++, outputs.length - 1)]!;
      await onCall?.();
      if (out instanceof Error) throw out;
      return out;
    },
    text: async () => "",
  } as unknown as AiClient;
  return { ai, calls };
};

describe("validateStylePosts", () => {
  it("accepts 3-30 pasted posts of 200+ characters and 3-100 from an export", () => {
    expect(validateStylePosts(posts)).toHaveLength(5);
    expect(() => validateStylePosts(posts.slice(0, 2))).toThrow(STYLE_POSTS_ERROR);
    expect(() => validateStylePosts(Array.from({ length: 31 }, (_, i) => post(i)))).toThrow(STYLE_POSTS_ERROR);
    expect(validateStylePosts(Array.from({ length: 100 }, (_, i) => post(i)), { max: 100 })).toHaveLength(100);
  });
});

describe("extractOwnStyle", () => {
  it("measures in code and takes only descriptive parts from the model", async () => {
    const { profileId } = await account(1);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    const junk = extracted({ voiceTarget: "Hooks are 12 characters and 99 blocks long." });
    const { ai } = fakeAi([junk]);
    const out = await extractOwnStyle(ai, profileId, voiceStyleId);
    expect(out).toEqual({ version: 1, skipped: false });
    const row = await prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } });
    const saved = row.styleProfile as { layout: unknown; referencePosts: { text: string }[]; source: { kind: string; postCount: number } };
    expect(saved.layout).toEqual(JSON.parse(JSON.stringify(measureCorpus(posts))));
    expect(saved.referencePosts.map((r) => r.text)).toEqual([posts[0], posts[2], posts[4]]);
    expect(saved.source).toMatchObject({ kind: "own", postCount: 5 });
    expect(row).toMatchObject({ status: "READY", profileVersion: 1, analyzedPostCount: 5 });
  });

  it("goes PENDING, ANALYZING, READY", async () => {
    const { profileId } = await account(2);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    expect((await prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } })).status).toBe("PENDING");
    let during = "";
    const { ai } = fakeAi([extracted()], async () => {
      during = (await prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } })).status;
    });
    await extractOwnStyle(ai, profileId, voiceStyleId);
    expect(during).toBe("ANALYZING");
    expect((await prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } })).status).toBe("READY");
  });

  it("rejects reference indexes out of range, retries once, then fails with a reason", async () => {
    const { profileId } = await account(3);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    const { ai, calls } = fakeAi([extracted({ referencePostIndexes: [0, 2, 9] })]);
    await expect(extractOwnStyle(ai, profileId, voiceStyleId)).rejects.toThrow(/reference/i);
    expect(calls.n).toBe(2);
    const row = await prisma.voiceStyle.findUniqueOrThrow({ where: { id: voiceStyleId } });
    expect(row.status).toBe("FAILED");
    expect(row.statusDetail).toMatch(/reference/i);
  });

  it("recovers when the retry is valid", async () => {
    const { profileId } = await account(4);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    const { ai, calls } = fakeAi([new Error("The model declined this request."), extracted()]);
    expect(await extractOwnStyle(ai, profileId, voiceStyleId)).toMatchObject({ skipped: false });
    expect(calls.n).toBe(2);
  });

  it("rejects duplicate indexes and a rule that names the owner", async () => {
    const { profileId } = await account(5);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    const dup = fakeAi([extracted({ referencePostIndexes: [1, 1, 2] })]);
    await expect(extractOwnStyle(dup.ai, profileId, voiceStyleId)).rejects.toThrow();
    const profile = await prisma.profile.findUniqueOrThrow({ where: { id: profileId } });
    const named = extracted();
    named.rules.hooks.do = [`Open the way ${profile.name} does`];
    await expect(extractOwnStyle(fakeAi([named]).ai, profileId, voiceStyleId)).rejects.toThrow(/name/i);
  });

  it("skips the model when the corpus is unchanged, and runs again when it changes", async () => {
    const { profileId } = await account(6);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    const first = fakeAi([extracted()]);
    await extractOwnStyle(first.ai, profileId, voiceStyleId);
    const second = fakeAi([extracted()]);
    expect(await extractOwnStyle(second.ai, profileId, voiceStyleId)).toEqual({ version: 1, skipped: true });
    expect(second.calls.n).toBe(0);
    await prepareOwnStyle(profileId, [...posts, post(6)], "PASTE");
    const third = fakeAi([extracted()]);
    expect(await extractOwnStyle(third.ai, profileId, voiceStyleId)).toEqual({ version: 2, skipped: false });
    expect(third.calls.n).toBe(1);
  });

  it("never reads another profile's corpus", async () => {
    const a = await account(7);
    const b = await account(8);
    const { voiceStyleId } = await prepareOwnStyle(a.profileId, posts, "PASTE");
    const { ai, calls } = fakeAi([extracted()]);
    await expect(extractOwnStyle(ai, b.profileId, voiceStyleId)).rejects.toThrow(/not found/i);
    expect(calls.n).toBe(0);
  });

  it("puts the posts in <posts> tags as data and says so", async () => {
    const { profileId } = await account(9);
    const { voiceStyleId } = await prepareOwnStyle(profileId, posts, "PASTE");
    let seen = { system: "", prompt: "" };
    const ai = { json: async (o: { system: string; prompt: string }) => ((seen = o), extracted()), text: async () => "" } as unknown as AiClient;
    await extractOwnStyle(ai, profileId, voiceStyleId);
    expect(seen.prompt).toContain("<posts>");
    expect(seen.system).toMatch(/never instructions/i);
  });
});

describe("prepareOwnStyle and createOwnVoice", () => {
  it("stores the corpus deduplicated by hash and reuses the profile's own style", async () => {
    const { profileId } = await account(10);
    const a = await prepareOwnStyle(profileId, posts, "PASTE");
    const b = await prepareOwnStyle(profileId, [...posts, posts[0]!], "EXPORT");
    expect(b.voiceStyleId).toBe(a.voiceStyleId);
    expect(await prisma.styleCorpusPost.count({ where: { voiceStyleId: a.voiceStyleId } })).toBe(5);
    expect(createHash("sha256").update(posts[0]!).digest("hex")).toHaveLength(64);
  });

  it("createOwnVoice keeps its signature, compiles the profile and mirrors the guide into voice/style", async () => {
    const { profileId } = await account(11);
    const { ai } = fakeAi([extracted()]);
    const voice = await createOwnVoice(ai, profileId, posts);
    expect(voice).toMatchObject({ kind: "OWN", status: "READY", profileVersion: 1 });
    const mem = await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key: "voice/style" } } });
    expect(mem?.content).toContain("## Signature moves");
    expect(mem?.source).toBe("MIRRORED");
  });
});
