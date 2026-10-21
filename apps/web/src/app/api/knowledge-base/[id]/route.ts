import { NextResponse } from "next/server";
import { deleteKnowledge, getProfileKnowledge, updateKnowledge } from "@brandloop/db";
import { getAccount } from "@/lib/account";
import { knowledgeErrorResponse, publicItem, startIngest, uploadStore } from "@/lib/knowledge";

type Ctx = { params: Promise<{ id: string }> };
const noProfile = () => NextResponse.json({ error: "Create a profile first" }, { status: 400 });

export async function GET(_request: Request, { params }: Ctx) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return noProfile();
  const item = await getProfileKnowledge(currentProfile.id, (await params).id);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ item: publicItem(item, true) });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return noProfile();
  const body = (await request.json().catch(() => null)) as { title?: unknown; content?: unknown } | null;
  try {
    const { item, contentChanged } = await updateKnowledge(currentProfile.id, (await params).id, {
      title: typeof body?.title === "string" ? body.title : undefined,
      content: typeof body?.content === "string" ? body.content : undefined,
    });
    // Changed content re-summarises and re-indexes in the background.
    if (contentChanged) await startIngest(currentProfile.id, item.id);
    return NextResponse.json({ item: publicItem(item, true) });
  } catch (err) {
    return knowledgeErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return noProfile();
  try {
    await deleteKnowledge(currentProfile.id, (await params).id, uploadStore);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return knowledgeErrorResponse(err);
  }
}
