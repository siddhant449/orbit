import type { ChatUIMessage } from "./tools";

type Parts = ChatUIMessage["parts"];
type Part = Parts[number];

export const STOPPED_STEP = "This step stopped before it completed.";

const isTool = (p: Part) => p.type.startsWith("tool-");
const KEPT = new Set(["text", "step-start", "source-url", "file"]);

/**
 * What an assistant message stores: text, step boundaries, our tool parts, URL sources and files.
 * Reasoning, data parts (transient UI signals) and anything else are dropped. Text cut off mid-stream is
 * stored as done, since it will never stream again.
 */
export function toStoredParts(parts: Parts): Parts {
  return parts
    .filter((p) => KEPT.has(p.type) || isTool(p))
    .map((p) => {
      if (p.type === "text" && p.state === "streaming") return { ...p, state: "done" as const };
      if (isTool(p)) return safeToolError(p);
      return p;
    });
}

const ERROR_TEXT_CHARS = 500;

/**
 * Provider-executed tool errors bypass our stream `onError`, so their text is raw provider data: store a
 * plain sentence instead. Our own error texts are already safe; they are only capped.
 */
function safeToolError(p: Part): Part {
  const t = p as Part & { state?: string; errorText?: string; providerExecuted?: boolean };
  if (t.state !== "output-error" || typeof t.errorText !== "string") return p;
  if (t.providerExecuted) return { ...t, errorText: `The ${p.type.slice("tool-".length)} step failed.` } as Part;
  if (t.errorText.length <= ERROR_TEXT_CHARS) return p;
  return { ...t, errorText: `${t.errorText.slice(0, ERROR_TEXT_CHARS - 1)}…` } as Part;
}

/**
 * After an abort, tool parts that never got a result would replay as dangling calls. Rewrite those
 * still in `input-streaming` / `input-available` to `output-error` with a plain note. Pure.
 */
export function finalizeAbortedParts(parts: Parts): Parts {
  return parts.map((p) => {
    if (!isTool(p)) return p;
    const t = p as Part & { state?: string; input?: unknown };
    if (t.state !== "input-streaming" && t.state !== "input-available") return p;
    return { ...t, state: "output-error", input: t.input ?? {}, errorText: STOPPED_STEP } as unknown as Part;
  });
}
