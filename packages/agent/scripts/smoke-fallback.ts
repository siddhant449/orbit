/**
 * Manual live check of the Gemini fallback. NOT run by any test suite. OpenAI is given a deliberately invalid key (it
 * answers 401 and charges nothing), so every call must be answered by Gemini (GEMINI_API_KEY, free tier is enough).
 * Runs on the throwaway eval user in the TEST database and deletes it afterwards. A free-tier Gemini key allows 5 requests
 * a minute and 20 a day per model, and has no Google Search grounding; one run uses about 6 requests.
 *
 *   pnpm --filter @brandloop/agent exec tsx --env-file-if-exists=../../.env scripts/smoke-fallback.ts
 *
 * Checks: (1) a bare topic opens the angles panel, (2) picking angle 1 writes a draft, (3) research runs on Gemini with
 * Google Search grounding and returns real source URLs. Never prints a key. Never touches the real database.
 */
import "@brandloop/db/use-test-db";
// Before anything reads it: no code path can reach a paid OpenAI call.
process.env.OPENAI_API_KEY = "sk-invalid-fallback-smoke";

import { createAiClient, geminiEnabled, geminiResearchFallback, getModel, webSearchTool } from "@brandloop/ai";
import { fakeEmbedder } from "@brandloop/ai/testing";
import { getChat, getChatDocument, listMessages, prisma } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { evalRowsLeft, removeEvalUser, seedEvalProfile } from "../eval/fixture";
import { selectResearchProvider } from "../src/research/provider";
import { createRunRegistry } from "../src/registry";
import { runChatTurn } from "../src/turn";

type Part = { type: string; text?: string; state?: string; output?: unknown; toolCallId?: string };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logs: string[] = [];
const origError = console.error;
console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" ").replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***").slice(0, 200));

async function main() {
  if (!geminiEnabled()) throw new Error("GEMINI_API_KEY is not set");
  const key = process.env.OPENAI_API_KEY!;
  const search = webSearchTool();
  const research = selectResearchProvider({}, { model: getModel("extract", key, { fallback: false }), webSearch: search, fallback: geminiResearchFallback() });
  const deps = { model: getModel("generate", key), ai: createAiClient(key), embedder: fakeEmbedder(), registry: createRunRegistry(), after: () => {}, webSearchTool: null, research: null };
  let profileId = "";
  let failed = 0;
  const check = (name: string, ok: boolean, detail: string) => {
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
  };
  try {
    const seeded = await seedEvalProfile({ embedder: deps.embedder });
    profileId = seeded.profileId;
    const caller = { userId: seeded.userId, profileId };
    const chatId = randomUUID();
    const turn = async (text: string, optionPick?: { pickerToolCallId: string; optionId: string }) => {
      const res = await runChatTurn(deps, caller, {
        id: chatId,
        runId: randomUUID(),
        message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }], metadata: { createdAt: new Date().toISOString() } },
        selectedKnowledgeBaseIds: [],
        selectedWritingStyleId: null,
        selectedFormatId: null,
        webSearchEnabled: false,
        ...(optionPick ? { optionPick, uiAction: "option-pick" as const } : {}),
      });
      await res.text();
      for (let i = 0; i < 1200 && (await getChat(profileId, chatId))?.activeRunId; i++) await pause(100);
      const parts = ((await listMessages(profileId, chatId)).filter((m) => m.role === "assistant").at(-1)?.parts ?? []) as Part[];
      return { parts, reply: parts.filter((p) => p.type === "text").map((p) => p.text).join("").trim() };
    };

    const t0 = Date.now();
    const a = await turn("create a post on llm");
    const panel = a.parts.find((p) => p.type === "tool-presentOptions" && p.state === "output-available");
    const opts = (panel?.output as { options?: { id: string; label: string }[] } | undefined)?.options ?? [];
    check("angles panel on Gemini", opts.length > 0, `${opts.length} options (${((Date.now() - t0) / 1000).toFixed(1)} s); reply "${a.reply.slice(0, 80)}"`);

    if (panel?.toolCallId && opts[0]) {
      await pause(8000); // free-tier requests per minute
      const t1 = Date.now();
      const b = await turn(opts[0].label, { pickerToolCallId: panel.toolCallId, optionId: opts[0].id });
      const doc = await getChatDocument(profileId, chatId);
      const draft = doc?.text ?? "";
      check("draft on Gemini", Boolean(doc) && draft.length > 200, `${draft.length} chars (${((Date.now() - t1) / 1000).toFixed(1)} s); reply "${b.reply.slice(0, 80)}"`);
    } else check("draft on Gemini", false, "skipped: no panel to pick from");

    await pause(8000);
    try {
      const r = await research!.search({ query: "What were the biggest AI model releases this month?", window: { start: "2026-10-01", end: "2026-11-02", label: "this month" }, maxResults: 5 }, AbortSignal.timeout(60_000));
      check("research on Gemini with Google Search", r.citations.length > 0 && /^gemini/.test(r.model ?? ""), `${r.citations.length} sources, model ${r.model}, first ${r.citations[0]?.url.slice(0, 60) ?? "none"}`);
    } catch {
      // In the app this is the soft "Went ahead without research" path. A free-tier Gemini key has no grounding quota.
      const why = logs.find((l) => /research fallback failed/.test(l)) ?? "unknown";
      console.log(`SKIP research on Gemini (the app goes ahead without research): ${why}`);
    }
  } catch (err) {
    failed++;
    console.log(`FAILED: ${err instanceof Error ? `${err.name}: ${err.message.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***").slice(0, 200)}` : String(err)}`);
  } finally {
    console.error = origError;
    await removeEvalUser();
    const left = profileId ? Object.values(await evalRowsLeft(profileId)).reduce((x, y) => x + y, 0) : 0;
    const fellBack = logs.filter((l) => /trying the fallback/.test(l)).length;
    const fbFailed = logs.filter((l) => /fallback .* failed|research fallback failed/.test(l));
    console.log(`fallback used ${fellBack}x; fallback failures ${fbFailed.length}${fbFailed.length ? `: ${fbFailed.slice(0, 3).join(" | ")}` : ""}`);
    console.log(`other server logs: ${logs.filter((l) => !/\[ai\]/.test(l)).slice(0, 5).join(" | ") || "none"}`);
    console.log(`cleanup: rows left ${left}`);
    process.exitCode = failed ? 1 : 0;
    await prisma.$disconnect();
  }
}
void main();
