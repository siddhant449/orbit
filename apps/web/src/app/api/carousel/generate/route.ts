import { createAiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { getSelectedVoice } from "@brandloop/db";
import { isMockMode } from "@/lib/chat-deps";
import { makeGenerateHandler } from "@/lib/carousel/api";

// Mock mode (`AI_MOCK_MODEL=1`, dev and e2e only) answers with the scripted slides; otherwise OpenAI behind AiClient.
export const POST = makeGenerateHandler({
  ai: () => (isMockMode() ? scriptedAi() : createAiClient()),
  aiAvailable: () => isMockMode() || Boolean(process.env.OPENAI_API_KEY),
  voice: async (profileId) => {
    const v = await getSelectedVoice(profileId);
    return v ? { name: v.name, guide: v.guide } : null;
  },
});
