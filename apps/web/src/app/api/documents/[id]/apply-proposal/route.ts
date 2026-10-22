import { applyProposalHandler } from "@/lib/documents-api";

export function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return applyProposalHandler(request, ctx);
}
