import type { Embedder } from "@brandloop/ai";
import { getProfileKnowledge, hybridSearch, listKnowledge, prisma, type KnowledgeType } from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { LIMITS } from "../limits";
import { oneLine } from "../data";
import { capOutput } from "./cap";
import { runTool } from "./run";

/** Items up to this size are inlined whole in searchKB; larger ones show their best chunks. */
export const INLINE_ITEM_CHARS = 2_000;
const EXCERPT_NOTE = "(excerpt; call readKB for the full text)";
const RECORD_SEPARATOR = "\n\n---\n\n";
const KB_TYPES = ["text", "document", "url", "video", "image"] as const;

const typeName = (type: KnowledgeType) => type.toLowerCase();
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export async function listKBText(profileId: string, opts: { type: KnowledgeType | null; limit: number }): Promise<string> {
  const { items } = await listKnowledge(profileId, { type: opts.type ?? undefined, order: "desc", offset: 0 });
  const rows = items.slice(0, Math.max(1, Math.min(opts.limit, 50)));
  if (rows.length === 0) {
    return opts.type ? `The knowledge base has no ${typeName(opts.type)} items.` : "The knowledge base is empty.";
  }
  return rows
    .map((i) => `${i.id} | ${oneLine(i.title)} | ${typeName(i.type)} | ${i.status.toLowerCase()} | ${isoDay(i.createdAt)}`)
    .join("\n");
}

/** Body lines that could pass for a record boundary or a record header are indented so they stay content. */
function inertBody(text: string): string {
  return text.replace(/^(---+\s*$|(?:id|title|type|content):)/gim, " $1");
}

/** Header, separators and the "more results" note must fit inside the tool cap alongside the records. */
const SEARCH_BUDGET = LIMITS.toolOutputChars - 200;

async function searchHits(profileId: string, embedder: Embedder | null, query: string, limit: number) {
  if (!embedder) return hybridSearch(profileId, query, { embedder: null, limit });
  try {
    return await hybridSearch(profileId, query, { embedder, limit });
  } catch (err) {
    // A failing embedder or vector query must not cost the user their search: retry on full-text only.
    console.warn(`[agent] searchKB: vector search failed, using full-text only: ${err instanceof Error ? err.message : String(err)}`);
    return hybridSearch(profileId, query, { embedder: null, limit });
  }
}

/**
 * Plain-text records, best match first; no scores (Kleo's observed format). Records are never cut:
 * when the next one would pass the budget, it and the rest are dropped and counted in a closing note.
 */
export async function searchKBText(
  profileId: string,
  embedder: Embedder | null,
  query: string,
  limit: number,
): Promise<string> {
  const hits = await searchHits(profileId, embedder, query, Math.max(1, Math.min(limit, 20)));
  const ids = hits.filter((h) => h.sourceType === "KNOWLEDGE").map((h) => h.sourceId);
  const items = ids.length
    ? await prisma.knowledgeItem.findMany({ where: { profileId, id: { in: ids }, status: "READY" } })
    : [];
  const byId = new Map(items.map((i) => [i.id, i]));

  const records: string[] = [];
  for (const hit of hits) {
    const item = byId.get(hit.sourceId);
    if (!item) continue;
    const full = item.content ?? "";
    const body =
      full.length > 0 && full.length <= INLINE_ITEM_CHARS
        ? full
        : `${[...hit.chunks].sort((a, b) => a.ordinal - b.ordinal).map((c) => c.text.trim()).join("\n\n[…]\n\n")}\n\n${EXCERPT_NOTE}`;
    records.push(`id: ${oneLine(item.id)}\ntitle: ${oneLine(item.title)}\ntype: ${typeName(item.type)}\ncontent:\n${inertBody(body)}`);
  }
  if (records.length === 0) return `No knowledge base items match "${oneLine(query)}".`;

  const kept: string[] = [];
  let used = 0;
  for (const record of records) {
    const cost = record.length + (kept.length > 0 ? RECORD_SEPARATOR.length : 0);
    if (used + cost > SEARCH_BUDGET) {
      // A single record over budget (not expected: inline ≤2,000, two chunks ≤~6,400) is cut rather than lost.
      if (kept.length === 0) kept.push(`${record.slice(0, SEARCH_BUDGET - 60)}\n\n${EXCERPT_NOTE}`);
      break;
    }
    kept.push(record);
    used += cost;
  }
  const dropped = records.length - kept.length;
  const note = dropped > 0 ? `\n\n(${dropped} more ${dropped === 1 ? "result" : "results"} not shown)` : "";
  return kept.join(RECORD_SEPARATOR) + note;
}

export async function readKBText(profileId: string, id: string): Promise<string> {
  const item = await getProfileKnowledge(profileId, id);
  if (!item) return `Failed: no knowledge base item with id ${oneLine(id)}.`;
  if (item.status === "PROCESSING") {
    return `"${oneLine(item.title)}" is still being processed. Try readKB again in a minute, or carry on without it.`;
  }
  if (item.status === "FAILED" || !item.content) {
    return `Failed: "${oneLine(item.title)}" couldn't be read when it was added. The user can re-add it on the Knowledge page.`;
  }
  return capOutput(`# ${oneLine(item.title)}\n\nType: ${typeName(item.type)}\n\nContent:\n${item.content}`, LIMITS.readKBChars);
}

export function knowledgeTools(ctx: TurnContext) {
  const { profileId } = ctx;
  return {
    listKB: tool({
      description: "List the user's knowledge base items, newest first: id, title, type, status, date added.",
      inputSchema: z.object({
        type: z.enum(KB_TYPES).nullable(),
        limit: z.number().int().min(1).max(50).nullable(),
      }),
      execute: ({ type, limit }) =>
        runTool("listKB", "knowledge base", () =>
          listKBText(profileId, { type: type ? (type.toUpperCase() as KnowledgeType) : null, limit: limit ?? 20 }),
        ),
    }),
    searchKB: tool({
      description:
        "Search the user's knowledge base (their notes, documents, links and transcripts). Returns matching items; small items in full, large ones as excerpts marked \"(excerpt; call readKB for the full text)\". An item returned in full needs no readKB.",
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(20).nullable(),
      }),
      execute: ({ query, limit }) =>
        runTool("searchKB", "knowledge base", () => searchKBText(profileId, ctx.embedder, query, limit ?? 10)),
    }),
    readKB: tool({
      description: "Read the full text of one knowledge base item by id. Only needed for items searchKB returned as an excerpt, or that listKB found.",
      inputSchema: z.object({ id: z.string().min(1).max(100) }),
      execute: ({ id }) => runTool("readKB", "knowledge base", () => readKBText(profileId, id), LIMITS.readKBChars + 200),
    }),
  };
}
