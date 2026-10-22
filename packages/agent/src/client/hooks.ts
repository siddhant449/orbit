/** Client-safe helpers for the hook cards (Task W7). */
export type HookCard = {
  index: number;
  text: string;
  purposeLabel: string;
  charCount: number;
  mobileLines: number;
  spine: { claim: string; mustDeliver: string; bodyShape: string };
};

/** The cards of a finished `generateHooks` call, or null for anything else (a failure string, a partial output). */
export function parseHookCards(output: unknown): HookCard[] | null {
  const hooks = (output as { success?: unknown; hooks?: unknown } | null)?.hooks;
  if (!Array.isArray(hooks) || (output as { success?: unknown }).success !== true) return null;
  const cards = hooks.flatMap((h): HookCard[] => {
    const o = h as Partial<HookCard> | null;
    if (!o || typeof o.text !== "string" || typeof o.purposeLabel !== "string" || typeof o.index !== "number") return [];
    return [{ index: o.index, text: o.text, purposeLabel: o.purposeLabel, charCount: o.charCount ?? o.text.length, mobileLines: o.mobileLines ?? 1, spine: o.spine ?? { claim: "", mustDeliver: "", bodyShape: "" } }];
  });
  return cards.length ? cards.slice(0, 8) : null;
}

/** "1 line · 48 chars". */
export function hookMeta(c: Pick<HookCard, "mobileLines" | "charCount">): string {
  return `${c.mobileLines} ${c.mobileLines === 1 ? "line" : "lines"} · ${c.charCount} chars`;
}

/** The post with its opening block (everything before the first blank line) replaced by the hook. */
export function swapOpening(text: string, hook: string): string {
  const body = text.replace(/\r\n?/g, "\n").trim();
  const at = body.search(/\n[ \t]*\n/);
  return at === -1 ? hook.trim() : `${hook.trim()}${body.slice(at)}`;
}
