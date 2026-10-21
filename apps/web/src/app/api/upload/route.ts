import { NextResponse } from "next/server";
import { createKnowledge } from "@brandloop/db";
import { IMAGE_TYPES, KNOWLEDGE_LIMITS, resolveUploadMime } from "@brandloop/knowledge";
import { getAccount } from "@/lib/account";
import { knowledgeErrorResponse, startIngest, uploadStore, publicItem } from "@/lib/knowledge";
import { requireAi } from "@/lib/run-job";

/** multipart/form-data with `file` and optional `title`. Creates a DOCUMENT or IMAGE item and starts ingestion. */
export async function POST(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return NextResponse.json({ error: "Create a profile first" }, { status: 400 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });

  const mime = resolveUploadMime(file.name, file.type);
  if (!mime) {
    return NextResponse.json(
      { error: "That file type isn't supported. Use PDF, DOCX, XLSX, TXT, MD, JPG, PNG, WebP or GIF." },
      { status: 400 },
    );
  }
  const isImage = mime in IMAGE_TYPES;
  const maxBytes = isImage ? KNOWLEDGE_LIMITS.imageBytes : KNOWLEDGE_LIMITS.documentBytes;
  if (file.size === 0) return NextResponse.json({ error: "That file is empty" }, { status: 400 });
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `Files must be under ${maxBytes / 1024 / 1024} MB` }, { status: 400 });
  }
  // Reading an image needs the model; documents still ingest without a key.
  if (isImage) {
    const unavailable = requireAi();
    if (unavailable) return unavailable;
  }

  const fileKey = await uploadStore.put(Buffer.from(await file.arrayBuffer()), mime);
  try {
    const rawTitle = form?.get("title");
    const title = (typeof rawTitle === "string" && rawTitle.trim() ? rawTitle : file.name).slice(0, KNOWLEDGE_LIMITS.title);
    const item = await createKnowledge(currentProfile.id, {
      type: isImage ? "IMAGE" : "DOCUMENT",
      title,
      fileKey,
      mimeType: mime,
      sizeBytes: file.size,
    });
    await startIngest(currentProfile.id, item.id);
    return NextResponse.json({ item: publicItem(item) }, { status: 202 });
  } catch (err) {
    await uploadStore.delete(fileKey).catch(() => undefined);
    return knowledgeErrorResponse(err);
  }
}
