import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Real Postgres (kleo-clone-db-1); only Clerk is faked.
const env = vi.hoisted(() => {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url));
  } catch {
    /* DATABASE_URL may already be set */
  }
  return { account: null as null | { user: { id: string }; currentProfile: { id: string } | null } };
});
vi.mock("@/lib/account", () => ({ getAccount: async () => env.account }));

import { createDocumentForChat, ensureAccount, getOrCreateChat, prisma, saveAssistantMessage, saveDocumentVersion } from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { applyProposalHandler, getDocumentHandler, listVersionsHandler, patchDocumentHandler, restoreDocumentHandler } from "./documents-api";

const CLERK = "user_test_webdocs";
let mine: { userId: string; profileId: string };
let theirs: { userId: string; profileId: string };

async function wipe() {
  const users = { clerkId: { startsWith: CLERK } };
  await prisma.team.deleteMany({ where: { name: { endsWith: " (test)" }, memberships: { some: { user: users } } } });
  await prisma.user.deleteMany({ where: users });
}

async function account(n: number) {
  const acc = await ensureAccount({ clerkId: `${CLERK}${n}`, email: `webdocs${n}@example.test`, firstName: "Docs", teamNameSuffix: " (test)" });
  return { userId: acc.user.id, profileId: acc.currentProfile!.id };
}

