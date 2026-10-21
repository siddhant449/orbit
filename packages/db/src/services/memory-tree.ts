/**
 * Pure helpers for the memory file tree: section metadata, path/key mapping and the
 * plain-text renderings the agent tools return. No database access lives here.
 *
 * A memory key is a profile-scoped string like "identity/about"; its path is the key plus ".md".
 */

export type SectionMeta = { title: string; description: string };

export const SECTION_META: Record<string, SectionMeta> = {
  "identity/about": { title: "About", description: "Who the user is: role, company, positioning" },
  "identity/personal": {
    title: "Personal",
    description: "Durable personal facts, history, and interests",
  },
  "identity/story": { title: "Story", description: "The user's background story" },
  "writing/rules": {
    title: "Writing rules",
    description: "The user's explicit writing do's, don'ts, and banned words",
  },
  "voice/style": {
    title: "Voice and style",
    description: "How the user writes: sentence rhythm, structure, signature moves, and explicit content rules",
  },
  "strategy/themes": {
    title: "Content themes",
    description: "The themes in the user's content strategy, mirrored from the strategy page",
  },
};

/** Sections returned with their contents by `viewMemory { includeContents: true }`, in this order. */
export const CORE_KEYS = ["identity/about", "identity/personal", "identity/story", "writing/rules"] as const;

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const AGENT_WRITABLE_FIXED = new Set([
  "identity/about",
  "identity/personal",
  "identity/story",
  "writing/rules",
  "voice/style",
]);
const AGENT_WRITABLE_PATTERN = /^(topics|notes)\/[a-z0-9-]+$/;
// Same bullet shape as `memoryLines` in memory.ts (kept separate so this module stays free of database imports).
const BULLET = /^\s*[-*+]\s+(.*)$/;

export function keyToPath(key: string): string {
  return `${key}.md`;
}

/** Accepts "identity/about" or "identity/about.md". Returns null for anything that isn't a valid key. */
export function pathToKey(path: string): string | null {
  const key = path.endsWith(".md") ? path.slice(0, -3) : path;
  return KEY_PATTERN.test(key) ? key : null;
}

const words = (slug: string) => slug.replace(/[-/]+/g, " ").trim();
const titleCase = (text: string) => text.replace(/\b[a-z0-9]/g, (c) => c.toUpperCase());

export function sectionMeta(key: string): SectionMeta {
  const fixed = SECTION_META[key];
  if (fixed) return fixed;
  const slash = key.indexOf("/");
  const folder = slash === -1 ? "" : key.slice(0, slash);
  const slug = slash === -1 ? key : key.slice(slash + 1);
  const label = words(slug);
  if (folder === "topics") {
    return { title: titleCase(label), description: `What the user knows and thinks about ${label}` };
  }
  if (folder === "notes") {
    return { title: titleCase(label), description: `Notes the user asked to keep about ${label}` };
  }
  return { title: titleCase(label), description: `Saved memory: ${key}` };
}

/** What the agent may create or change. Strategy mirrors and unknown folders are read-only to it. */
export function isAgentWritable(key: string): boolean {
  return AGENT_WRITABLE_FIXED.has(key) || AGENT_WRITABLE_PATTERN.test(key);
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * One line per file, grouped under its top-level folder: `<path>, <description> (updated YYYY-MM-DD)`.
 * Files sort by key, so the output does not depend on input order. Top-level keys without a folder
 * come last, unindented. An empty store renders as "" (the tool supplies the empty-store sentence).
 */
export function renderMemoryIndex(docs: { key: string; updatedAt: Date }[]): string {
  const sorted = [...docs].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const groups = new Map<string, string[]>();
  const loose: string[] = [];
  for (const doc of sorted) {
    const line = `${keyToPath(doc.key)}, ${sectionMeta(doc.key).description} (updated ${isoDay(doc.updatedAt)})`;
    const slash = doc.key.indexOf("/");
    if (slash === -1) {
      loose.push(line);
      continue;
    }
    const folder = doc.key.slice(0, slash);
    groups.set(folder, [...(groups.get(folder) ?? []), `  ${line}`]);
  }
  const out: string[] = [];
  for (const [folder, lines] of groups) out.push(`${folder}/`, ...lines);
  return [...out, ...loose].join("\n");
}

const VERBATIM_NOTICE =
  "(everything below this line is the stored file content, verbatim; editMemory find text must match it exactly)";

/** The `readMemory` output: a header, the verbatim notice, a blank line, then the stored body untouched. */
export function renderMemoryFile(doc: { key: string; content: string }, version: number): string {
  const { title, description } = sectionMeta(doc.key);
  const header = `[memory file: ${keyToPath(doc.key)} | title: ${title} | description: ${description} | version: ${version}]`;
  return `${header}\n${VERBATIM_NOTICE}\n\n${doc.content}`;
}

/** The sections `viewMemory { includeContents: true }` appends: core keys only, in core order, blanks skipped. */
export function renderCoreSections(docs: { key: string; content: string }[]): string {
  const byKey = new Map(docs.map((d) => [d.key, d.content]));
  const blocks: string[] = [];
  for (const key of CORE_KEYS) {
    const content = byKey.get(key);
    if (content === undefined || content.trim() === "") continue;
    blocks.push(`[memory file: ${keyToPath(key)} | description: ${sectionMeta(key).description}]\n${content}`);
  }
  return blocks.join("\n\n");
}

/**
 * Bullet lines containing at least one query term (case-insensitive substring), best match first.
 * Ties keep document order, then line order.
 */
export function searchMemoryLines(
  docs: { key: string; content: string }[],
  query: string,
  limit = 20,
): { path: string; text: string }[] {
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
  if (terms.length === 0) return [];
  const scored: { path: string; text: string; score: number }[] = [];
  for (const doc of docs) {
    for (const raw of doc.content.split("\n")) {
      const text = BULLET.exec(raw)?.[1]?.trim();
      if (!text) continue;
      const haystack = text.toLowerCase();
      const score = terms.reduce((n, term) => n + (haystack.includes(term) ? 1 : 0), 0);
      if (score > 0) scored.push({ path: keyToPath(doc.key), text, score });
    }
  }
  // Array.prototype.sort is stable, so equal scores keep their original order.
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ path, text }) => ({ path, text }));
}

/**
 * Replace `find` with `replace` only when `find` occurs exactly once. Overlapping occurrences count
 * as separate matches, so an ambiguous edit is never applied by guesswork. An empty `find` matches nothing.
 */
export function replaceOnce(
  content: string,
  find: string,
  replace: string,
): { ok: true; content: string } | { ok: false; count: number } {
  if (find === "") return { ok: false, count: 0 };
  let count = 0;
  let first = -1;
  for (let at = content.indexOf(find); at !== -1; at = content.indexOf(find, at + 1)) {
    if (count === 0) first = at;
    count++;
  }
  if (count !== 1) return { ok: false, count };
  return { ok: true, content: content.slice(0, first) + replace + content.slice(first + find.length) };
}
