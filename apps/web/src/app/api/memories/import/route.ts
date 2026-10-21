import { NextResponse } from "next/server";
import { importMemories } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { requireAi, startJob } from "@/lib/run-job";

export async function POST(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Paste something to import" }, { status: 400 });
  if (text.length > 50_000) {
    return NextResponse.json({ error: "That's too long. Keep it under 50,000 characters." }, { status: 400 });
  }

  const unavailable = requireAi();
  if (unavailable) return unavailable;

  const { jobId } = await startJob("MEMORY_IMPORT", currentProfile.id, { length: text.length }, (ai) =>
    importMemories(ai, currentProfile.id, text),
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
