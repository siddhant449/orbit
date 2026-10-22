import { findSprintFormat, sprintDraftPrompt } from "./curriculum";
import { SPRINT_LENGTH } from "./plan";

/** Home link that starts a chat drafting a sprint format (`/?draft=<id>&day=<n>`). */
export function sprintDraftHref(formatId: string, day?: number | null): string {
  const q = new URLSearchParams({ draft: formatId });
  if (day) q.set("day", String(day));
  return `/?${q}`;
}

/** The opening prompt for a `?draft=` link, or null when the link names no known format. */
export function sprintPromptFromQuery(query: Record<string, string | string[] | undefined>): string | null {
  const id = typeof query.draft === "string" ? query.draft : undefined;
  const format = findSprintFormat(id);
  if (!format) return null;
  const day = typeof query.day === "string" && /^\d{1,2}$/.test(query.day) ? Number(query.day) : undefined;
  return sprintDraftPrompt(format, day && day >= 1 && day <= SPRINT_LENGTH ? day : undefined);
}