async function newDoc(text = "Version one") {
  const chatId = randomUUID();
  await getOrCreateChat(mine.profileId, mine.userId, chatId);
  return createDocumentForChat(mine.profileId, chatId, { title: "Post", text });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const send = (method: string, body: unknown) =>
  new Request("http://test/api/documents/x", { method, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeAll(async () => {
  await wipe();
  mine = await account(1);
  theirs = await account(2);
});
afterAll(wipe);
beforeEach(() => {
  env.account = { user: { id: mine.userId }, currentProfile: { id: mine.profileId } };
});

describe("documents routes", () => {
  it("GET returns the post with its current text; another profile gets 404", async () => {
    const d = await newDoc();
    const res = await getDocumentHandler(new Request("http://test"), params(d.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: d.id, title: "Post", version: 1, text: "Version one" });

    env.account = { user: { id: theirs.userId }, currentProfile: { id: theirs.profileId } };
    expect((await getDocumentHandler(new Request("http://test"), params(d.id))).status).toBe(404);
    expect((await listVersionsHandler(new Request("http://test"), params(d.id))).status).toBe(404);
    expect((await patchDocumentHandler(send("PATCH", { text: "x", expectedVersion: 1 }), params(d.id))).status).toBe(404);
    expect((await restoreDocumentHandler(send("POST", { version: 1, expectedVersion: 1 }), params(d.id))).status).toBe(404);
  });

  it("PATCH saves a user edit, then 409s a stale expectedVersion with the current version", async () => {
    const d = await newDoc();
    const ok = await patchDocumentHandler(send("PATCH", { text: "Edited", title: "New title", expectedVersion: 1 }), params(d.id));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ version: 2 });

    const stale = await patchDocumentHandler(send("PATCH", { text: "Late", expectedVersion: 1 }), params(d.id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "document_version_conflict", version: 2 });

    const versions = await (await listVersionsHandler(new Request("http://test"), params(d.id))).json();
    expect(versions.versions.map((v: { version: number; source: string }) => [v.version, v.source])).toEqual([
      [2, "USER_EDIT"],
      [1, "AI_CREATE"],
    ]);
    expect(versions.versions[0].chars).toBe(6);
  });

  it("PATCH rejects bad bodies with 400", async () => {
    const d = await newDoc();
    for (const body of ["{", { text: "x" }, { text: "", expectedVersion: 1 }, { text: "x".repeat(10_001), expectedVersion: 1 }, { text: "x", title: "t".repeat(121), expectedVersion: 1 }]) {
      const res = await patchDocumentHandler(send("PATCH", body), params(d.id));
      expect(res.status).toBe(400);
      expect(await res.json()).toHaveProperty("error");
    }
  });

  it("POST restore writes a RESTORE version; a missing version is 404 and a stale one 409", async () => {
    const d = await newDoc("Original");
    await patchDocumentHandler(send("PATCH", { text: "Changed", expectedVersion: 1 }), params(d.id));
    const res = await restoreDocumentHandler(send("POST", { version: 1, expectedVersion: 2 }), params(d.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ version: 3, text: "Original" });
    expect((await restoreDocumentHandler(send("POST", { version: 1, expectedVersion: 2 }), params(d.id))).status).toBe(409);
    expect((await restoreDocumentHandler(send("POST", { version: 9, expectedVersion: 3 }), params(d.id))).status).toBe(404);
    expect((await restoreDocumentHandler(send("POST", { version: "1" }), params(d.id))).status).toBe(400);
  });
});

describe("POST /api/documents/:id/apply-proposal", () => {
  async function withProposal(over: Record<string, unknown> = {}) {
    const chatId = randomUUID();
    await getOrCreateChat(mine.profileId, mine.userId, chatId);
    const d = await createDocumentForChat(mine.profileId, chatId, { title: "Post", text: "Old hook.\n\nBody." });
    await saveAssistantMessage(chatId, {
      id: randomUUID(),
      runId: randomUUID(),
      metadata: null,
      context: null,
      parts: [
        {
          type: "tool-proposeDocumentEdits",
          toolCallId: "call_p",
          state: "output-available",
          input: {},
          output: { proposalId: "call_p", documentId: d.id, documentVersion: 1, targetText: "Old hook.", replacement: "New hook.", instruction: "Punchier", ...over },
        },
      ],
    });
    return { chatId, d };
  }

  it("applies the stored replacement and returns the snapshot; client text is ignored", async () => {
    const { chatId, d } = await withProposal();
    const res = await applyProposalHandler(
      send("POST", { chatId, toolCallId: "call_p", expectedVersion: 1, replacement: "Injected", text: "Injected" }),
      params(d.id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: d.id, version: 2, text: "New hook.\n\nBody." });
    const versions = await (await listVersionsHandler(new Request("http://test"), params(d.id))).json();
    expect(versions.versions[0]).toMatchObject({ version: 2, source: "PROPOSAL" });
  });

  it("409s a stale version and a stale passage, with distinct codes", async () => {
    const { chatId, d } = await withProposal();
    await saveDocumentVersion(mine.profileId, d.id, { text: "Rewritten entirely.", source: "USER_EDIT", expectedVersion: 1 });
    const stale = await applyProposalHandler(send("POST", { chatId, toolCallId: "call_p", expectedVersion: 1 }), params(d.id));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "document_version_conflict", version: 2 });
    const gone = await applyProposalHandler(send("POST", { chatId, toolCallId: "call_p", expectedVersion: 2 }), params(d.id));
    expect(gone.status).toBe(409);
    expect(await gone.json()).toMatchObject({ code: "stale_passage" });
  });

  it("404s another profile, an unknown proposal and another chat; 400s a bad body", async () => {
    const { chatId, d } = await withProposal();
    expect((await applyProposalHandler(send("POST", { chatId, toolCallId: "call_nope", expectedVersion: 1 }), params(d.id))).status).toBe(404);
    expect((await applyProposalHandler(send("POST", { chatId: randomUUID(), toolCallId: "call_p", expectedVersion: 1 }), params(d.id))).status).toBe(404);
    expect((await applyProposalHandler(send("POST", { chatId, toolCallId: "call_p" }), params(d.id))).status).toBe(400);
    expect((await applyProposalHandler(send("POST", "{"), params(d.id))).status).toBe(400);
    env.account = { user: { id: theirs.userId }, currentProfile: { id: theirs.profileId } };
    expect((await applyProposalHandler(send("POST", { chatId, toolCallId: "call_p", expectedVersion: 1 }), params(d.id))).status).toBe(404);
  });
});
