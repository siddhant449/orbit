import { NextResponse } from "next/server";
import { deleteOwnStyle, getStyleProfile } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { layoutLine, pickReferencePost, type StyleSummary } from "@/lib/style-summary";

/** A writing style with its measured layout: a preset, or the current profile's own style. Anything else is a 404. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });
  const { id } = await ctx.params;
  const found = await getStyleProfile(currentProfile.id, id);
  if (!found) return NextResponse.json({ error: "Writing style not found" }, { status: 404 });
  const { style, profile } = found;
  const body: StyleSummary = {
    id: style.id,
    name: style.name,
    tagline: style.tagline,
    own: style.kind === "OWN",
    status: style.status,
    statusDetail: style.statusDetail,
    analyzedPostCount: style.analyzedPostCount,
    profile: profile
      ? { voiceTarget: profile.voiceTarget, layoutLine: layoutLine(profile.layout), referencePost: pickReferencePost(profile), postCount: profile.source.postCount }
      : null,
  };
  return NextResponse.json(body);
}

/** Removes the profile's own style (a preset or someone else's is a 404). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    await deleteOwnStyle(currentProfile.id, id);
  } catch {
    return NextResponse.json({ error: "Writing style not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
