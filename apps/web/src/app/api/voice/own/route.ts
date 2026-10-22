import { NextResponse } from "next/server";
import { extractOwnStyle, MAX_EXPORT_BYTES, parseSharesExport, prepareOwnStyle, validateStylePosts } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { requireAi, startJob } from "@/lib/run-job";

/**
 * Learn the profile's own writing style. Accepts `{posts}` JSON (3-30 pasted posts) or a multipart LinkedIn export
 * (`file`: Shares.csv or the export zip, 10 MB at most). Answers 202 with the job and the style, which is PENDING
 * until the STYLE_EXTRACT job has compiled it.
 */
export async function POST(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  let posts: string[];
  let source: "PASTE" | "EXPORT" = "PASTE";
  let postedAt: (Date | null)[] = [];
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const file = (await request.formData()).get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Choose your LinkedIn export file" }, { status: 400 });
      if (file.size > MAX_EXPORT_BYTES) return NextResponse.json({ error: "That file is larger than 10 MB. Upload just Shares.csv." }, { status: 413 });
      const parsed = parseSharesExport(new Uint8Array(await file.arrayBuffer()), file.name);
      posts = validateStylePosts(parsed.posts.map((p) => p.text), { max: 100 });
      postedAt = parsed.posts.map((p) => p.postedAt);
      source = "EXPORT";
    } else {
      const body = (await request.json().catch(() => null)) as { posts?: unknown } | null;
      const raw = Array.isArray(body?.posts) ? body.posts : [];
      posts = validateStylePosts(raw.filter((p): p is string => typeof p === "string"));
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const unavailable = requireAi();
  if (unavailable) return unavailable;

  const { voiceStyleId } = await prepareOwnStyle(currentProfile.id, posts, source, postedAt);
  const { jobId } = await startJob("STYLE_EXTRACT", currentProfile.id, { voiceStyleId, posts: posts.length }, (ai) =>
    extractOwnStyle(ai, currentProfile.id, voiceStyleId),
  );
  return NextResponse.json({ jobId, voiceStyleId }, { status: 202 });
}
