/**
 * Manual live smoke test for hook options. NOT run by any test suite: ONE real `generate` call (plus at most one refill)
 * on a throwaway smoke profile in the test database, deleted afterwards.
 *
 *   pnpm --filter @brandloop/agent smoke:hooks
 *
 * Prints each hook's purpose, size and the gates that skipped purposes. Never prints the key.
 */
import "@brandloop/db/use-test-db";
import { assertTestDatabase } from "@brandloop/db/test-db";
import { createAiClient, resolveModel } from "@brandloop/ai";
import { ensureAccount, prisma } from "@brandloop/db";
import type { TurnContext } from "../src/context";
import { generateHooksRun, type HooksOutput } from "../src/tools/hooks";

const CLERK_ID = "user_test_smoke_hooks";
const TEAM_SUFFIX = " (smoke)";

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
  const acc = await ensureAccount({ clerkId: CLERK_ID, email: "smoke-hooks@example.test", firstName: "Smoke", teamNameSuffix: TEAM_SUFFIX });
  const ctx = {
    profileId: acc.currentProfile!.id,
    userId: acc.user.id,
    chatId: "00000000-0000-4000-8000-0000000000aa",
    ai: createAiClient(),
    embedder: null,
    selections: { knowledgeIds: [], writingStyleId: null, webSearchEnabled: false, quickLinkKey: null },
  } as unknown as TurnContext;
  let failed = false;
  try {
    const t0 = Date.now();
    const out = await generateHooksRun(ctx, { topic: "Hiring your first engineer as a founder", draftBody: null, count: 5, excludeHooks: [] });
    console.log(`model ${resolveModel("generate")}; ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (typeof out === "string") throw new Error(out);
    for (const h of (out as HooksOutput).hooks) console.log(`${h.index}. [${h.purpose}] ${h.charCount} chars, ${h.mobileLines} line(s): ${h.text}`);
    console.log(`distinct purposes: ${new Set(out.hooks.map((h) => h.purpose)).size}; skipped: ${out.skipped.map((s) => `${s.purpose} (${s.reason})`).join(", ")}`);
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
