import { CATEGORIES } from "@brandloop/agent/client";

export type TemplateDto = {
  id: string;
  slug: string;
  type: "HOOK" | "POST";
  category: string;
  title: string;
  why: string;
  skeleton: string;
  beats: string[];
  needs: string[];
  tags: string[];
  saved: boolean;
  liked: boolean;
  /** Made by this profile (shown as "You", editable). */
  own: boolean;
  likeCount: number;
  useCount: number;
};

export const categoryLabel = (id: string) => CATEGORIES.find((c) => c.id === id)?.label ?? id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** What the writer must supply for a template, in words ("story" -> "a real story of yours"). */
export const NEED_LABELS: Record<string, string> = { story: "A real story of yours", number: "A real number", news: "A recent news item" };

/** The home link that starts a chat with this post template pinned. */
export const templateHref = (slug: string) => `/?template=${encodeURIComponent(slug)}`;

/** "Used 1 time" / "Used 3 times". */
export const usedLabel = (n: number) => `Used ${n} ${n === 1 ? "time" : "times"}`;

/** The text split into plain parts and `[slot]` parts, for the highlighted preview. */
export function splitSlots(text: string): { text: string; slot: boolean }[] {
  return text
    .split(/(\[[^\[\]\n]+\])/g)
    .filter(Boolean)
    .map((part) => ({ text: part, slot: /^\[[^\[\]\n]+\]$/.test(part) }));
}
