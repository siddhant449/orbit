export const PROMPT_PARAM_MAX = 2000;

/**
 * Home's `?prompt=` (from "Plan a post" on the Posts calendar and other screens that start a draft): the text the
 * composer opens with. It is only pre-filled, never sent; the writer finishes it and presses send.
 */
export function promptParam(raw: string | string[] | undefined): string | undefined {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !v.trim()) return undefined;
  return v.slice(0, PROMPT_PARAM_MAX);
}
