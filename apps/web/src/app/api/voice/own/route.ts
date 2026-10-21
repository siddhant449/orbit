import { NextResponse } from "next/server";
import { createOwnVoice, validateVoicePosts } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { requireAi, startJob } from "@/lib/run-job";

export async function POST(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as { posts?: unknown } | null;
  const raw = Array.isArray(body?.posts) ? body.posts : [];
  let posts: string[];
  try {
    posts = validateVoicePosts(raw.filter((p): p is string => typeof p === "string"));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const unavailable = requireAi();
  if (unavailable) return unavailable;

  const { jobId } = await startJob("VOICE_EXTRACT", currentProfile.id, { posts: posts.length }, (ai) =>
    createOwnVoice(ai, currentProfile.id, posts),
  );
  return NextResponse.json({ jobId }, { status: 202 });
}
