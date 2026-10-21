import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureAccount, getAccountState, prisma, type AccountState } from "@brandloop/db";

/** The signed-in user's account, created on first visit. Deduplicated per request. */
export const getAccount = cache(async (): Promise<AccountState> => {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  const existing = await prisma.user.findUnique({ where: { clerkId: userId }, select: { id: true } });
  if (existing) return getAccountState(existing.id);

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
  team: { name: string };
  role: AccountState["role"];
  profiles: { id: string; name: string; avatarUrl: string | null }[];
  currentProfileId: string | null;
};

/** The subset of the account the client shell needs. */
export function toShellAccount(account: AccountState): ShellAccount {
  return {
    user: { name: account.user.name, email: account.user.email },
    team: { name: account.team.name },
    role: account.role,
    profiles: account.profiles.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })),
    currentProfileId: account.currentProfile?.id ?? null,
  };
}
