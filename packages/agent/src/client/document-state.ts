/**
 * The chat's post side panel (design §9), as a pure reducer over the `data-*` stream parts that createDocument
 * (and, later, updateDocument) write: `data-creating` / `data-updating` flags, transient 40-character
 * `data-textDelta` chunks, and the final `data-document` snapshot.
 */

/** `version` is the concurrency token (it only goes up); `currentVersion` is the number of the version being shown. */
export type PanelDoc = { id: string; title: string; version: number; currentVersion?: number; text: string };

export type PanelState = {
  open: boolean;
  creating: boolean;
  updating: boolean;
  doc: PanelDoc | null;
  /** Set when a stream starts: its first delta replaces the text (an update, or a replay after resume). */
  restart?: boolean;
  /** The user closed the panel: snapshots and refetches keep it closed; only a new stream reopens it. */
  dismissed?: boolean;
};

/** LinkedIn's post length. Longer posts can be saved; the panel flags them. */
export const POST_CHAR_LIMIT = 3000;

export const emptyPanel = (): PanelState => ({ open: false, creating: false, updating: false, doc: null });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function asDoc(v: unknown): PanelDoc | null {
  if (!isObj(v)) return null;
  const { id, title, version, text } = v;
  if (typeof id !== "string" || typeof title !== "string" || typeof version !== "number" || typeof text !== "string") return null;
  return { id, title, version, ...(typeof v.currentVersion === "number" ? { currentVersion: v.currentVersion } : {}), text };
}

/** Folds one stream part into the panel. Parts it doesn't know, or with malformed data, leave it as it is. */
export function applyDataPart(state: PanelState, part: { type: string; data: unknown }): PanelState {
  switch (part.type) {
    case "data-creating":
    case "data-updating": {
      if (typeof part.data !== "boolean") return state;
      const key = part.type === "data-creating" ? "creating" : "updating";
      // A stream start is a new request: it opens the panel and its first delta starts the text over.
      if (part.data) return { ...state, open: true, dismissed: false, [key]: true, restart: true };
      return { ...state, [key]: false, restart: false };
    }
    case "data-textDelta": {
      if (!isObj(part.data) || typeof part.data.id !== "string" || typeof part.data.text !== "string") return state;
      // Deltas belong to a running stream; one that arrives after the snapshot (or a duplicate tail) is dropped.
      if (!state.creating && !state.updating) return state;
      const { id, text } = part.data;
      const open = state.open || !state.dismissed;
      if (state.doc?.id === id) {
        const base = state.restart ? "" : state.doc.text;
        return { ...state, open, restart: false, doc: { ...state.doc, text: base + text } };
      }
      // A new post streams before its snapshot exists; the title and version arrive with `data-document`.
      if (state.creating) return { ...state, open, restart: false, doc: { id, title: "", version: 0, text } };
      return state;
    }
    case "data-document": {
      const doc = asDoc(part.data);
      if (!doc) return state;
      const settled = { ...state, creating: false, updating: false, restart: false };
      if (state.doc?.id === doc.id && state.doc.version > doc.version) return settled;
      return { ...settled, open: state.open || !state.dismissed, doc };
    }
    default:
      return state;
  }
}

/** The stream ended (finished, failed or stopped) without saying so: no flag stays on. */
export function endStream(state: PanelState): PanelState {
  if (!state.creating && !state.updating && !state.restart) return state;
  return { ...state, creating: false, updating: false, restart: false };
}

/**
 * At the end of a turn (before `endStream`): the panel's text may be cut short and must be reloaded from the server,
 * because a create or update stream was still running (a stop or a dropped connection lands between deltas), or the
 * post never got its snapshot. Without this a later save would write the truncated text over the real post.
 */
export function settleNeedsRefetch(state: PanelState): boolean {
  if (!state.doc) return false;
  return state.doc.version === 0 || state.creating || state.updating || Boolean(state.restart);
}

/** The user closed the panel. */
export function closePanel(state: PanelState): PanelState {
  return { ...state, open: false, dismissed: true };
}

/** The user opened the panel. */
export function openPanel(state: PanelState): PanelState {
  return state.doc || state.creating || state.updating ? { ...state, open: true, dismissed: false } : state;
}

/**
 * The panel for a loaded post (page load, refetch, restore, recovery). It also ends any stream that died, so the
 * stored post is never shown as still being written. No post closes it; a closed panel stays closed.
 */
export function withDocument(state: PanelState, doc: PanelDoc | null): PanelState {
  const settled = { ...state, creating: false, updating: false, restart: false };
  if (!doc) return { ...settled, open: false, doc: null };
  return { ...settled, open: state.open || !state.dismissed, doc };
}

/**
 * What a screen reader hears when the panel changes (polite, state changes only, never per delta). "Ready" keys
 * on the post going from none (or an unsaved stream) to a saved version, so a burst that lands in one render,
 * with the flags never seen on, still announces it.
 */
export function panelCue(prev: PanelState, next: PanelState): string | null {
  if (next.creating && !prev.creating) return "Creating your post…";
  if (next.updating && !prev.updating) return "Updating your post…";
  const before = prev.doc;
  const after = next.doc;
  if (after && after.version >= 1 && (!before || before.version < 1)) return "Your post is ready.";
  if (after && before && after.id === before.id && after.version > before.version) return `Updated. Version ${after.version}.`;
  return null;
}

export function charCount(text: string): { count: number; over: boolean } {
  const count = text.length;
  return { count, over: count > POST_CHAR_LIMIT };
}
