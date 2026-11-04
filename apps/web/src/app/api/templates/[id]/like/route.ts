import { setLikedHandler } from "@/lib/templates-api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  return setLikedHandler((await params).id, true);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  return setLikedHandler((await params).id, false);
}
