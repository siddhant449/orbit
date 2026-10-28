import type { LanguageModel, Tool } from "ai";
import { generateText } from "ai";
import { classifyAiError, isProviderDown, recordFallbackSuccess, reportProviderError } from "@brandloop/ai";
import type { ResearchWindow } from "./window";

export type Citation = { url: string; title: string; snippet: string | null };
/** `usage` and `model` are the provider's own accounting when it reports any (read by the usage ledger). */
export type SearchResult = { answer: string; citations: Citation[]; usage?: { inputTokens?: number | undefined; outputTokens?: number | undefined }; model?: string };
export interface ResearchProvider {
  id: "openai" | "perplexity" | "fake";
  search(q: { query: string; window: ResearchWindow; maxResults: number }, signal: AbortSignal): Promise<SearchResult>;
}

/** OpenAI's hosted web search through the existing provider (design §6.2). The citations are the URLs it really returned. */
export function openaiResearch(model: LanguageModel, webSearch: Tool, fallback: { model: LanguageModel; tool: Tool } | null = null): ResearchProvider {
  const run = async (m: LanguageModel, toolName: string, tool: Tool, q: { query: string; maxResults: number }, signal: AbortSignal, maxRetries?: number): Promise<SearchResult> => {
    const res = await generateText({
      model: m,
      tools: { [toolName]: tool },
      // Gemini cannot be forced to call its grounding tool by name; it searches on its own for a news question.
      ...(toolName === "web_search" ? { toolChoice: { type: "tool" as const, toolName } } : {}),
      prompt: q.query,
      abortSignal: signal,
      ...(maxRetries !== undefined ? { maxRetries } : {}),
    });
    // Only URLs the provider itself returned are citations.
    const citations = res.sources.flatMap((s): Citation[] => (s.sourceType === "url" ? [{ url: s.url, title: s.title ?? s.url, snippet: null }] : []));
    return { answer: res.text, citations: citations.slice(0, q.maxResults), usage: res.totalUsage ?? res.usage, model: typeof m === "string" ? m : m.modelId };
  };
  return {
    id: "openai",
    async search(q, signal) {
      try {
        return await run(model, "web_search", webSearch, q, signal);
      } catch (err) {
        // OpenAI is out of credits, rejecting the key or down: one try on Gemini with Google Search grounding.
        if (!fallback || signal.aborted || !isProviderDown(classifyAiError(err))) throw err;
        reportProviderError(err, "research search failed, trying the fallback");
        try {
          const out = await run(fallback.model, "google_search", fallback.tool, q, signal, 0);
          recordFallbackSuccess();
          return out;
        } catch (fbErr) {
          reportProviderError(fbErr, "research fallback failed");
          throw err;
        }
      }
    },
  };
}

const mdy = (ymd: string) => `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}/${ymd.slice(0, 4)}`;

/**
 * Perplexity, selected with RESEARCH_PROVIDER=perplexity. The window maps to its published date filters
 * (`search_after_date_filter`, `search_before_date_filter`, MM/DD/YYYY). Check the parameter names against the current
 * API reference before relying on it in production; unit tests use a fake fetch.
 */
export function perplexityResearch(apiKey: string, fetchImpl: typeof globalThis.fetch = globalThis.fetch): ResearchProvider {
  return {
    id: "perplexity",
    async search(q, signal) {
      const res = await fetchImpl("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: "sonar",
          messages: [{ role: "user", content: q.query }],
          search_after_date_filter: mdy(q.window.start),
          search_before_date_filter: mdy(q.window.end),
          web_search_options: { search_context_size: "medium" },
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Perplexity answered ${res.status}`);
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        citations?: string[];
        search_results?: { url: string; title?: string; snippet?: string }[];
      };
      const fromResults = (body.search_results ?? []).map((r) => ({ url: r.url, title: r.title ?? r.url, snippet: r.snippet ?? null }));
      const citations = fromResults.length ? fromResults : (body.citations ?? []).map((url) => ({ url, title: url, snippet: null }));
      return { answer: body.choices?.[0]?.message?.content ?? "", citations: citations.slice(0, q.maxResults) };
    },
  };
}

/** Perplexity when asked for and keyed; otherwise OpenAI's web search when its model and tool are supplied; otherwise none. */
export function selectResearchProvider(
  env: Record<string, string | undefined>,
  deps: { model?: LanguageModel | null; webSearch?: Tool | null; fallback?: { model: LanguageModel; tool: Tool } | null; fetch?: typeof globalThis.fetch } = {},
): ResearchProvider | null {
  if (env.RESEARCH_PROVIDER === "perplexity" && env.PERPLEXITY_API_KEY) return perplexityResearch(env.PERPLEXITY_API_KEY, deps.fetch);
  if (deps.model && deps.webSearch) return openaiResearch(deps.model, deps.webSearch, deps.fallback ?? null);
  return null;
}
