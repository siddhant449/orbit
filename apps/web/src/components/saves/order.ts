/** Moves the id at `from` to `to` and returns a new array; out-of-range positions are clamped. */
export function moveItem(ids: string[], from: number, to: number): string[] {
  if (from < 0 || from >= ids.length) return ids;
  const next = ids.slice();
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item!);
  return next;
}
