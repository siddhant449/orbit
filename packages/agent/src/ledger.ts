import type { ActiveTask } from "./types";

export type TurnOutcome = {
  requestMessageId: string;
  requestText: string;
  assistantText: string;
  status: "finished" | "aborted" | "error";
  toolResults: { toolName: string; ok: boolean }[];
  handoffs: ActiveTask["handoffs"];
  artifact: { id: string; title: string } | null;
  flow: { id: string; step: string } | null;
  picker: { id: string; question: string } | null;
  now: Date;
};

const MAX_HANDOFFS = 5;
const MAX_DIRECTIONS = 5;
const MAX_ACTIONS = 10;
const MAX_TEXT = 300;
/** A successful one of these finishes the user's request even if the reply offers a follow-up question. */
const DOCUMENT_ACTIONS = new Set(["createDocument", "updateDocument"]);

const clip = (text: string, max = MAX_TEXT) => {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** The last sentence of a reply when it ends in a question mark, else null. */
function trailingQuestion(text: string): string | null {
  const t = text.trim();
  if (!t.endsWith("?")) return null;
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  return clip(sentences.at(-1) ?? t);
}

/**
 * The task ledger reducer (design §7.1), run once per finished, aborted or failed turn.
 * A task continues while the previous one is still active; otherwise a new one starts.
 * The artifact always carries over; the lists are rolling windows.
 */
export function nextActiveTask(prev: ActiveTask | null, turn: TurnOutcome, newId: () => string): ActiveTask {
  const continuing = prev?.status === "active";
  const documentDone = turn.toolResults.some((r) => r.ok && DOCUMENT_ACTIONS.has(r.toolName));
  const question = trailingQuestion(turn.assistantText);
  const needsInput = turn.handoffs.some((h) => h.hasMissingInput || h.readiness === "needs-user-input");

  let status: ActiveTask["status"];
  let pendingQuestion: string | null = null;
  if (turn.status !== "finished") {
    status = "failed";
  } else if (turn.picker) {
    status = "active";
    pendingQuestion = clip(turn.picker.question);
  } else if (needsInput) {
    status = "active";
    pendingQuestion = question;
  } else if (question && !documentDone) {
    status = "active";
    pendingQuestion = question;
  } else {
    status = "completed";
  }

  const request = clip(turn.requestText);
  const directions = [...(prev?.recentDirections ?? [])];
  if (request) directions.push({ text: request, messageId: turn.requestMessageId });
  const actions = [...(prev?.completedActions ?? []), ...turn.toolResults.filter((r) => r.ok).map((r) => r.toolName)];
  const handoffs = [...(continuing ? prev!.handoffs : []), ...turn.handoffs];

  return {
    version: 1,
    taskId: continuing ? prev!.taskId : newId(),
    status,
    attempt: continuing ? prev!.attempt + 1 : 1,
    artifact: turn.artifact ?? prev?.artifact ?? null,
    latestRequest: request,
    requestMessageId: turn.requestMessageId,
    handoffs: handoffs.slice(-MAX_HANDOFFS),
    completedActions: actions.slice(-MAX_ACTIONS),
    recentDirections: directions.slice(-MAX_DIRECTIONS),
    pendingQuestion,
    missingFacts: needsInput ? [...new Set(turn.handoffs.flatMap((h) => h.missingFacts))].slice(0, 5) : [],
    flow: turn.flow,
    pendingPicker: turn.picker,
    updatedAt: turn.now.toISOString(),
  };
}

/** The `<active_task>` block body for the next prompt. */
export function renderActiveTask(task: ActiveTask | null): string {
  if (!task) return "No active task.";
  const lines = [
    `task: ${task.taskId}`,
    `status: ${task.status}`,
    `attempt: ${task.attempt}`,
    `artifact: ${task.artifact ? `${task.artifact.id} | ${task.artifact.title}` : "none"}`,
    `latest request: ${task.latestRequest || "(none)"}`,
  ];
  if (task.pendingQuestion) lines.push(`pending question: ${task.pendingQuestion}`);
  if (task.missingFacts.length > 0) lines.push(`missing facts: ${task.missingFacts.join(" | ")}`);
  if (task.pendingPicker) lines.push(`pending picker: ${task.pendingPicker.id} | ${task.pendingPicker.question}`);
  if (task.flow) lines.push(`flow: ${task.flow.id} | step ${task.flow.step}`);
  if (task.handoffs.length > 0) {
    lines.push("handoffs:");
    for (const h of task.handoffs) {
      const bits = [h.specialist, h.readiness, h.confidence && `confidence ${h.confidence}`, h.parentAction, h.hasMissingInput && "missing input"];
      lines.push(`- ${h.id}: ${bits.filter(Boolean).join(", ")}`);
    }
  }
  if (task.completedActions.length > 0) lines.push(`completed actions: ${task.completedActions.join(", ")}`);
  if (task.recentDirections.length > 0) {
    lines.push("recent directions:");
    for (const d of task.recentDirections) lines.push(`- ${d.text}`);
  }
  return lines.join("\n");
}
