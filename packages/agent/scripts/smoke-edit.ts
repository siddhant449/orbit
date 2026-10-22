/**
 * Manual live smoke test for editing a post. NOT run by any test suite: it creates a post on a throwaway smoke
 * profile, makes ONE real chat turn ("Make the hook shorter"), prints the tools called and the version change, then
 * deletes the profile.
 *
 *   pnpm --filter @brandloop/agent smoke:edit
 *
 * Reads OPENAI_API_KEY at runtime (the script loads the repo .env) and prints only tool names, versions, lengths and
 * the model id, never the key. No title call, no web search, no embeddings.
 */
import "@brandloop/db/use-test-db";
import { assertTestDatabase } from "@brandloop/db/test-db";
import { createAiClient, getModel, resolveModel } from "@brandloop/ai";
import { createDocumentForChat, ensureAccount, getChat, getChatDocument, getOrCreateChat, listDocumentVersions, listMessages, prisma, upsertMemory } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { createRunRegistry } from "../src/registry";
import { runChatTurn } from "../src/turn";

const CLERK_ID = "user_test_smoke_edit";
const TEAM_SUFFIX = " (smoke)";
const redact = (text: string) => text.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");

const POST = [
  "I used to think that the best way to grow a small design studio was to say yes to every single client who walked through the door, no matter the budget.",
  "",
  "Then a year of late nights taught me otherwise. Saying no to the wrong work made room for the right work.",
  "",
  "Now we take on four clients a quarter, and every one of them gets our best.",
].join("\n");

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
  const acc = await ensureAccount({ clerkId: CLERK_ID, email: "smoke-edit@example.test", firstName: "Smoke", teamNameSuffix: TEAM_SUFFIX });
  const profileId = acc.currentProfile!.id;
  const chatId = randomUUID();
  let failed = false;
  try {
    await upsertMemory(profileId, "writing/rules", "- Short paragraphs, one idea each\n- No hashtags", "USER");
    await getOrCreateChat(profileId, acc.user.id, chatId);
    const before = await createDocumentForChat(profileId, chatId, { title: "Saying no", text: POST });
    console.log(`before: version ${before.version}, hook ${POST.split("\n")[0]!.length} chars`);
    const res = await runChatTurn(
      { model: getModel("generate"), ai: createAiClient(), embedder: null, registry: createRunRegistry(), after: () => {}, webSearchTool: null },
      { userId: acc.user.id, profileId },
      {
        id: chatId,
        runId: randomUUID(),
        message: {
          id: randomUUID(),
          role: "user",
          parts: [{ type: "text", text: "Make the hook shorter" }],
          metadata: { createdAt: new Date().toISOString() },
        },
        selectedKnowledgeBaseIds: [],
        selectedWritingStyleId: null,
        webSearchEnabled: false,
        documentContext: { id: before.id, version: before.version },
      },
    );
    console.log(`status: ${res.status}`);
    await res.text();
    for (let i = 0; i < 100 && (await getChat(profileId, chatId))?.activeRunId; i++) await new Promise((r) => setTimeout(r, 100));

    const reply = (await listMessages(profileId, chatId)).find((m) => m.role === "assistant");
    const parts = (reply?.parts ?? []) as { type: string; text?: string; state?: string; output?: unknown }[];
    const tools = parts.filter((p) => p.type.startsWith("tool-")).map((p) => `${p.type.slice(5)}(${p.state})`);
    const ctx = (reply?.context ?? {}) as { modelId?: string; finish?: string };
    const after = await getChatDocument(profileId, chatId);
    const versions = after ? await listDocumentVersions(profileId, after.id) : [];
    const proposal = parts.find((p) => p.type === "tool-proposeDocumentEdits")?.output as { replacement?: string } | undefined;
    console.log(`tools in order: ${tools.join(" -> ") || "(none)"}`);
    console.log(`after: version ${after?.version}, source ${versions[0]?.source}, hook ${after?.text.split("\n")[0]!.length} chars`);
    if (proposal?.replacement !== undefined) console.log(`proposal replacement: ${proposal.replacement.length} chars`);
    console.log(`finish: ${ctx.finish}; model: ${ctx.modelId} (configured ${resolveModel("generate")})`);
    const names = tools.map((t) => t.replace(/\(.*$/, ""));
    const edited = names.includes("updateDocument") && (after?.version ?? 0) > before.version;
    const proposed = names.includes("proposeDocumentEdits") && typeof proposal?.replacement === "string";
    failed = res.status !== 200 || ctx.finish !== "stop" || !(edited || proposed);
    if (failed) console.error("FAILED: expected updateDocument (new version) or proposeDocumentEdits (a replacement).");
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
