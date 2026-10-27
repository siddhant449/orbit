import { cache } from "react";
import { unstable_cache } from "next/cache";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdminEmail } from "@/lib/admin-email";
import { ensureAccount, findAccountByClerkId, type AccountState } from "@brandloop/db";

/** Tag on every cached account read. Writers that change a profile, user, team or membership expire it (see `expireAccountCache`). */
export const ACCOUNT_CACHE_TAG = "account";

class NoAccountYet extends Error {}

/**
 * Cross-request cache of the account read. The Clerk user id is part of the cache key, so one user's
 * entry is never served to another. A missing account throws so that "not found" is never cached
 * (the first sign-in creates it). The 60 s window is only a backstop; every writer expires the tag.
 */
const loadCachedAccount = unstable_cache(
  async (clerkId: string): Promise<AccountState> => {
    const account = await findAccountByClerkId(clerkId);
    if (!account) throw new NoAccountYet();
    return account;
  },
  ["account-by-clerk-id"],
  { tags: [ACCOUNT_CACHE_TAG], revalidate: 60 },
);

/** The cache stores JSON, so Date columns come back as strings. */
function reviveProfile<T extends AccountState["profiles"][number]>(p: T): T {
  return {
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
    deletedAt: p.deletedAt ? new Date(p.deletedAt) : null,
  };
}

function reviveAccount(a: AccountState): AccountState {
  const profiles = a.profiles.map(reviveProfile);
  return {
    ...a,
    profiles,
    currentProfile: a.currentProfile ? (profiles.find((p) => p.id === a.currentProfile!.id) ?? reviveProfile(a.currentProfile)) : null,
  };
}

/** The signed-in user's account, created on first visit. Cached across requests; deduplicated per request. */
export const getAccount = cache(async (): Promise<AccountState> => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  try {
    return reviveAccount(await loadCachedAccount(userId));
  } catch (err) {
    if (!(err instanceof NoAccountYet)) throw err;
  }

  // First visit: only now pay for the Clerk user lookup.
  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? "";
  return ensureAccount({
    clerkId: userId,
    email,
    firstName: user?.firstName,
    lastName: user?.lastName,
  });
});

export type ShellAccount = {
  user: { name: string | null; email: string };
  /** `members` decides the profile footer's workspace label ("Personal workspace" for a team of one). */
  team: { name: string; members: number };
  role: AccountState["role"];
  profiles: { id: string; name: string; avatarUrl: string | null }[];
  currentProfileId: string | null;
  /** Show the "Admin" entry in the profile menu. Cosmetic only: /admin checks the allow-list itself on every request. */
  isAdmin?: boolean;
};

/** The subset of the account the client shell needs. */
export function toShellAccount(account: AccountState): ShellAccount {
  return {
    user: { name: account.user.name, email: account.user.email },
    team: { name: account.team.name, members: account.memberCount },
    role: account.role,
    profiles: account.profiles.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
    currentProfileId: account.currentProfile?.id ?? null,
    isAdmin: isAdminEmail(account.user.email),
  };
}
