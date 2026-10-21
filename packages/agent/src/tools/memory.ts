import {
  appendMemoryLines,
  getMemoryVersion,
  isAgentWritable,
  keyToPath,
  listMemory,
  memoryLines,
  pathToKey,
  prisma,
  renderCoreSections,
  renderMemoryFile,
  renderMemoryIndex,
  replaceInSection,
  searchMemoryLines,
} from "@brandloop/db";
import { tool } from "ai";
import { z } from "zod";
import type { TurnContext } from "../context";
import { oneLine } from "../data";
import { checkMemoryFact } from "../guard";
import { runTool } from "./run";

export const MEMORY_EMPTY = "Memory is empty. Nothing has been saved about this user yet.";
const REFUSED_ASSISTANT =
  "Refused: these read like assistant replies or questions, not facts about the user. Nothing was saved.";
const REFUSED_LENGTH = "Refused: each fact must be 8 to 500 characters. Nothing was saved.";

export const MEMORY_CATEGORIES = ["about", "personal", "story", "writing_rules", "topic"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const CATEGORY_KEYS: Record<Exclude<MemoryCategory, "topic">, string> = {
  about: "identity/about",
  personal: "identity/personal",
  story: "identity/story",
  writing_rules: "writing/rules",
};

const missingFile = (path: string) => `Failed: no memory file at ${path}. Call viewMemory to see what exists.`;
const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export async function viewMemoryText(profileId: string, includeContents: boolean): Promise<string> {
  const docs = await listMemory(profileId);
  if (docs.length === 0) return MEMORY_EMPTY;
  const index = renderMemoryIndex(docs);
  if (!includeContents) return index;
  const core = renderCoreSections(docs);
  return core ? `${index}\n\n${core}` : index;
}

export async function readMemoryText(profileId: string, path: string): Promise<string> {
  const key = pathToKey(path.trim());
  if (!key) return missingFile(path);
  const [doc, version] = await Promise.all([
    prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key } } }),
    getMemoryVersion(profileId),
  ]);
  if (!doc) return missingFile(keyToPath(key));
  return renderMemoryFile(doc, version);
}

export async function searchMemoryText(profileId: string, query: string): Promise<string> {
  const hits = searchMemoryLines(await listMemory(profileId), query);
  if (hits.length === 0) return `No memory lines match "${oneLine(query)}".`;
  return hits.map((h) => `${h.path}: ${h.text}`).join("\n");
}

/** `saveMemory`: guard every fact, dedupe against what is stored, append the rest with source EXTRACTED. */
export async function saveMemoryFacts(
  profileId: string,
  input: { category: MemoryCategory; topic: string | null; facts: string[] },
): Promise<string> {
  let key: string;
  if (input.category === "topic") {
    const slug = slugify(input.topic ?? "");
    if (!slug) return "Failed: category topic needs a topic name (for example \"Design systems\"). Nothing was saved.";
    key = `topics/${slug}`;
  } else {
    key = CATEGORY_KEYS[input.category];
  }
  if (!isAgentWritable(key)) return `Refused: ${keyToPath(key)} can't be changed from chat. Nothing was saved.`;

  const accepted: string[] = [];
  const reasons: string[] = [];
  for (const fact of input.facts) {
    const check = checkMemoryFact(fact);
    if (check.ok) accepted.push(check.text);
    else reasons.push(check.reason);
  }
  if (accepted.length === 0) return reasons.includes("refusal") || reasons.length === 0 ? REFUSED_ASSISTANT : REFUSED_LENGTH;

  const existing = await prisma.memoryDoc.findUnique({ where: { profileId_key: { profileId, key } } });
  const seen = new Set(memoryLines(existing?.content ?? "").map((l) => normalise(l.text)));
  const fresh: string[] = [];
  for (const fact of accepted) {
    const norm = normalise(fact);
    if (seen.has(norm)) continue;
    seen.add(norm);
    fresh.push(fact);
  }
  const refused = reasons.length > 0 ? ` (${reasons.length} refused)` : "";
  if (fresh.length === 0) return `✓ Already saved: nothing new for ${input.category}${refused}`;

  await appendMemoryLines(profileId, key, fresh, "EXTRACTED");
  return `✓ Updated ${input.category} with ${fresh.length} ${fresh.length === 1 ? "item" : "items"}${refused}`;
}

