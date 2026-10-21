import { listVersionsHandler } from "@/lib/documents-api";

export function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return listVersionsHandler(request, ctx);
}
