/**
 * OpenAI moderation (omni-moderation-latest) over plain fetch. Never throws: when the API is down or the key is missing the
 * check fails open and logs, so chat keeps working. Tests inject `moderate` instead of calling this.
 */
export type ModerationResult = { flagged: boolean; categories: string[] };
export type Moderate = (text: string) => Promise<ModerationResult>;

const CLEAR: ModerationResult = { flagged: false, categories: [] };

export function createModerator({ apiKey = process.env.OPENAI_API_KEY, fetchImpl, model = "omni-moderation-latest", timeoutMs = 4000 }: { apiKey?: string | undefined; fetchImpl?: typeof fetch; model?: string; timeoutMs?: number } = {}): Moderate {
  return async (text) => {
    if (!apiKey) {
      console.error("[moderation] no OPENAI_API_KEY, skipping the check");
      return CLEAR;
    }
    if (!text.trim()) return CLEAR;
    try {
      const res = await (fetchImpl ?? fetch)("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: text.slice(0, 30_000) }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`moderation answered ${res.status}`);
      const body = (await res.json()) as { results?: { flagged?: boolean; categories?: Record<string, boolean> }[] };
      const r = body.results?.[0];
      if (!r) throw new Error("moderation returned no result");
      return { flagged: r.flagged === true, categories: Object.entries(r.categories ?? {}).filter(([, v]) => v).map(([k]) => k) };
    } catch (err) {
      console.error(`[moderation] unavailable, letting the message through: ${err instanceof Error ? err.message : String(err)}`);
      return CLEAR;
    }
  };
}
