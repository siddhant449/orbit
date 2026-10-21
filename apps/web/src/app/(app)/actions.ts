"use server";

import { revalidatePath } from "next/cache";
import {
  AccountError,
  appendMemoryLines,
  assertProfileAccess,
  deleteMemoryLine,
  editMemoryLine,
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

/** Resolve the current profile and check the caller may touch it before running a memory change. */
function runMemory(fn: (profileId: string) => Promise<unknown>): Promise<ActionResult> {
  return run(async (userId) => {
    const account = await getAccount();
    const profileId = account.currentProfile?.id;
    if (!profileId) throw new AccountError("Choose a profile first");
    await assertProfileAccess(userId, profileId);
    await fn(profileId);
  });
}

const MEMORY_KEY = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
function checkKey(key: string) {
  if (!MEMORY_KEY.test(key)) throw new AccountError("Unknown memory section");
}

function checkIndex(i: number) {
  if (!Number.isInteger(i) || i < 0) throw new AccountError("Not an editable line");
}

export async function editMemoryLineAction(key: string, lineIndex: number, text: string, expectedText: string) {
  return runMemory((profileId) => {
    checkKey(key);
    checkIndex(lineIndex);
    return editMemoryLine(profileId, key, lineIndex, text, expectedText);
  });
}

export async function deleteMemoryLineAction(key: string, lineIndex: number, expectedText: string) {
  return runMemory((profileId) => {
    checkKey(key);
    checkIndex(lineIndex);
    return deleteMemoryLine(profileId, key, lineIndex, expectedText);
  });
}

export async function addMemoryAction(key: string, text: string) {
  return runMemory((profileId) => {
    checkKey(key);
    if (!text.trim()) throw new AccountError("Write something to remember");
    return appendMemoryLines(profileId, key, [text], "USER");
  });
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
