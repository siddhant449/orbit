import { LIMITS } from "../limits";

/** Caps a tool's string output, ending with a marker the model can read. */
export function capOutput(text: string, max: number = LIMITS.toolOutputChars): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n[output truncated at ${max.toLocaleString("en-US")} characters]`;
}
