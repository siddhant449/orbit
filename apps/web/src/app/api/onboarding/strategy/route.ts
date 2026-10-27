import { NextResponse } from "next/server";
import { bindUsage, createAiClient } from "@brandloop/ai";
import { scriptedAi } from "@brandloop/agent";
import { audienceText, draftStrategy, getOnboarding, ONBOARDING_GOALS } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { isMockMode } from "@/lib/chat-deps";
import { AI_UNAVAILABLE_MESSAGE, requireAiFor } from "@/lib/run-job";

export const maxDuration = 120;

/**
 * POST /api/onboarding/strategy: drafts a strategy from the person's onboarding answers and returns it. Nothing is
 * saved; the review screen saves it only when the person confirms (finishAction).
 */
export async function POST() {
  const { currentProfile, user } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });
  const unavailable = await requireAiFor(currentProfile.id, user.id);
  if (unavailable) return unavailable;

  const { answers } = await getOnboarding(currentProfile.id);
  try {
    const ai = bindUsage(isMockMode() ? scriptedAi() : createAiClient(), { userId: user.id, profileId: currentProfile.id, feature: "onboarding" });
    const draft = await draftStrategy(ai, currentProfile.id, {
      goal: answers.goal ? ONBOARDING_GOALS[answers.goal.goal].label : undefined,
      goalNote: answers.goal?.note,
      audience: audienceText(answers.audience),
      offer: answers.offer,
      topics: answers.topics?.topics,
      stories: answers.topics?.stories,
    });
    // The goal the person chose decides the strategy's goal; the model only explains it.
    if (answers.goal) draft.goal = ONBOARDING_GOALS[answers.goal.goal].strategyGoal;
    return NextResponse.json({ strategy: draft });
  } catch (err) {
    console.error(`[onboarding] strategy draft failed: ${err instanceof Error ? err.message : String(err)}`);
    return NextResponse.json({ error: err instanceof Error && /OPENAI_API_KEY/.test(err.message) ? AI_UNAVAILABLE_MESSAGE : "Couldn't draft your strategy. Try again." }, { status: 502 });
  }
}
