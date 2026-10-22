type Keyed = { id: string; role: string };

/**
 * React keys for the thread. A reply is keyed by the user message it answers ("reply:<userId>"), and the "Thinking"
 * row shown before its first chunk uses the same key, so the row becomes the reply in place: one element, no remount,
 * no second arrive animation. Keys come from the full list (hidden quick-link messages included) and never change once
 * given. A second reply in a row, or one with no user message before it, keeps its own id.
 */
export function messageKeys(messages: readonly Keyed[]): Map<string, string> {
  const keys = new Map<string, string>();
  let prev: Keyed | undefined;
  for (const m of messages) {
    keys.set(m.id, m.role !== "user" && prev?.role === "user" ? `reply:${prev.id}` : m.id);
    prev = m;
  }
  return keys;
}

/** The key the waiting reply takes: the one its answer will have. Null unless the last message is the user's. */
export function waitingKey(messages: readonly Keyed[]): string | null {
  const last = messages.at(-1);
  return last?.role === "user" ? `reply:${last.id}` : null;
}