/** `editMemory`: one exact find/replace inside an agent-writable section. `replace: ""` deletes. */
export async function editMemoryText(
  profileId: string,
  input: { path: string; find: string; replace: string },
): Promise<string> {
  const key = pathToKey(input.path.trim());
  if (!key) return `Failed: ${input.path} is not a memory path. Call viewMemory to see what exists.`;
  const path = keyToPath(key);
  if (key.startsWith("strategy/")) {
    return `Refused: ${path} mirrors the content strategy and is rewritten from it. Change the strategy instead.`;
  }
  if (!isAgentWritable(key)) return `Refused: ${path} can't be changed from chat.`;
  if (input.find === "") return "Failed: the find text is empty. Copy the exact text to change from readMemory.";
  if (input.replace.trim() !== "") {
    const check = checkMemoryFact(input.replace);
    // Short replacements ("Pune" for "Mumbai") are normal corrections; only refusals and over-long text are stopped.
    if (!check.ok && check.reason !== "too_short") {
      return check.reason === "refusal"
        ? "Refused: the replacement reads like an assistant reply or question, not a fact about the user. Nothing was changed."
        : "Refused: the replacement is longer than 500 characters. Nothing was changed.";
    }
  }

  // Keep the section's source (a USER section stays USER), as appendMemoryLines does.
  const existing = await prisma.memoryDoc.findUnique({
    where: { profileId_key: { profileId, key } },
    select: { source: true },
  });
  if (!existing) return missingFile(path);
  const result = await replaceInSection(profileId, key, input.find, input.replace, existing.source);
  if (result.ok) return `✓ Updated ${path} (memory version ${result.version})`;
  if (result.reason === "missing_section") return missingFile(path);
  if (result.reason === "not_found") {
    return `Failed: the find text doesn't appear in ${path}. Call readMemory and copy the text exactly.`;
  }
  return `Failed: the find text appears ${result.count} times in ${path}. Include more of the surrounding text so it matches once.`;
}

export function memoryTools(ctx: TurnContext) {
  const { profileId } = ctx;
  return {
    viewMemory: tool({
      description:
        "List the user's memory files (path, description, last update). With includeContents, also return the identity and writing-rules files in full.",
      inputSchema: z.object({ includeContents: z.boolean().nullable() }),
      execute: ({ includeContents }) =>
        runTool("viewMemory", "memory", () => viewMemoryText(profileId, includeContents ?? false)),
    }),
    readMemory: tool({
      description: "Read one memory file verbatim, for example identity/about.md or voice/style.md.",
      inputSchema: z.object({ path: z.string().min(1).max(200) }),
      execute: ({ path }) => runTool("readMemory", "memory", () => readMemoryText(profileId, path)),
    }),
    searchMemory: tool({
      description: "Find saved memory lines that contain any of the query words.",
      inputSchema: z.object({ query: z.string().min(1).max(500) }),
      execute: ({ query }) => runTool("searchMemory", "memory", () => searchMemoryText(profileId, query)),
    }),
    saveMemory: tool({
      description:
        "Save durable facts the user told you about themselves, or rules they want kept. One short fact per item, in the third person. Use category topic with a topic name for their views on a subject. Never save your own words, questions or task requests.",
      inputSchema: z.object({
        category: z.enum(MEMORY_CATEGORIES),
        topic: z.string().max(80).nullable(),
        facts: z.array(z.string().max(1000)).min(1).max(10),
      }),
      execute: (input) => runTool("saveMemory", null, () => saveMemoryFacts(profileId, input)),
    }),
    editMemory: tool({
      description:
        "Correct or delete saved memory: replace one exact passage in a memory file. find must match the file text exactly once (read it first); an empty replace deletes it.",
      inputSchema: z.object({
        path: z.string().min(1).max(200),
        find: z.string().max(2000),
        replace: z.string().max(2000),
      }),
      execute: (input) => runTool("editMemory", null, () => editMemoryText(profileId, input)),
    }),
  };
}
