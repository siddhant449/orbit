import { prisma } from "../client";
import type { BackgroundJob, JobKind } from "../generated/prisma/client";

export function createJob(profileId: string, kind: JobKind, input: unknown): Promise<BackgroundJob> {
  return prisma.backgroundJob.create({
    data: { profileId, kind, input: (input ?? {}) as object },
  });
}

/** Runs `fn`, recording RUNNING, then DONE with output or FAILED with the error message. Never throws. */
export async function runJob(jobId: string, fn: () => Promise<unknown>): Promise<void> {
  await prisma.backgroundJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });
  try {
    const result = await fn();
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: "DONE", output: (result ?? {}) as object },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Something went wrong";
    await prisma.backgroundJob.update({ where: { id: jobId }, data: { status: "FAILED", error } });
  }
}

export function getJob(profileId: string, jobId: string): Promise<BackgroundJob | null> {
  return prisma.backgroundJob.findFirst({ where: { id: jobId, profileId } });
}
