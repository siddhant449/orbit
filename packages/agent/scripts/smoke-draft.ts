/**
 * Manual live smoke test for drafting a post. NOT run by any test suite: it makes ONE real chat turn
 * (the orchestrator plus one writing-specialist call) on a throwaway smoke profile, then deletes it.
 *
 *   pnpm --filter @brandloop/agent smoke:draft
 *
 * Reads OPENAI_API_KEY at runtime (the script loads the repo .env) and prints only tool names, the
 * document's title and length and the model id, never the key. No title call, no web search, no embeddings.
 */
import { createAiClient, getModel, resolveModel } from "@brandloop/ai";
import { ensureAccount, getChat, getChatDocument, listMessages, prisma, upsertMemory } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { createRunRegistry } from "../src/registry";
import { runChatTurn } from "../src/turn";

const CLERK_ID = "user_test_smoke_draft";
const TEAM_SUFFIX = " (smoke)";
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

async function removeSmokeUser() {
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
    email: "smoke-draft@example.test",
    firstName: "Smoke",
    teamNameSuffix: TEAM_SUFFIX,
  });
  const profileId = acc.currentProfile!.id;
  const chatId = randomUUID();
  let failed = false;
  try {
    await upsertMemory(profileId, "identity/about", "- Runs a small design studio in Pune\n- Writes for first-time founders", "USER");
    await upsertMemory(profileId, "writing/rules", "- Short paragraphs, one idea each\n- No hashtags", "USER");
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
          parts: [{ type: "text", text: "Draft a short LinkedIn post about why I prefer short paragraphs" }],
          metadata: { createdAt: new Date().toISOString() },
        },
        selectedKnowledgeBaseIds: [],
        selectedWritingStyleId: null,
        webSearchEnabled: false,
      },
    );
    console.log(`status: ${res.status}`);
    await res.text();
    for (let i = 0; i < 100 && (await getChat(profileId, chatId))?.activeRunId; i++) await new Promise((r) => setTimeout(r, 100));

    const reply = (await listMessages(profileId, chatId)).find((m) => m.role === "assistant");
    const parts = (reply?.parts ?? []) as { type: string; text?: string; state?: string }[];
    const tools = parts.filter((p) => p.type.startsWith("tool-")).map((p) => `${p.type.slice(5)}(${p.state})`);
    const text = parts.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
    const ctx = (reply?.context ?? {}) as { modelId?: string; finish?: string };
    const doc = await getChatDocument(profileId, chatId);
    console.log(`tools in order: ${tools.join(" -> ") || "(none)"}`);
    console.log(`document: ${doc ? `"${doc.title}", ${doc.text.length} chars, version ${doc.version}` : "(none)"}`);
    console.log(`reply length: ${text.length} chars`);
    console.log(`finish: ${ctx.finish}; model: ${ctx.modelId} (configured ${resolveModel("generate")})`);
    const names = tools.map((t) => t.replace(/\(.*$/, ""));
    const w = names.indexOf("delegateWriting");
    failed = res.status !== 200 || ctx.finish !== "stop" || !doc || w === -1 || names.indexOf("createDocument") <= w;
    if (failed) console.error("FAILED: expected delegateWriting -> createDocument and a saved document.");
  } catch (err) {
    failed = true;
    console.error(`FAILED -> ${redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}`);
  } finally {
    await removeSmokeUser();
    const left = await prisma.chat.count({ where: { id: chatId } });
    const docs = await prisma.document.count({ where: { profileId } });
    console.log(`cleanup: smoke user removed, chat rows left: ${left}, documents left: ${docs}`);
    await prisma.$disconnect();
  }
  process.exit(failed ? 1 : 0);
}

void main();
