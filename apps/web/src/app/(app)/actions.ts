"use server";

import { revalidatePath } from "next/cache";
import {
  AccountError,
  createProfile,
  softDeleteProfile,
  switchProfile,
  updateProfileSettings,
  type ProfileSettings,
} from "@brandloop/db";
import { getAccount } from "@/lib/account";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function run(fn: (userId: string) => Promise<unknown>): Promise<ActionResult> {
  const account = await getAccount();
  try {
    await fn(account.user.id);
  } catch (err) {
    if (err instanceof AccountError) return { ok: false, error: err.message };
    throw err;
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function switchProfileAction(profileId: string) {
  return run((userId) => switchProfile(userId, profileId));
}

export async function createProfileAction(name: string) {
  return run(async (userId) => {
    const profile = await createProfile(userId, { name });
    await switchProfile(userId, profile.id);
  });
}

export async function deleteProfileAction(profileId: string) {
  return run((userId) => softDeleteProfile(userId, profileId));
}

export async function updateProfileSettingsAction(profileId: string, input: ProfileSettings) {
  return run((userId) => updateProfileSettings(userId, profileId, input));
}
