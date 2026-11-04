import { after } from "next/server";
import { createAiClient, createEmbedder, getModel, getModelById, webSearchTool } from "@brandloop/ai";
import { createChatSafety } from "@/lib/chat-safety";
import { fakeEmbedder } from "@brandloop/ai/testing";
import { visualsEnabled } from "@/lib/visuals/deps";
import { visualsToolDeps } from "@/lib/visuals/chat-tools";
import { createScriptedChatModel, fakeResearchProvider, getRunRegistry, scriptedAi, selectResearchProvider, type ChatDeps } from "@brandloop/agent";

/**
 * Offline mode for dev and e2e: `AI_MOCK_MODEL=1` swaps in the keyword-scripted chat model, the scripted
 * specialist client and the hashing embedder. Production ignores it, whatever the flag says.
 */
export function isMockMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_MOCK_MODEL === "1" && env.NODE_ENV !== "production";
}

/**
 * Next's `after`, called from the turn's `onEnd`. That can fire after the browser left (the registry keeps
 * the turn running), so if Next no longer has a request scope the work just runs in the background.
 */
function afterResponse(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    void fn().catch((err) => console.error(`[chat] background work failed: ${err instanceof Error ? err.message : String(err)}`));
  }
}

/** The chat turn's dependencies for this request. Building them never reads the API key. */
export function getChatDeps(modelId?: string | null): ChatDeps {
  const base = {
    registry: getRunRegistry(),
    after: afterResponse,
    visuals: visualsEnabled() ? visualsToolDeps : null,
    safety: createChatSafety({ mock: isMockMode() }),
  };
  if (isMockMode()) {
    const pace = Number(process.env.AI_MOCK_CHUNK_MS);
    const model = createScriptedChatModel(Number.isFinite(pace) && pace > 0 ? { chunkDelayMs: pace } : {});
    return { ...base, model, ai: scriptedAi(), embedder: fakeEmbedder(), webSearchTool: null, research: fakeResearchProvider() };
  }
  const search = webSearchTool();
  return {
    ...base,
    model: modelId ? getModelById(modelId) : getModel("generate"),
    ai: createAiClient(),
    embedder: createEmbedder(),
    webSearchTool: search,
    // Dated research: OpenAI's web search through the extract model by default, Perplexity when RESEARCH_PROVIDER says so.
    research: selectResearchProvider(process.env, { model: getModel("extract"), webSearch: search }),
  };
}
