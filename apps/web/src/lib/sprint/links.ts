import { PROMPT_PARAM_MAX, promptHref } from "@/lib/prompt-param";
import { sprintDraftPrompt, type SprintFormat } from "./curriculum";

/** The home handoff's cap on `?prompt=` (code points), shared by every screen that links to the composer. */
export const PROMPT_MAX = PROMPT_PARAM_MAX;

/**
 * Home link that prefills the composer with a sprint day's prompt (`/?prompt=`). The day and its format travel
 * together, so the number in the prompt always matches the format. Rest days have no format and go to plain home.
 */
export function sprintDraftHref(day: { day: number | null; format: SprintFormat | null }): string {
  if (!day.format) return "/";
  return promptHref(sprintDraftPrompt(day.format, day.day ?? undefined));
}
