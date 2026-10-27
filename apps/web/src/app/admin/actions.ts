"use server";

import { revalidatePath } from "next/cache";
import { prisma, setAiControls } from "@brandloop/db";
import { requireAdmin } from "@/lib/admin";
import { parseCapUsd } from "@/lib/admin-format";

export type AdminActionResult = { ok: true } | { ok: false; error: string };

async function knownUser(userId: string): Promise<boolean> {
  return typeof userId === "string" && userId.length > 0 && userId.length < 64 && Boolean(await prisma.user.findUnique({ where: { id: userId }, select: { id: true } }));
}

/** Sets (or, with an empty string, clears back to the default) one user's daily AI cost cap. Admin only: anyone else gets a 404. */
export async function setDailyCapAction(userId: string, capUsd: string): Promise<AdminActionResult> {
  await requireAdmin();
  let micro: number | null;
  try {
    micro = parseCapUsd(String(capUsd));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Enter a dollar amount." };
  }
  if (!(await knownUser(userId))) return { ok: false, error: "That user no longer exists." };
  await setAiControls(userId, { dailyCapMicroUsd: micro });
  revalidatePath("/admin");
  return { ok: true };
}

/** Pauses or resumes AI for one user. Admin only. */
export async function setAiBlockedAction(userId: string, blocked: boolean): Promise<AdminActionResult> {
  await requireAdmin();
  if (!(await knownUser(userId))) return { ok: false, error: "That user no longer exists." };
  await setAiControls(userId, { aiBlocked: Boolean(blocked) });
  revalidatePath("/admin");
  return { ok: true };
}
