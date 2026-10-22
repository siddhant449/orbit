import { sprintDraftPrompt, type SprintFormat } from "./curriculum";

/** The home handoff's cap on `?prompt=` (code points), shared by every screen that links to the composer. */
export const PROMPT_MAX = 2000;

/**
 * Home link that prefills the composer with a sprint day's prompt (`/?prompt=`). The day and its format travel
 * together, so the number in the prompt always matches the format. Rest days have no format and go to plain home.
 */
export function sprintDraftHref(day: { day: number | null; format: SprintFormat | null }): string {
  if (!day.format) return "/";
  const prompt = [...sprintDraftPrompt(day.format, day.day ?? undefined)].slice(0, PROMPT_MAX).join("");
  return `/?${new URLSearchParams({ prompt })}`;
}
