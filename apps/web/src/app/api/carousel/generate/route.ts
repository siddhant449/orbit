import { auth } from "@clerk/nextjs/server";
import { createAiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { getSelectedVoice } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { GENERATE_LIMIT, makeGenerateHandler } from "@/lib/carousel/api";
import { createThrottle } from "@/lib/carousel/throttle";

// Mock mode (`AI_MOCK_MODEL=1`, dev and e2e only) answers with the scripted slides; otherwise OpenAI behind AiClient.
export const POST = makeGenerateHandler({
  // Checked before getAccount, which would redirect a signed-out request to the sign-in page instead of answering 401.
  session: async () => {
    const { userId } = await auth();
    if (!userId) return { signedIn: false };
    return { signedIn: true, profileId: (await getAccount()).currentProfile?.id ?? null };
  },
  ai: () => (isMockMode() ? scriptedAi() : createAiClient()),
  aiAvailable: () => isMockMode() || Boolean(process.env.OPENAI_API_KEY),
  voice: async (profileId) => {
    const v = await getSelectedVoice(profileId);
    return v ? { name: v.name, guide: v.guide } : null;
  },
  // Dev and e2e runs (mock model, no cost) get headroom so repeated specs never trip the limit.
  throttle: createThrottle(isMockMode() ? { ...GENERATE_LIMIT, limit: 1000 } : GENERATE_LIMIT),
});
