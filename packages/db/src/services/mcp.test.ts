import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../client";
import { AccountError } from "./account";
import { createAssistantDocument, getDocument, listDocumentVersions, saveDocumentVersion } from "./documents";
import { getBinding, listClients, revokeClient, setBinding, touchClient } from "./mcp";
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

  it("a deleted bound profile falls back to the current profile", async () => {
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
    expect(await listClients(a.userId)).toHaveLength(0);
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
