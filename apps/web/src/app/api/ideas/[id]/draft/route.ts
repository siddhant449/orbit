import { draftIdeaHandler } from "@/lib/ideas-weekly-api";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return draftIdeaHandler((await params).id);
}
