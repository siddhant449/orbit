/**
 * Manual live smoke test for one chat turn. NOT run by any test suite: it makes ONE real orchestrator
 * turn (a few cents at most) on a throwaway smoke profile, then deletes that profile.
 *
 *   pnpm --filter @brandloop/agent smoke:chat
 *
 * Reads OPENAI_API_KEY at runtime (the script loads the repo .env) and prints only tool names, the reply
 * length and the model id, never the key. No title call, no web search, no embeddings (keyword search only).
 */
import "@brandloop/db/use-test-db";
import { assertTestDatabase } from "@brandloop/db/test-db";
import { createAiClient, getModel, resolveModel } from "@brandloop/ai";
import { ensureAccount, getChat, listMessages, prisma, upsertMemory } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { createRunRegistry } from "../src/registry";
import { runChatTurn } from "../src/turn";

const CLERK_ID = "user_test_smoke_chat";
const TEAM_SUFFIX = " (smoke)";
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

async function removeSmokeUser() {
  await assertTestDatabase(prisma);
  await prisma.team.deleteMany({
    where: { name: { endsWith: TEAM_SUFFIX }, memberships: { some: { user: { clerkId: CLERK_ID } } } },
  });
  await prisma.user.deleteMany({ where: { clerkId: CLERK_ID } });
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set; nothing to smoke test.");
    process.exit(1);
  }
  await removeSmokeUser();
  const acc = await ensureAccount({
    clerkId: CLERK_ID,
    email: "smoke-chat@example.test",
    firstName: "Smoke",
    teamNameSuffix: TEAM_SUFFIX,
  });
  const profileId = acc.currentProfile!.id;
  const chatId = randomUUID();
  let failed = false;
  try {
    await upsertMemory(profileId, "identity/about", "- Runs a small design studio in Pune", "USER");
    const res = await runChatTurn(
      {
        model: getModel("generate"),
        ai: createAiClient(),
        embedder: null,
        registry: createRunRegistry(),
        after: () => {},
        webSearchTool: null,
      },
      { userId: acc.user.id, profileId },
      {
        id: chatId,
        runId: randomUUID(),
        message: {
          id: randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "What do you remember about me?" }],
          metadata: { createdAt: new Date().toISOString() },
        },
        selectedKnowledgeBaseIds: [],
        selectedWritingStyleId: null,
        selectedFormatId: null,
        webSearchEnabled: false,
      },
    );
    console.log(`status: ${res.status}`);
    await res.text();
    for (let i = 0; i < 50 && (await getChat(profileId, chatId))?.activeRunId; i++) await new Promise((r) => setTimeout(r, 100));

    const reply = (await listMessages(profileId, chatId)).find((m) => m.role === "assistant");
    const parts = (reply?.parts ?? []) as { type: string; text?: string; state?: string }[];
    const tools = parts.filter((p) => p.type.startsWith("tool-")).map((p) => `${p.type.slice(5)}(${p.state})`);
    const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    const ctx = (reply?.context ?? {}) as { modelId?: string; finish?: string };
    console.log(`tools in order: ${tools.join(" -> ") || "(none)"}`);
    console.log(`reply length: ${text.length} chars`);
    console.log(`finish: ${ctx.finish}; model: ${ctx.modelId} (configured ${resolveModel("generate")})`);
    failed = res.status !== 200 || ctx.finish !== "stop" || !tools.some((t) => /^(viewMemory|readMemory)\(/.test(t));
    if (failed) console.error("FAILED: expected a finished turn that read memory.");
  } catch (err) {
    failed = true;
    console.error(`FAILED -> ${redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}`);
  } finally {
    await removeSmokeUser();
    const left = await prisma.chat.count({ where: { id: chatId } });
    console.log(`cleanup: smoke user removed, chat rows left: ${left}`);
    await prisma.$disconnect();
  }
  process.exit(failed ? 1 : 0);
}

void main();
