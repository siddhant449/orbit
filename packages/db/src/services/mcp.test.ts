import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { AccountError } from "./account";
import { createAssistantDocument, getDocument, listDocumentVersions, saveDocumentVersion } from "./documents";
import { getBinding, listClients, reconnectClient, revokeClient, setBinding, touchClient } from "./mcp";
import { account, cleanupVisualTests, secondProfile } from "./visual-test-helpers";

beforeEach(cleanupVisualTests);
afterAll(async () => {
  await cleanupVisualTests();
  await prisma.$disconnect();
});

describe("mcp binding", () => {
  it("binding defaults to the current profile and cannot point at another user's profile", async () => {
    const a = await account("m1");
    const b = await account("m2");
    expect(await getBinding(a.userId)).toEqual({ profileId: a.profileId });

    const second = await secondProfile(a);
    await setBinding(a.userId, second.profileId);
    expect((await getBinding(a.userId))?.profileId).toBe(second.profileId);
    // Setting it again is an update, not a second row.
    await setBinding(a.userId, a.profileId);
    expect((await getBinding(a.userId))?.profileId).toBe(a.profileId);
    expect(await prisma.mcpBinding.count({ where: { userId: a.userId } })).toBe(1);

    await expect(setBinding(a.userId, b.profileId)).rejects.toBeInstanceOf(AccountError);
    await expect(setBinding(a.userId, "no-such-profile")).rejects.toBeInstanceOf(AccountError);
    expect((await getBinding(a.userId))?.profileId).toBe(a.profileId);
  });

  it("an admin whose current profile is a teammate's still gets their own profile", async () => {
    const a = await account("m11");
    const b = await account("m12");
    const theirs = await prisma.profile.create({ data: { teamId: a.teamId, ownerUserId: b.userId, name: "Teammate" } });
    await prisma.user.update({ where: { id: a.userId }, data: { currentProfileId: theirs.id } });
    expect(await getBinding(a.userId)).toEqual({ profileId: a.profileId });
    // A stale binding to a profile they no longer own is ignored too.
    await prisma.mcpBinding.create({ data: { userId: a.userId, profileId: theirs.id } });
    expect(await getBinding(a.userId)).toEqual({ profileId: a.profileId });
  });

  it("a user with no profile of their own gets no binding", async () => {
    const a = await account("m13");
    await prisma.profile.update({ where: { id: a.profileId }, data: { deletedAt: new Date() } });
    expect(await getBinding(a.userId)).toBeNull();
  });

  it("a deleted bound profile falls back to their first own profile", async () => {
    const a = await account("m3");
    const second = await secondProfile(a);
    await setBinding(a.userId, second.profileId);
    await prisma.profile.update({ where: { id: second.profileId }, data: { deletedAt: new Date() } });
    expect((await getBinding(a.userId))?.profileId).toBe(a.profileId);
  });
});

describe("mcp clients", () => {
  it("a revoked client is refused", async () => {
    const a = await account("m4");
    expect(await touchClient(a.userId, "client-1", "ChatGPT")).toEqual({ revoked: false });
    // The same client again is one row.
    await touchClient(a.userId, "client-1", "ChatGPT");
    const rows = await listClients(a.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ clientId: "client-1", clientName: "ChatGPT" });

    await revokeClient(a.userId, rows[0]!.id);
    expect(await touchClient(a.userId, "client-1", "ChatGPT")).toEqual({ revoked: true });
    // It stays listed, as disconnected, until reconnected.
    const after = await listClients(a.userId);
    expect(after).toHaveLength(1);
    expect(after[0]!.revokedAt).not.toBeNull();
    await reconnectClient(a.userId, rows[0]!.id);
    expect(await touchClient(a.userId, "client-1", "ChatGPT")).toEqual({ revoked: false });
    expect((await listClients(a.userId))[0]!.revokedAt).toBeNull();
    await expect(reconnectClient(a.userId, rows[0]!.id)).rejects.toBeInstanceOf(AccountError);
  });

  it("writes lastUsedAt at most once a minute", async () => {
    const a = await account("m8");
    await touchClient(a.userId, "c", "Codex");
    const first = (await listClients(a.userId))[0]!.lastUsedAt;
    await touchClient(a.userId, "c", "Codex");
    expect((await listClients(a.userId))[0]!.lastUsedAt).toEqual(first);
    await prisma.mcpClient.updateMany({ where: { userId: a.userId }, data: { lastUsedAt: new Date(Date.now() - 120_000) } });
    await touchClient(a.userId, "c", "Codex");
    expect(Date.now() - (await listClients(a.userId))[0]!.lastUsedAt.getTime()).toBeLessThan(60_000);
  });

  it("a user cannot reconnect another user's client", async () => {
    const a = await account("m9");
    const b = await account("m10");
    await touchClient(a.userId, "c", "Codex");
    const [row] = await listClients(a.userId);
    await revokeClient(a.userId, row!.id);
    await expect(reconnectClient(b.userId, row!.id)).rejects.toBeInstanceOf(AccountError);
  });

  it("a user cannot revoke another user's client", async () => {
    const a = await account("m5");
    const b = await account("m6");
    await touchClient(a.userId, "client-1", "Codex");
    const [row] = await listClients(a.userId);
    await expect(revokeClient(b.userId, row!.id)).rejects.toBeInstanceOf(AccountError);
    expect(await listClients(a.userId)).toHaveLength(1);
  });
});

describe("assistant documents", () => {
  it("creates a post with source ASSISTANT and edits it as a new version", async () => {
    const a = await account("m7");
    const doc = await createAssistantDocument(a.profileId, { title: "From ChatGPT", text: "First text" });
    expect(doc.text).toBe("First text");
    const saved = await saveDocumentVersion(a.profileId, doc.id, { text: "Second text", source: "ASSISTANT", expectedVersion: doc.version });
    expect(saved.text).toBe("Second text");
    const versions = await listDocumentVersions(a.profileId, doc.id);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect((await getDocument(a.profileId, doc.id))?.currentVersion).toBe(2);
  });
});
