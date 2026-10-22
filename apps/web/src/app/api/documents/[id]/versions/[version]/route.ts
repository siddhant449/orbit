import { getVersionHandler } from "@/lib/documents-api";

export function GET(request: Request, ctx: { params: Promise<{ id: string; version: string }> }) {
  return getVersionHandler(request, ctx);
}
