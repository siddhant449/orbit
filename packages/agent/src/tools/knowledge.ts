import type { Embedder } from "@brandloop/ai";
import { getProfileKnowledge, hybridSearch, listKnowledge, prisma, type KnowledgeType } from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { LIMITS } from "../limits";
import { capOutput } from "./cap";

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
    .map((i) => `${i.id} | ${i.title} | ${typeName(i.type)} | ${i.status.toLowerCase()} | ${isoDay(i.createdAt)}`)
    .join("\n");
}

/** Plain-text records, best match first; no scores (Kleo's observed format). */
export async function searchKBText(
  profileId: string,
  embedder: Embedder | null,
  query: string,
  limit: number,
): Promise<string> {
  const hits = await hybridSearch(profileId, query, { embedder, limit: Math.max(1, Math.min(limit, 20)) });
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
    records.push(`id: ${item.id}\ntitle: ${item.title}\ntype: ${typeName(item.type)}\ncontent:\n${body}`);
  }
  if (records.length === 0) return `No knowledge base items match "${query}".`;
  return records.join(RECORD_SEPARATOR);
}

export async function readKBText(profileId: string, id: string): Promise<string> {
  const item = await getProfileKnowledge(profileId, id);
  if (!item) return `Failed: no knowledge base item with id ${id}.`;
  if (item.status === "PROCESSING") {
    return `"${item.title}" is still being processed. Try readKB again in a minute, or carry on without it.`;
  }
  if (item.status === "FAILED" || !item.content) {
    return `Failed: "${item.title}" couldn't be read when it was added. The user can re-add it on the Knowledge page.`;
  }
  return capOutput(`# ${item.title}\n\nType: ${typeName(item.type)}\n\nContent:\n${item.content}`, LIMITS.readKBChars);
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
      execute: async ({ type, limit }) =>
        capOutput(await listKBText(profileId, { type: type ? (type.toUpperCase() as KnowledgeType) : null, limit: limit ?? 20 })),
    }),
    searchKB: tool({
      description:
        "Search the user's knowledge base (their notes, documents, links and transcripts). Returns matching items; small items in full, large ones as excerpts.",
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        limit: z.number().int().min(1).max(20).nullable(),
      }),
      execute: async ({ query, limit }) => capOutput(await searchKBText(profileId, ctx.embedder, query, limit ?? 10)),
    }),
    readKB: tool({
      description: "Read the full text of one knowledge base item by id.",
      inputSchema: z.object({ id: z.string().min(1).max(100) }),
      execute: async ({ id }) => readKBText(profileId, id),
    }),
  };
}
