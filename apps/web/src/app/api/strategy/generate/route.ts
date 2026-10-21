import { NextResponse } from "next/server";
import { generateStrategy } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { requireAi, startJob } from "@/lib/run-job";

export async function POST() {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const unavailable = requireAi();
  if (unavailable) return unavailable;

  const { jobId } = await startJob("STRATEGY_GENERATE", currentProfile.id, {}, (ai) =>
    generateStrategy(ai, currentProfile.id),
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
