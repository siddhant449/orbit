/** The home handoff's cap on `?prompt=`, in code points. Every screen that starts a draft shares it (ruling A22). */
export const PROMPT_PARAM_MAX = 2000;

const clipPrompt = (v: string) => {
  const chars = Array.from(v);
  return chars.length <= PROMPT_PARAM_MAX ? v : chars.slice(0, PROMPT_PARAM_MAX).join("");
};

/**
 * Home's `?prompt=` (from "Plan a post" on the Posts calendar and other screens that start a draft): the text the
 * composer opens with. It is only pre-filled, never sent; the writer finishes it and presses send.
 */
export function promptParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.trim()) return undefined;
  return clipPrompt(v);
}

/** The one link that starts a draft: home with `text` pre-filled in the composer (capped, never sent). */
export function promptHref(text: string): string {
  return text.trim() ? `/?prompt=${encodeURIComponent(clipPrompt(text))}` : "/";
}
