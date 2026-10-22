import { pdfHandler } from "@/lib/carousels-api";

export const POST = (request: Request, ctx: { params: Promise<{ id: string }> }) => pdfHandler(request, ctx);
