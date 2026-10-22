/** Turns a stored assistant message's parts into what the eval records and the judge reads. */

export type ToolCall = { name: string; state: string; ok: boolean; input: string; output: string };
export type PartsSummary = { tools: ToolCall[]; text: string };

const FAILED = /^(Failed:|Refused:|EXISTING_POST:|EDIT_REQUIREMENTS_MISSED:|STALE_DOCUMENT:|STALE_SELECTED_PASSAGE:)/;

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
const show = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));

function worked(state: string, output: unknown): boolean {
  if (state !== "output-available") return false;
  if (typeof output === "string") return !FAILED.test(output);
  if (output && typeof output === "object") {
    const o = output as { error?: unknown; status?: unknown };
    if (typeof o.error === "string") return false;
    if (o.status === "needs-user-input") return false;
  }
  return true;
}

type AnyPart = { type: string; text?: string; state?: string; input?: unknown; output?: unknown; errorText?: string };

export function summarizeParts(parts: readonly unknown[]): PartsSummary {
  const tools: ToolCall[] = [];
  const text: string[] = [];
  for (const raw of parts as AnyPart[]) {
    if (raw.type === "text") text.push(raw.text ?? "");
    else if (raw.type.startsWith("tool-")) {
      const state = raw.state ?? "unknown";
      tools.push({
        name: raw.type.slice("tool-".length),
        state,
        ok: worked(state, raw.output),
        input: clip(show(raw.input), 300),
        output: clip(state === "output-error" ? `error: ${raw.errorText ?? ""}` : show(raw.output), 600),
      });
    }
  }
  return { tools, text: text.join("").trim() };
}
