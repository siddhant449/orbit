/**
 * The chat's post side panel (design §9), as a pure reducer over the `data-*` stream parts that createDocument
 * (and, later, updateDocument) write: `data-creating` / `data-updating` flags, transient 40-character
 * `data-textDelta` chunks, and the final `data-document` snapshot.
 */

export type PanelDoc = { id: string; title: string; version: number; text: string };

export type PanelState = {
  open: boolean;
  creating: boolean;
  updating: boolean;
  doc: PanelDoc | null;
  /** Set by `data-updating`: the next delta replaces the text instead of appending to the old version. */
  restart?: boolean;
};

/** LinkedIn's post length. Longer posts can be saved; the panel flags them. */
export const POST_CHAR_LIMIT = 3000;

export const emptyPanel = (): PanelState => ({ open: false, creating: false, updating: false, doc: null });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function asDoc(v: unknown): PanelDoc | null {
  if (!isObj(v)) return null;
  const { id, title, version, text } = v;
  if (typeof id !== "string" || typeof title !== "string" || typeof version !== "number" || typeof text !== "string") return null;
  return { id, title, version, text };
}

/** Folds one stream part into the panel. Parts it doesn't know, or with malformed data, leave it as it is. */
export function applyDataPart(state: PanelState, part: { type: string; data: unknown }): PanelState {
  switch (part.type) {
    case "data-creating":
    case "data-updating": {
      if (typeof part.data !== "boolean") return state;
      const key = part.type === "data-creating" ? "creating" : "updating";
      if (part.data) return { ...state, open: true, [key]: true, restart: key === "updating" ? true : state.restart };
      return { ...state, [key]: false, ...(key === "updating" ? { restart: false } : {}) };
    }
    case "data-textDelta": {
      if (!isObj(part.data) || typeof part.data.id !== "string" || typeof part.data.text !== "string") return state;
      const { id, text } = part.data;
      if (state.doc?.id === id) {
        const base = state.restart ? "" : state.doc.text;
        return { ...state, restart: false, doc: { ...state.doc, text: base + text } };
      }
      // A new post starts streaming before its snapshot exists; the title arrives with `data-document`.
      if (state.creating) return { ...state, open: true, doc: { id, title: "", version: 0, text } };
      return state;
    }
    case "data-document": {
      const doc = asDoc(part.data);
      if (!doc) return state;
      return { open: true, creating: false, updating: false, restart: false, doc };
    }
    default:
      return state;
  }
}

/** The panel for a loaded post (page load, refetch, restore). No post closes it. */
export function withDocument(state: PanelState, doc: PanelDoc | null): PanelState {
  if (!doc) return { ...state, open: false, doc: null };
  return { ...state, open: true, doc };
}

export function charCount(text: string): { count: number; over: boolean } {
  const count = text.length;
  return { count, over: count > POST_CHAR_LIMIT };
}
