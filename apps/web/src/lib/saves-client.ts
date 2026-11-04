/** Browser-side calls for saves and spaces (the routes in `saves-api.ts`). */
export type SavedKind = "TEMPLATE" | "HOOK" | "IDEA" | "POST" | "VISUAL";
export type SpaceDto = { id: string; name: string; description: string | null; pinned: boolean; position: number; itemCount: number };
export type SavedItemDto = {
  id: string;
  kind: SavedKind;
  refId: string | null;
  snapshot: Record<string, unknown>;
  spaceIds: string[];
  available: boolean;
  createdAt: string;
};
export type SavedPage = { items: SavedItemDto[]; nextCursor: string | null };

export const SPACES_KEY = "/api/spaces";
export const savesKey = (params: Record<string, string | undefined> = {}) => {
  const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  return `/api/saves${q.size ? `?${q}` : ""}`;
};
/** SWR key matcher for everything under /api/saves and /api/spaces (used to refresh lists after a change). */
export const isSavesKey = (key: unknown) => typeof key === "string" && (key.startsWith("/api/saves") || key.startsWith("/api/spaces"));

export async function fetchJson<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

/** The saved item for a ref (or for hook/idea text), if there is one. */
export async function lookupSaved(kind: SavedKind, ref: { refId?: string; text?: string }): Promise<SavedItemDto | null> {
  const page = await fetchJson<SavedPage>(savesKey({ kind, ref: ref.refId, text: ref.refId ? undefined : ref.text, limit: "1" }));
  return page.items[0] ?? null;
}

/** The line a saved item shows, whatever its kind. */
export function itemTitle(i: SavedItemDto): string {
  const s = i.snapshot;
  const pick = (k: string) => (typeof s[k] === "string" && (s[k] as string).trim() ? (s[k] as string).trim() : null);
  return pick("title") ?? pick("text") ?? "Saved item";
}
