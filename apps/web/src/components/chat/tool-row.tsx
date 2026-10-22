import { isToolError, type ToolState } from "@brandloop/agent/client";

/** A tool part as the thread reads it (static `tool-<name>` parts and `dynamic-tool` parts). */
export type ToolPartLike = { type: string; state?: string; output?: unknown; errorText?: string; toolName?: string; input?: unknown };

export function toolNameOf(part: ToolPartLike): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "") : part.type.slice("tool-".length);
}

export function toolStateOf(part: ToolPartLike): ToolState {
  if (part.state === "output-error" || part.state === "output-denied") return "error";
  if (part.state === "output-available") return isToolError(part.output) ? "error" : "done";
  return "active";
}
