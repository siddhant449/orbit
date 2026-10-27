/**
 * Manual live smoke test for the chat pickers and research. NOT run by any test suite: it makes real turns with the
 * real model (web search on) on the throwaway eval user in the TEST database, writes a compact transcript to
 * .recon/pickers-live.md and deletes the user.
 *
 *   pnpm --filter @brandloop/agent exec tsx --env-file-if-exists=../../.env scripts/smoke-pickers.ts
 *
 * Reads OPENAI_API_KEY at runtime and never prints it. Never touches the real database.
 */
import "@brandloop/db/use-test-db";
import { createAiClient, createEmbedder, getModel, webSearchTool } from "@brandloop/ai";
import { getChat, getChatDocument, listMessages, prisma } from "@brandloop/db";
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evalRowsLeft, removeEvalUser, seedEvalProfile } from "../eval/fixture";
import { selectResearchProvider } from "../src/research/provider";
import { createRunRegistry } from "../src/registry";
import { runChatTurn } from "../src/turn";

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, "../../../../../.recon/pickers-live.md");
const redact = (t: string) => t.replace(/sk-[A-Za-z0-9_*-]+/g, "sk-***");
const tokens = { input: 0, output: 0 };
const add = (u: unknown) => {
  const x = u as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  const n = (v: unknown) => (typeof v === "number" ? v : typeof (v as { total?: unknown })?.total === "number" ? (v as { total: number }).total : 0);
  tokens.input += n(x?.inputTokens);
  tokens.output += n(x?.outputTokens);
};
function metered(model: LanguageModel): LanguageModel {
  const middleware: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate }) => (async (r) => (add(r.usage), r))(await doGenerate()),
    wrapStream: async ({ doStream }) => {
      const r = await doStream();
      return {
        ...r,
        stream: r.stream.pipeThrough(
          new TransformStream({
            transform(chunk, c) {
              if ((chunk as { type?: string }).type === "finish") add((chunk as { usage?: unknown }).usage);
              c.enqueue(chunk);
            },
          }),
        ),
      };
    },
  };
  return wrapLanguageModel({ model: model as Parameters<typeof wrapLanguageModel>[0]["model"], middleware });
}

