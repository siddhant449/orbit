import { NextResponse } from "next/server";
import { getAccount } from "@/lib/account";
import { patchUserMemory, readUserMemory, type HandlerResult } from "@/lib/user-memory";

const respond = ({ status, body }: HandlerResult) => NextResponse.json(body, { status });

export async function GET() {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return respond({ status: 400, body: { error: "Create a profile first" } });
  return respond(await readUserMemory(currentProfile.id));
}

export async function PATCH(request: Request) {
  const { currentProfile } = await getAccount();
  if (!currentProfile) return respond({ status: 400, body: { error: "Create a profile first" } });
  const body = await request.json().catch(() => null);
  return respond(await patchUserMemory(currentProfile.id, body));
}
