import { NextResponse } from "next/server";
import { createKnowledge, listKnowledge, type KnowledgeType } from "@brandloop/db";
import { assertPublicUrl } from "@brandloop/knowledge";
import { getAccount } from "@/lib/account";
import { knowledgeErrorResponse, publicItem, startIngest } from "@/lib/knowledge";

const TYPES = ["TEXT", "DOCUMENT", "URL", "VIDEO", "IMAGE"] as const;
const isType = (v: unknown): v is KnowledgeType => TYPES.includes(v as KnowledgeType);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function GET(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });
  const params = new URL(request.url).searchParams;
  const type = params.get("type");
  const offset = Number.parseInt(params.get("offset") ?? "0", 10);
  const { items, hasMore } = await listKnowledge(currentProfile.id, {
    type: isType(type) ? type : undefined,
    q: params.get("q") ?? undefined,
    order: params.get("order") === "asc" ? "asc" : "desc",
    offset: Number.isFinite(offset) && offset > 0 ? offset : 0,
  });
  return NextResponse.json({ items: items.map((i) => publicItem(i)), hasMore });
}

/** Creates a TEXT, URL or VIDEO-link item. Files go through /api/upload. */
export async function POST(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const type = body?.type;
  if (type !== "TEXT" && type !== "URL" && type !== "VIDEO") {
    return NextResponse.json({ error: "Choose text, a link or a video link" }, { status: 400 });
  }

  try {
    if (type !== "TEXT") assertPublicUrl(str(body?.url) ?? "");
    const item = await createKnowledge(currentProfile.id, {
      type,
      title: str(body?.title),
      content: str(body?.content),
      sourceUrl: str(body?.url),
    });
    // TEXT items are already READY; the job only summarises and indexes. Summaries degrade to none without a key.
    await startIngest(currentProfile.id, item.id);
    return NextResponse.json({ item: publicItem(item) }, { status: 202 });
  } catch (err) {
    return knowledgeErrorResponse(err);
  }
}

