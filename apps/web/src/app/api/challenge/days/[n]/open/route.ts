import { openDayHandler } from "@/lib/challenge-api";

export async function POST(_request: Request, { params }: { params: Promise<{ n: string }> }) {
  return openDayHandler((await params).n);
}
