import { patchIdeaHandler } from "@/lib/ideas-weekly-api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return patchIdeaHandler(request, (await params).id);
}
