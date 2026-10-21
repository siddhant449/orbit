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
  const existing = await prisma.user.findUnique({ where: { clerkId: identity.clerkId } });
  if (existing) return getAccountState(existing.id);

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

export async function getAccountState(userId: string): Promise<AccountState> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await primaryMembership(userId);
  const profiles = await prisma.profile.findMany({
    where: visibleProfilesWhere(userId, membership.teamId, membership.role),
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
  };
}

async function findVisibleProfile(userId: string, profileId: string) {
  const membership = await primaryMembership(userId);
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, ...visibleProfilesWhere(userId, membership.teamId, membership.role) },
  });
  if (!profile) throw new AccountError("Profile not found");
  return { profile, membership };
}

export async function createProfile(userId: string, input: { name: string }) {
  const name = input.name.trim();
  if (!name) throw new AccountError("Profile name is required");
  const membership = await primaryMembership(userId);
  return prisma.profile.create({
    data: { teamId: membership.teamId, ownerUserId: userId, name },
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
