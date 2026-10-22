/**
 * LinkedIn's "…see more" fold: the feed shows about the first 210 characters of a post, cut back to a word or line
 * boundary, and hides the rest behind "see more". What sits above the fold is the hook.
 */
export const FOLD_CHARS = 210;
/** How far back the fold may snap to reach a boundary; beyond this it cuts mid-word as LinkedIn does. */
const SNAP_WINDOW = 40;

/** The character offset where the fold falls, or null when the whole post shows. */
export function foldPoint(text: string, limit = FOLD_CHARS): number | null {
  if (text.length <= limit) return null;
  const head = text.slice(0, limit + 1);
  const floor = limit - SNAP_WINDOW;
  const line = head.lastIndexOf("\n");
  if (line >= floor) return line;
  const space = head.search(/\s\S*$/);
  if (space >= floor) return space;
  return limit;
}

/** The text above the fold (the whole post when it is short), without trailing whitespace. */
export function hookOf(text: string, limit = FOLD_CHARS): string {
  const at = foldPoint(text, limit);
  return (at === null ? text : text.slice(0, at)).trimEnd();
}
