/**
 * Manual live smoke test: ingests one 120-word text item with real deps (one summary call, one embedding call).
 *   pnpm --filter @brandloop/knowledge smoke:ingest
 * Reads OPENAI_API_KEY at runtime; never prints it. Cleans up after itself.
 */
import "@brandloop/db/use-test-db";
import { assertTestDatabase } from "@brandloop/db/test-db";
import { createAiClient, createEmbedder } from "@brandloop/ai";
import { createKnowledge, deleteKnowledge, ensureAccount, getKnowledgeItem, prisma } from "@brandloop/db";
import { ingestKnowledge } from "../src/ingest";
import { localUploadStore } from "../src/upload-store";

const redact = (t: string) => t.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set; nothing to smoke test.");
    process.exit(1);
  }
  const acc = await ensureAccount({
    clerkId: "user_test_smoke",
    email: "smoke@example.test",
    firstName: "Smoke",
    teamNameSuffix: " (test)",
  });
  const profileId = acc.currentProfile!.id;
  const content =
    "Writing a short post every weekday taught me three things about building an audience. " +
    "First, consistency beats intensity: a small post every day compounds far faster than one heroic essay each month. " +
    "Second, specific beats general: readers remember the story about the failed pricing experiment, not the platitude about resilience. " +
    "Third, replies are the real analytics: when someone answers with their own story, you have learned what they care about. ".repeat(2) +
    "I keep a running list of ideas, draft in the morning, and edit once before publishing. The whole routine takes twenty minutes and has changed my business.";
  const item = await createKnowledge(profileId, { type: "TEXT", title: "Smoke: writing routine", content });
  const store = localUploadStore();
  try {
    await ingestKnowledge({ ai: createAiClient(), embedder: createEmbedder(), store }, item.id);
    const after = await getKnowledgeItem(item.id);
    const [row] = await prisma.$queryRaw<{ n: bigint; e: bigint }[]>`
      select count(*) n, count(embedding) e from "KnowledgeChunk" where "sourceId" = ${item.id}`;
    console.log({
      words: content.split(/\s+/).length,
      status: after?.status,
      summaryChars: after?.summary?.length ?? 0,
      chunks: Number(row?.n ?? 0),
      embedded: Number(row?.e ?? 0) > 0,
    });
  } catch (err) {
    console.error(redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    process.exitCode = 1;
  } finally {
    await deleteKnowledge(profileId, item.id, store).catch(() => undefined);
    await assertTestDatabase(prisma);
    await prisma.user.deleteMany({ where: { clerkId: "user_test_smoke" } });
    await prisma.team.deleteMany({ where: { name: { endsWith: "(test)" }, profiles: { none: {} } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}
void main();
