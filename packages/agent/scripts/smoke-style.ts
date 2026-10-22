/**
 * Manual live smoke test for own-style extraction. NOT run by any test suite: ONE real `extract` call on six invented
 * posts, on a throwaway smoke profile in the test database, which is deleted afterwards.
 *
 *   pnpm --filter @brandloop/agent smoke:style
 *
 * Prints the measured layout targets, the rule counts and the model id; never the key.
 */
import "@brandloop/db/use-test-db";
import { assertTestDatabase } from "@brandloop/db/test-db";
import { createAiClient, resolveModel, StyleProfileSchema } from "@brandloop/ai";
import { ensureAccount, extractOwnStyle, getStyleProfile, prepareOwnStyle, prisma } from "@brandloop/db";

const CLERK_ID = "user_test_smoke_style";
const TEAM_SUFFIX = " (smoke)";

const POSTS = [
  "We lost our biggest client on a Tuesday.\n\nI spent the evening reading their last six emails and found the problem on email two: we had stopped answering the small questions.\n\nNow every question gets a reply within the hour, even if the reply is \"I'll check.\"\n\nSmall answers keep big accounts.",
  "I rewrote our pricing page three times.\n\nVersion one listed features. Version two listed benefits. Version three listed one sentence per plan, in the words customers had used on calls.\n\nSigned trials went up by a third. The words were never ours to invent.\n\nListen first, then write.",
  "Three questions I ask before taking on a new project:\n\n1. Who decides?\n2. What does done look like?\n3. What happens if we stop halfway?\n\nIf the client cannot answer all three, we are not ready to start. That is not rudeness. It is the cheapest scoping meeting there is.",
  "A founder asked me how to hire her first designer.\n\nI told her to pay for a one-week trial project and to watch how the person asks questions.\n\nThe portfolio shows the best day. The first week shows the average one.\n\nHire on averages.",
  "Our studio has no Monday meeting.\n\nWe write three lines on Friday: shipped, stuck, next.\n\nThe stuck list is read by whoever can help, usually within an hour. Meetings ask for attention. Notes ask for decisions.\n\nTry it for a month.",
  "I raised my day rate by 40% last spring.\n\nTwo clients left. Five new ones arrived within a quarter, and they argued less about scope.\n\nPrice is a filter before it is a number.\n\nWho are you filtering for?",
];

async function removeSmokeUser() {
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({ where: { name: { endsWith: TEAM_SUFFIX }, memberships: { some: { user: { clerkId: CLERK_ID } } } } });
  await prisma.user.deleteMany({ where: { clerkId: CLERK_ID } });
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set; nothing to smoke test.");
    process.exit(1);
  }
  await removeSmokeUser();
  const acc = await ensureAccount({ clerkId: CLERK_ID, email: "smoke-style@example.test", firstName: "Smoke", teamNameSuffix: TEAM_SUFFIX });
  const profileId = acc.currentProfile!.id;
  let failed = false;
  try {
    const { voiceStyleId } = await prepareOwnStyle(profileId, POSTS, "PASTE");
    const t0 = Date.now();
    const out = await extractOwnStyle(createAiClient(), profileId, voiceStyleId);
    const got = await getStyleProfile(profileId, voiceStyleId);
    const p = StyleProfileSchema.parse(got!.profile);
    console.log(`model ${resolveModel("extract")}; ${((Date.now() - t0) / 1000).toFixed(1)} s; version ${out.version}`);
    console.log(`language ${p.language}; voiceTarget ${p.voiceTarget.length} chars`);
    console.log(`rules: ${Object.entries(p.rules).map(([k, v]) => `${k} ${v.do.length}/${v.dont.length}`).join(", ")}; moves ${p.signatureMoves.length}; checks ${p.finalChecks.length}; references ${p.referencePosts.map((r) => r.postType).join(",")}`);
    console.log(`layout: hook ${JSON.stringify(p.layout.hookChars)}; post ${JSON.stringify(p.layout.postChars)}; blocks ${JSON.stringify(p.layout.blocks)}; lists ${JSON.stringify(p.layout.listPosts)}; endings ${JSON.stringify(p.layout.endings)}`);
  } catch (err) {
    failed = true;
    console.error(`FAILED -> ${(err instanceof Error ? err.message : String(err)).replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***")}`);
  } finally {
    await removeSmokeUser();
    await prisma.$disconnect();
  }
  process.exit(failed ? 1 : 0);
}

void main();
