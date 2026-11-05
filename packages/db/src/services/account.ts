import { prisma } from "../client";
import type { Profile, TeamRole } from "../generated/prisma/client";

export type ClerkIdentity = {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Test hook so fixtures can be cleaned up by name. */
  teamNameSuffix?: string;
};

export type AccountState = {
  user: { id: string; email: string; name: string | null };
  team: { id: string; name: string };
  role: TeamRole;
  profiles: Profile[];
  currentProfile: Profile | null;
  /** Members of the team, for the workspace label. */
  memberCount: number;
};

export class AccountError extends Error {}

function displayName(identity: ClerkIdentity) {
  const full = [identity.firstName, identity.lastName].filter(Boolean).join(" ").trim();
  return full || identity.email.split("@")[0] || "My profile";
}

/**
 * Called on every authenticated request. On first sign-in it creates the user, a team they own
 * and a first profile, mirroring Kleo's "{First}'s Team" default.
 */
export async function ensureAccount(identity: ClerkIdentity): Promise<AccountState> {
  const existing = await findAccountByClerkId(identity.clerkId);
  if (existing) return existing;

  const name = displayName(identity);
  const teamName = `${identity.firstName || name}'s Team${identity.teamNameSuffix ?? ""}`;

  const userId = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { clerkId: identity.clerkId, email: identity.email, name },
    });
    const team = await tx.team.create({
      data: { name: teamName, memberships: { create: { userId: user.id, role: "OWNER" } } },
    });
    const profile = await tx.profile.create({
      data: { teamId: team.id, ownerUserId: user.id, name },
    });
    await tx.user.update({ where: { id: user.id }, data: { currentProfileId: profile.id } });
    return user.id;
  });

  return getAccountState(userId);
}

async function primaryMembership(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, team: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    include: { team: true },
  });
  if (!membership) throw new AccountError("No team found for user");
  return membership;
}

/** Members see only the profiles they own; owners and admins see every profile in the team. */
function visibleProfilesWhere(userId: string, teamId: string, role: TeamRole) {
  return {
    teamId,
    deletedAt: null,
    ...(role === "MEMBER" ? { ownerUserId: userId } : {}),
  };
}

const accountUserInclude = {
  memberships: {
    where: { team: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    take: 1,
    include: { team: { include: { _count: { select: { memberships: true } } } } },
  },
} as const;

/** Two round trips: the user with their primary membership, team and member count, then the visible profiles. */
async function loadAccountState(
  where: { id: string } | { clerkId: string },
): Promise<AccountState | null> {
  const user = await prisma.user.findUnique({ where, include: accountUserInclude });
  if (!user) return null;
  const membership = user.memberships[0];
  if (!membership) throw new AccountError("No team found for user");
  const profiles = await prisma.profile.findMany({
    where: visibleProfilesWhere(user.id, membership.teamId, membership.role),
    orderBy: { createdAt: "asc" },
  });
  const currentProfile =
    profiles.find((p) => p.id === user.currentProfileId) ?? profiles[0] ?? null;

  return {
    user: { id: user.id, email: user.email, name: user.name },
    team: { id: membership.team.id, name: membership.team.name },
    role: membership.role,
    profiles,
    currentProfile,
    memberCount: membership.team._count.memberships,
  };
}

export async function getAccountState(userId: string): Promise<AccountState> {
  const state = await loadAccountState({ id: userId });
  if (!state) throw new AccountError("User not found");
  return state;
}

/** The account for a Clerk user id, or null when they have not signed in before. */
export function findAccountByClerkId(clerkId: string): Promise<AccountState | null> {
  return loadAccountState({ clerkId });
}

async function findVisibleProfile(userId: string, profileId: string) {
  const membership = await primaryMembership(userId);
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, ...visibleProfilesWhere(userId, membership.teamId, membership.role) },
  });
  if (!profile) throw new AccountError("Profile not found");
  return { profile, membership };
}

/** Throws AccountError("Profile not found") unless the user can see the profile. */
export async function assertProfileAccess(userId: string, profileId: string): Promise<Profile> {
  return (await findVisibleProfile(userId, profileId)).profile;
}

export async function createProfile(userId: string, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new AccountError("Profile name is required");
  const membership = await primaryMembership(userId);
  return prisma.profile.create({
    // Onboarding is for a person's first profile only; later profiles open straight into the app.
    data: { teamId: membership.teamId, ownerUserId: userId, name, onboardingCompleted: true },
  });
}

export async function switchProfile(userId: string, profileId: string) {
  await findVisibleProfile(userId, profileId);
  await prisma.user.update({ where: { id: userId }, data: { currentProfileId: profileId } });
}

export async function softDeleteProfile(userId: string, profileId: string) {
  const { membership } = await findVisibleProfile(userId, profileId);
  const remaining = await prisma.profile.count({
    where: { teamId: membership.teamId, deletedAt: null, id: { not: profileId } },
  });
  if (remaining === 0) throw new AccountError("You can't delete your last profile");

  await prisma.$transaction([
    prisma.profile.update({ where: { id: profileId }, data: { deletedAt: new Date() } }),
    prisma.user.updateMany({
      where: { currentProfileId: profileId },
      data: { currentProfileId: null },
    }),
  ]);
}

export type ProfileSettings = { name?: string; language?: string; timezone?: string };

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function updateProfileSettings(userId: string, profileId: string, input: ProfileSettings) {
  await findVisibleProfile(userId, profileId);
  if (input.timezone !== undefined && !isValidTimezone(input.timezone)) {
    throw new AccountError("Unknown timezone");
  }
  if (input.name !== undefined && !input.name.trim()) {
    throw new AccountError("Profile name is required");
  }
  return prisma.profile.update({
    where: { id: profileId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    },
  });
}

const ACTIVE_WRITE_EVERY_MS = 3_600_000;

/**
 * Records that someone is using the profile, at most once an hour (the weekly cron only serves recently active
 * profiles). `known` is the value the caller already loaded, so a fresh one costs no query at all.
 */
export async function touchProfileActive(profileId: string, known: Date | string | null | undefined, now = new Date()): Promise<boolean> {
  if (known && now.getTime() - new Date(known).getTime() < ACTIVE_WRITE_EVERY_MS) return false;
  const { count } = await prisma.profile.updateMany({
    where: { id: profileId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - ACTIVE_WRITE_EVERY_MS) } }] },
    data: { lastActiveAt: now },
  });
  return count > 0;
}
