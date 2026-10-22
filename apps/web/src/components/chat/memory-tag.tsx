import Link from "next/link";
import type { ToolPartLike } from "./tool-row";
import { toolStateOf } from "./tool-row";

const CATEGORY_AREAS: Record<string, string> = {
  about: "About you",
  personal: "Personal",
  story: "Your story",
  writing_rules: "Writing rules",
};

const PATH_AREAS: Record<string, string> = {
  "identity/about": "About you",
  "identity/personal": "Personal",
  "identity/story": "Your story",
  "writing/rules": "Writing rules",
};

function areaOfPath(path: string): string {
  const key = path.trim().replace(/\.md$/, "");
  if (PATH_AREAS[key]) return PATH_AREAS[key];
  const leaf = key.split("/").at(-1) ?? key;
  const words = leaf.replace(/[-_]+/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Memory";
}

export type MemoryChange = { area: string; change: string };

/** The memory confirmation a finished saveMemory / editMemory call earns; null for anything else. */
export function memoryTagOf(part: ToolPartLike & { input?: unknown }): MemoryChange | null {
  if (part.state !== "output-available" || toolStateOf(part) !== "done" || typeof part.output !== "string") return null;
  const output = part.output;
  if (!output.startsWith("✓")) return null;
  const input = (part.input ?? {}) as { category?: string; topic?: string | null; path?: string; replace?: string };
  if (part.type === "tool-saveMemory") {
    const area = input.category === "topic" ? input.topic?.trim() || "Topics" : (CATEGORY_AREAS[input.category ?? ""] ?? "Memory");
    if (/Already saved/.test(output)) return { area, change: "Already saved" };
    const n = /with (\d+) items?/.exec(output)?.[1];
    return { area, change: n ? `${n} ${n === "1" ? "item" : "items"} added` : "Saved" };
  }
  if (part.type === "tool-editMemory") {
    return { area: areaOfPath(input.path ?? ""), change: input.replace === "" ? "Removed" : "Updated" };
  }
  return null;
}

/**
 * Memory confirmation (system §6.14, p03): "Area · change" in the mono data register, a 6 px accent dot first,
 * linking to the memory screen.
 */
export function MemoryTag({ area, change, href = "/settings/memories" }: MemoryChange & { href?: string }) {
  return (
    <Link href={href} data-memory-tag="" className="memory-tag orbit-transition">
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent-text" />
      <span>{`${area} · ${change}`}</span>
    </Link>
  );
}
