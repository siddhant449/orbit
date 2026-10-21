import { MemoryVersionConflict } from "@brandloop/db";
import { frameData, type DataSource } from "../data";
import { LIMITS } from "../limits";
import { capOutput } from "./cap";

export const MEMORY_CONFLICT = "Failed: your memory changed while saving. Read it again and retry.";

/** An abort or cancellation: `AbortError` (fetch, an aborted signal, our own) or `TimeoutError` (the turn deadline's `AbortSignal.timeout`). */
export function isAbort(err: unknown): boolean {
  if (err instanceof Error || (typeof DOMException !== "undefined" && err instanceof DOMException)) {
    return (err as Error).name === "AbortError" || (err as Error).name === "TimeoutError";
  }
  return false;
}

/**
 * Runs a tool body so expected failures come back as `Failed: …` results the model can recover from,
 * never as throws into the stream. Data-bearing output is framed (see `frameData`), then capped.
 * Unexpected errors are logged by message only (no stack, no payload) and reported generically.
 */
export async function runTool(
  name: string,
  source: DataSource | null,
  body: () => Promise<string>,
  max: number = LIMITS.toolOutputChars,
): Promise<string> {
  let text: string;
  try {
    text = await body();
  } catch (err) {
    // A stopped turn must unwind, not report the cancellation to the model as a tool failure.
    if (isAbort(err)) throw err;
    if (err instanceof MemoryVersionConflict) return MEMORY_CONFLICT;
    console.error(`[agent] tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`);
    return `Failed: something went wrong running ${name}.`;
  }
  return capOutput(source ? frameData(source, text) : text, max);
}
