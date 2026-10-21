import { NextResponse } from "next/server";
import { getJob } from "@brandloop/db";
import { getAccount } from "@/lib/account";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { currentProfile } = await getAccount();
  const { id } = await params;
  const job = currentProfile ? await getJob(currentProfile.id, id) : null;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  return NextResponse.json({ status: job.status, error: job.error, output: job.output });
}
