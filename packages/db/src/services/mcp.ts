import { prisma } from "../client";
import { AccountError, getAccountState } from "./account";

/** The profile AI assistants act as for this user: their saved choice while it is still a live profile they own, else their current profile. */
export async function getBinding(userId: string): Promise<{ profileId: string } | null> {
  const bound = await prisma.mcpBinding.findUnique({ where: { userId }, select: { profile: { select: { id: true, ownerUserId: true, deletedAt: true } } } });
  if (bound && bound.profile.ownerUserId === userId && !bound.profile.deletedAt) return { profileId: bound.profile.id };
  const account = await getAccountState(userId);
  return account.currentProfile ? { profileId: account.currentProfile.id } : null;
}

/** Owner profiles only: an assistant never acts as a profile the user does not own. */
export async function setBinding(userId: string, profileId: string): Promise<void> {
  const profile = await prisma.profile.findFirst({ where: { id: profileId, ownerUserId: userId, deletedAt: null }, select: { id: true } });
  if (!profile) throw new AccountError("Profile not found");
  await prisma.mcpBinding.upsert({ where: { userId }, create: { userId, profileId }, update: { profileId } });
}

export type McpClientRow = { id: string; clientId: string; clientName: string; createdAt: Date; lastUsedAt: Date };

/** Records a call from an assistant. A revoked client stays revoked; the caller answers 401. */
export async function touchClient(userId: string, clientId: string, clientName: string): Promise<{ revoked: boolean }> {
  const name = clientName.trim().slice(0, 80) || "AI assistant";
  const row = await prisma.mcpClient.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: { userId, clientId, clientName: name },
    update: {},
    select: { id: true, revokedAt: true },
  });
  if (row.revokedAt) return { revoked: true };
  // One write a minute at most: every tool call passes through here.
  await prisma.mcpClient.updateMany({ where: { id: row.id, lastUsedAt: { lt: new Date(Date.now() - 60_000) } }, data: { lastUsedAt: new Date() } });
  return { revoked: false };
}

export function listClients(userId: string): Promise<McpClientRow[]> {
  return prisma.mcpClient.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, clientId: true, clientName: true, createdAt: true, lastUsedAt: true },
  });
}

export async function revokeClient(userId: string, id: string): Promise<void> {
  const { count } = await prisma.mcpClient.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) throw new AccountError("Assistant not found");
}
