import { prisma } from "../client";
import { AccountError } from "./account";

/**
 * The profile AI assistants act as for this user: their saved choice while it is still a live profile they own, else their
 * first live profile they own. Never a teammate's profile (an owner or admin can see those), so null when they own none.
 */
export async function getBinding(userId: string): Promise<{ profileId: string } | null> {
  const bound = await prisma.mcpBinding.findUnique({ where: { userId }, select: { profile: { select: { id: true, ownerUserId: true, deletedAt: true } } } });
  if (bound && bound.profile.ownerUserId === userId && !bound.profile.deletedAt) return { profileId: bound.profile.id };
  const own = await prisma.profile.findFirst({ where: { ownerUserId: userId, deletedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return own ? { profileId: own.id } : null;
}

/** Owner profiles only: an assistant never acts as a profile the user does not own. */
export async function setBinding(userId: string, profileId: string): Promise<void> {
  const profile = await prisma.profile.findFirst({ where: { id: profileId, ownerUserId: userId, deletedAt: null }, select: { id: true } });
  if (!profile) throw new AccountError("Profile not found");
  await prisma.mcpBinding.upsert({ where: { userId }, create: { userId, profileId }, update: { profileId } });
}

export type McpClientRow = { id: string; clientId: string; clientName: string; createdAt: Date; lastUsedAt: Date; revokedAt: Date | null };

/** Records a call from an assistant. A revoked client stays revoked until reconnected; the caller answers 401. The row is written at most once a minute. */
export async function touchClient(userId: string, clientId: string, clientName: string): Promise<{ revoked: boolean }> {
  const row = await prisma.mcpClient.findUnique({ where: { userId_clientId: { userId, clientId } }, select: { id: true, revokedAt: true, lastUsedAt: true } });
  if (row?.revokedAt) return { revoked: true };
  if (!row) {
    const name = clientName.trim().slice(0, 80) || "AI assistant";
    try {
      await prisma.mcpClient.create({ data: { userId, clientId, clientName: name } });
    } catch (e) {
      // A concurrent first call created it; if that row is already revoked, say so.
      const again = await prisma.mcpClient.findUnique({ where: { userId_clientId: { userId, clientId } }, select: { revokedAt: true } });
      if (!again) throw e;
      return { revoked: Boolean(again.revokedAt) };
    }
  } else if (row.lastUsedAt.getTime() < Date.now() - 60_000) {
    await prisma.mcpClient.updateMany({ where: { id: row.id, revokedAt: null }, data: { lastUsedAt: new Date() } });
  }
  return { revoked: false };
}

/** Connected assistants first (most recently used), then disconnected ones. */
export async function listClients(userId: string): Promise<McpClientRow[]> {
  const rows = await prisma.mcpClient.findMany({
    where: { userId },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, clientId: true, clientName: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return [...rows.filter((r) => !r.revokedAt), ...rows.filter((r) => r.revokedAt)];
}

export async function revokeClient(userId: string, id: string): Promise<void> {
  const { count } = await prisma.mcpClient.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) throw new AccountError("Assistant not found");
}

/** Lets a disconnected assistant call again. */
export async function reconnectClient(userId: string, id: string): Promise<void> {
  const { count } = await prisma.mcpClient.updateMany({ where: { id, userId, revokedAt: { not: null } }, data: { revokedAt: null, lastUsedAt: new Date() } });
  if (count === 0) throw new AccountError("Assistant not found");
}
