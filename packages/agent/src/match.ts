/**
 * How often `needle` occurs in `text`, overlapping matches included ("ha ha" occurs twice in "ha ha ha"). Shared by
 * the proposal tool, the apply step and the thread's proposal card, so "exactly once" means the same everywhere.
 * Client-safe: no imports.
 */
export function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) n++;
  return n;
}
