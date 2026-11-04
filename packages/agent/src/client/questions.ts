/** Client-safe helpers for the question dock (a writer handoff that needs details only the user knows). */
export type DockQuestion = { text: string; suggestions: string[] };
export type QuestionSet = { toolCallId: string; questions: DockQuestion[] };

type MessageLike = { role: string; parts: unknown[] };
type PartLike = { type?: string; state?: string; toolCallId?: string; output?: unknown };

export const MAX_QUESTIONS = 5;
export const MAX_SUGGESTIONS = 3;
export const MAX_SUGGESTION_CHARS = 90;
export const ANSWERS_PREFIX = "Here are my answers:";

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * The questions the latest assistant message still waits on: its last finished `tool-delegateWriting` with readiness
 * "needs-user-input" and at least one question. Null once the user has replied after it, so older turns render as text.
 */
export function questionSetOf(messages: MessageLike[]): QuestionSet | null {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return null;
  const parts = (last.parts as PartLike[]).filter((p) => p.type === "tool-delegateWriting" && p.state === "output-available" && typeof p.toolCallId === "string");
  const part = parts.at(-1);
  const payload = (part?.output as { payload?: { readiness?: unknown; missingFacts?: unknown; suggestions?: unknown }; missingInput?: unknown } | null | undefined);
  if (!part || payload?.payload?.readiness !== "needs-user-input") return null;
  const raw = strings(payload.payload.missingFacts);
  const source = raw.length > 0 ? raw : strings(payload.missingInput);
  const suggested = Array.isArray(payload.payload.suggestions) ? (payload.payload.suggestions as unknown[]) : [];
  const seen = new Set<string>();
  const questions: DockQuestion[] = [];
  source.forEach((q, i) => {
    const text = q.replace(/\s+/g, " ").trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key) || questions.length >= MAX_QUESTIONS) return;
    seen.add(key);
    const own = new Set<string>();
    const suggestions = strings(suggested[i]).flatMap((s) => {
      const t = s.replace(/\s+/g, " ").trim();
      if (!t || t.length > MAX_SUGGESTION_CHARS || own.has(t.toLowerCase()) || own.size >= MAX_SUGGESTIONS) return [];
      own.add(t.toLowerCase());
      return [t];
    });
    questions.push({ text, suggestions });
  });
  return questions.length > 0 ? { toolCallId: part.toolCallId!, questions } : null;
}

/** The one user message that carries every answer. */
export function formatAnswers(questions: { text: string }[], answers: string[]): string {
  const blocks = questions.map((q, i) => `${i + 1}. ${q.text}\n${(answers[i] ?? "").trim()}`);
  return `${ANSWERS_PREFIX}\n\n${blocks.join("\n\n")}`;
}