type Part = { type: string; text?: string; state?: string; output?: unknown; input?: unknown };
type Row = { id: string; title: string; expect: string; pass: boolean; lines: string[] };
const rows: Row[] = [];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const search = webSearchTool();
  const deps = {
    model: metered(getModel("generate", apiKey)),
    ai: createAiClient(apiKey, { model: (alias) => metered(getModel(alias, apiKey)) }),
    embedder: createEmbedder(apiKey),
    registry: createRunRegistry(),
    after: () => {},
    webSearchTool: search,
    research: selectResearchProvider({}, { model: metered(getModel("extract", apiKey)), webSearch: search }),
  };
  let profileId = "";
  try {
    const seeded = await seedEvalProfile({ embedder: deps.embedder });
    profileId = seeded.profileId;
    const caller = { userId: seeded.userId, profileId };

    async function turn(chatId: string, text: string, optionPick?: { pickerToolCallId: string; optionId: string }) {
      const logs: string[] = [];
      const orig = console.error;
      console.error = (...a: unknown[]) => void logs.push(redact(a.map(String).join(" ")).slice(0, 300));
      const t0 = Date.now();
      let status = 0;
      try {
        const res = await runChatTurn(deps, caller, {
          id: chatId,
          runId: randomUUID(),
          message: { id: randomUUID(), role: "user", parts: [{ type: "text", text }], metadata: { createdAt: new Date().toISOString() } },
          selectedKnowledgeBaseIds: [],
          selectedWritingStyleId: null,
          selectedFormatId: null,
          webSearchEnabled: true,
          ...(optionPick ? { optionPick, uiAction: "option-pick" as const } : {}),
        });
        status = res.status;
        await res.text();
        for (let i = 0; i < 1200 && (await getChat(profileId, chatId))?.activeRunId; i++) await new Promise((r) => setTimeout(r, 100));
      } finally {
        console.error = orig;
      }
      const reply = (await listMessages(profileId, chatId)).filter((m) => m.role === "assistant").at(-1);
      const parts = (reply?.parts ?? []) as Part[];
      const tools = parts.filter((p) => p.type.startsWith("tool-"));
      const picker = parts.find((p) => (p.type === "tool-presentOptions" || p.type === "tool-generateIdeas") && p.state === "output-available");
      const po = picker?.output as { question?: string; options?: { id: string; label: string }[] } | undefined;
      const research = tools.find((p) => p.type === "tool-researchTopic");
      const doc = await getChatDocument(profileId, chatId);
      const replyText = parts.filter((p) => p.type === "text").map((p) => p.text).join("").trim();
      const lines = [
        `http ${status}, ${((Date.now() - t0) / 1000).toFixed(1)} s`,
        `tools: ${tools.map((p) => `${p.type.slice(5)}${p.state === "output-available" && !(typeof p.output === "string" && /^(Failed|Refused)/.test(p.output)) ? "" : " (failed)"}`).join(" -> ") || "none"}`,
        research ? `research: ${typeof research.output === "string" ? research.output.slice(0, 160) : "ok"}` : "research: not called",
        po?.question ? `picker: "${po.question}" -> ${po.options?.map((o, i) => `${i + 1}. ${o.label}`).join(" | ")}` : "picker: none",
        `reply: ${replyText.slice(0, 200) || "(empty)"}`,
        `draft: ${doc ? `yes (v${doc.version})` : "no"}`,
        ...logs.map((l) => `server log: ${l}`),
      ];
      return { po, pickerId: picker ? (picker as unknown as { toolCallId: string }).toolCallId : null, tools: tools.map((p) => p.type.slice(5)), research, replyText, doc, lines };
    }
    const record = (id: string, title: string, expect: string, pass: boolean, lines: string[]) => {
      rows.push({ id, title, expect, pass, lines });
      console.log(`${pass ? "PASS" : "FAIL"} (${id}) ${title}`);
    };
    const noPaste = (t: string) => !/\bpaste\b|can't see which|could you (share|send)/i.test(t);

    // (a) ideas, (b) typed "2nd", (e) angles after (a)
    const chatA = randomUUID();
    const a = await turn(chatA, "Give me five post ideas for this week based on my strategy.");
    const researchOk = !a.research || typeof a.research.output !== "string" || a.research.output.startsWith("Skipped:");
    record("a", "Ideas request", "ideas picker shown; research ran or was skipped softly", Boolean(a.po?.options?.length) && researchOk, a.lines);
    const e = await turn(chatA, "give me some angles");
    record("e", "Angles after ideas", "presentOptions called, no paste request", e.tools.includes("presentOptions") && noPaste(e.replyText), e.lines);

    const chatB = randomUUID();
    const b0 = await turn(chatB, "Give me five post ideas for this week based on my strategy.");
    const b = await turn(chatB, "2nd");
    record("b", 'Typed "2nd" on an ideas picker', "treated as a pick: a draft is created or angles shown; never a paste request", Boolean(b.doc || b.tools.includes("presentOptions")) && noPaste(b.replyText), [...b0.lines.slice(0, 4), "--- then typed 2nd ---", ...b.lines]);

    // (c) angles panel, (d) own angle
    const chatC = randomUUID();
    const c = await turn(chatC, "create a post on llm");
    record("c", "Bare topic", "angles panel", c.tools.includes("presentOptions") && Boolean(c.po), c.lines);
    const d = await turn(chatC, "Make it about why small teams should skip fine-tuning at first");
    record("d", "Own angle typed", "a draft is created; no paste request", Boolean(d.doc) && noPaste(d.replyText), d.lines);

    // (f) the user's live case
    const chatF = randomUUID();
    const f0 = await turn(chatF, "Lets post on current trends of AI.");
    const f = f0.pickerId ? await turn(chatF, f0.po!.options![0]!.label, { pickerToolCallId: f0.pickerId, optionId: f0.po!.options![0]!.id }) : null;
    const refused = f ? /not responding|try again shortly|can't draft|unable to/i.test(f.replyText) : true;
    record("f", '"Lets post on current trends of AI." then angle 1', "angles panel, then a draft (never a refusal)", Boolean(f0.po && f?.doc) && !refused, [...f0.lines, "--- then picked angle 1 ---", ...(f?.lines ?? ["(no picker)"])]);
  } catch (err) {
    console.error(`FAILED: ${redact(err instanceof Error ? `${err.name}: ${err.message}` : String(err))}`);
    process.exitCode = 1;
  } finally {
    await removeEvalUser();
    const left = profileId ? Object.values(await evalRowsLeft(profileId)).reduce((x, y) => x + y, 0) : 0;
    console.log(`cleanup: rows left ${left}`);
    const cost = (tokens.input * 2 + tokens.output * 8) / 1_000_000;
    const md = [
      "# Orbit pickers: live smoke (Luna 6)",
      "",
      ...rows.flatMap((r) => [`## (${r.id}) ${r.title}: ${r.pass ? "PASS" : "FAIL"}`, `Expect: ${r.expect}`, "", ...r.lines.map((l) => `- ${l}`), ""]),
      `Tokens: ${tokens.input} in, ${tokens.output} out (web search tool fees not counted). Estimated cost at an assumed $2/M in and $8/M out: about $${cost.toFixed(3)}.`,
    ].join("\n");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, md);
    console.log(`transcript: ${OUT}; tokens ${tokens.input}/${tokens.output}; est $${cost.toFixed(3)}`);
    await prisma.$disconnect();
  }
}
void main();
