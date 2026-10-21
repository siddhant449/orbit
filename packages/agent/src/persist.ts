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
    .map((p) => (p.type === "text" && p.state === "streaming" ? { ...p, state: "done" as const } : p));
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
