/**
 * Server-written closing lines (token cut). After a successful draft on a picked angle, or a successful edit,
 * the orchestrator's last model step only repeats a sentence the prompt already fixes, so the turn stops and the
 * server appends that sentence. Anything unusual (a research skip to disclose, a failed or unchanged edit, a
 * question in the user's message) is left to the model.
 */
export const FIRST_DRAFT_LINE = "Here's your first draft. What would you like to improve?";

type ToolResultLike = { toolName: string; output?: unknown };
type StepLike = { toolResults?: readonly ToolResultLike[] };

const SKIPPED = /^Skipped:/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** True when an earlier or current step reported skipped research, which the reply must disclose. */
function researchSkipped(steps: readonly StepLike[]): boolean {
  return steps.some((s) => (s.toolResults ?? []).some((r) => r.toolName === "researchTopic" && typeof r.output === "string" && SKIPPED.test(r.output)));
}

/** One sentence from the editor's change summary, ending in a full stop. */
export function editClosingLine(changeSummary: string): string {
  const t = changeSummary.replace(/\s+/g, " ").trim();
  if (!t) return "Done. I've updated the post.";
  const sentence = /[.!?]$/.test(t) ? t : `${t}.`;
  return `Done: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

/**
 * The line to append when the turn can end after `steps`, else null.
 * - create: the last step created the post (createDocument success) from a picked angle.
 * - edit: the last step made exactly one successful updateDocument change and the user's message asks nothing.
 */
export function closingLine(input: { steps: readonly StepLike[]; pickedAngle: boolean; userText: string }): string | null {
  const last = input.steps.at(-1)?.toolResults ?? [];
  if (last.length === 0 || researchSkipped(input.steps)) return null;
  if (last.length === 1) {
    const r = last[0]!;
    if (r.toolName === "createDocument" && input.pickedAngle && isRecord(r.output) && r.output.success === true && typeof r.output.postContent === "string") {
      return FIRST_DRAFT_LINE;
    }
    if (r.toolName === "updateDocument" && !input.userText.includes("?") && isRecord(r.output) && r.output.success === true && r.output.contentChanged === true) {
      return editClosingLine(typeof r.output.changeSummary === "string" ? r.output.changeSummary : "");
    }
  }
  return null;
}
