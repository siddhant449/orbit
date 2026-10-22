import {
  createDocumentForChat,
  DocumentVersionConflict,
  getDocument,
  getOrCreateChat,
  listDocumentVersions,
  saveAssistantMessage,
  saveDocumentVersion,
} from "@brandloop/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { applyProposal, ProposalError } from "./proposals";
import { cleanup, testProfile } from "./test/fixtures";

const TEXT = "Old hook that goes on and on.\n\nThe body stays the same.";
let me: { userId: string; profileId: string };
let chatId: string;
let docId: string;

async function storeProposal(output: Record<string, unknown>, opts: { toolCallId?: string; state?: string; chat?: string } = {}) {
  await saveAssistantMessage(opts.chat ?? chatId, {
    id: randomUUID(),
    runId: randomUUID(),
    parts: [
      { type: "step-start" },
      {
        type: "tool-proposeDocumentEdits",
        toolCallId: opts.toolCallId ?? "call_p",
        state: opts.state ?? "output-available",
        input: { instruction: "Punchier", targetText: output.targetText },
        output,
      },
    ],
    metadata: null,
    context: null,
  });
}

const proposal = (over: Record<string, unknown> = {}) => ({
  proposalId: "call_p",
  documentId: docId,
  documentVersion: 1,
  targetText: "Old hook that goes on and on.",
  replacement: "Short hook.",
  instruction: "Punchier",
  ...over,
});

beforeEach(async () => {
  await cleanup();
  me = await testProfile();
  chatId = randomUUID();
  await getOrCreateChat(me.profileId, me.userId, chatId);
  docId = (await createDocumentForChat(me.profileId, chatId, { title: "Post", text: TEXT })).id;
});
afterAll(cleanup);

describe("applyProposal", () => {
  it("applies a proposal once; another proposal for the replaced passage is stale_passage", async () => {
    await storeProposal(proposal());
    await storeProposal(proposal({ proposalId: "call_q", replacement: "Other hook." }), { toolCallId: "call_q" });
    const doc = await applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 });
    expect(doc).toMatchObject({ version: 2, text: "Short hook.\n\nThe body stays the same." });
    expect((await listDocumentVersions(me.profileId, docId))[0]).toMatchObject({ version: 2, source: "PROPOSAL" });

    await expect(applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 2 })).rejects.toMatchObject({
      code: "already_applied",
    });
    const stale = applyProposal(me.profileId, docId, { chatId, toolCallId: "call_q", expectedVersion: 2 });
    await expect(stale).rejects.toBeInstanceOf(ProposalError);
    await expect(stale).rejects.toMatchObject({ code: "stale_passage" });
    expect((await getDocument(me.profileId, docId))!.version).toBe(2);
  });

  it("rejects a stale expectedVersion", async () => {
    await storeProposal(proposal());
    await saveDocumentVersion(me.profileId, docId, { text: `${TEXT}\n\nP.S.`, source: "USER_EDIT", expectedVersion: 1 });
    const stale = applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 });
    await expect(stale).rejects.toBeInstanceOf(DocumentVersionConflict);
    await expect(stale).rejects.toMatchObject({ currentVersion: 2 });
  });

  it("applies onto a newer version when the passage still occurs once", async () => {
    await storeProposal(proposal());
    await saveDocumentVersion(me.profileId, docId, { text: `${TEXT}\n\nP.S.`, source: "USER_EDIT", expectedVersion: 1 });
    const doc = await applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 2 });
    expect(doc.text).toBe("Short hook.\n\nThe body stays the same.\n\nP.S.");
  });

  it("is not_found for an unknown tool call, an unfinished part, another document, or another profile's chat", async () => {
    await storeProposal(proposal(), { toolCallId: "call_running", state: "input-available" });
    await storeProposal(proposal({ documentId: "someone_elses_doc" }), { toolCallId: "call_other" });
    for (const toolCallId of ["call_missing", "call_running", "call_other"]) {
      await expect(applyProposal(me.profileId, docId, { chatId, toolCallId, expectedVersion: 1 })).rejects.toMatchObject({ code: "not_found" });
    }
    await storeProposal(proposal());
    const other = await testProfile(2);
    await expect(applyProposal(other.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 })).rejects.toMatchObject({
      code: "not_found",
    });
    expect((await getDocument(me.profileId, docId))!.version).toBe(1);
  });

  it("uses the stored replacement only, and rejects a passage that now occurs twice", async () => {
    await storeProposal(proposal());
    await saveDocumentVersion(me.profileId, docId, {
      text: `${TEXT}\n\nOld hook that goes on and on.`,
      source: "USER_EDIT",
      expectedVersion: 1,
    });
    await expect(applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 2 })).rejects.toMatchObject({
      code: "stale_passage",
    });
  });

  it("records the proposal on its version and refuses a second apply of an expanding edit", async () => {
    await storeProposal(proposal({ replacement: "Old hook that goes on and on. And on." }));
    const doc = await applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 });
    expect(doc.text).toBe("Old hook that goes on and on. And on.\n\nThe body stays the same.");
    expect((await listDocumentVersions(me.profileId, docId))[0]).toMatchObject({ source: "PROPOSAL", proposalId: "call_p" });
    const again = applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 2 });
    await expect(again).rejects.toMatchObject({ code: "already_applied" });
    expect((await getDocument(me.profileId, docId))!.version).toBe(2);
  });

  it("lets exactly one of two concurrent applies win; the other is already_applied", async () => {
    await storeProposal(proposal({ replacement: "Old hook that goes on and on. And on." }));
    const results = await Promise.allSettled([
      applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 }),
      applyProposal(me.profileId, docId, { chatId, toolCallId: "call_p", expectedVersion: 1 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ProposalError);
    expect(lost.reason).toMatchObject({ code: "already_applied" });
    expect((await listDocumentVersions(me.profileId, docId)).map((v) => v.version)).toEqual([2, 1]);
  });
});
