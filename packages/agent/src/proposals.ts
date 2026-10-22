import {
  ChatError,
  DocumentVersionConflict,
  getDocument,
  listMessages,
  saveDocumentVersion,
  type DocumentSnapshot,
} from "@brandloop/db";
import { oneLine } from "./data";
import { occurrences, ProposalOutputSchema, type ProposalOutput } from "./tools/documents";

/**
 * Accepting an edit proposal (design §5, §6.4): a deterministic write, no model call. The client sends only ids
 * and the version it saw; the passage and its replacement come from the proposal as the server stored it.
 */

export type ProposalErrorCode = "not_found" | "stale_passage";

export class ProposalError extends Error {
  readonly code: ProposalErrorCode;
  constructor(code: ProposalErrorCode) {
    super(code === "not_found" ? "Edit proposal not found." : "That passage isn't in the post any more.");
    this.name = "ProposalError";
    this.code = code;
  }
}

/** The completed `proposeDocumentEdits` output stored in the profile's chat, or null. */
async function findProposal(profileId: string, chatId: string, toolCallId: string): Promise<ProposalOutput | null> {
  let messages;
  try {
    messages = await listMessages(profileId, chatId);
  } catch (err) {
    if (err instanceof ChatError) return null;
    throw err;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "assistant") continue;
    for (const part of m.parts as { type?: unknown; toolCallId?: unknown; state?: unknown; output?: unknown }[]) {
      if (part?.type !== "tool-proposeDocumentEdits" || part.toolCallId !== toolCallId || part.state !== "output-available") continue;
      const parsed = ProposalOutputSchema.safeParse(part.output);
      if (parsed.success && parsed.data.proposalId === toolCallId) return parsed.data;
    }
  }
  return null;
}

/**
 * Applies the stored proposal to the document: `DocumentVersionConflict` when `expectedVersion` isn't current,
 * `ProposalError("stale_passage")` unless the passage occurs exactly once, otherwise a new PROPOSAL version.
 */
export async function applyProposal(
  profileId: string,
  documentId: string,
  input: { chatId: string; toolCallId: string; expectedVersion: number },
): Promise<DocumentSnapshot> {
  const proposal = await findProposal(profileId, input.chatId, input.toolCallId);
  if (!proposal || proposal.documentId !== documentId) throw new ProposalError("not_found");
  const doc = await getDocument(profileId, documentId);
  if (!doc || doc.chatId !== input.chatId) throw new ProposalError("not_found");
  if (doc.version !== input.expectedVersion) throw new DocumentVersionConflict(doc.version);
  if (occurrences(doc.text, proposal.targetText) !== 1) throw new ProposalError("stale_passage");

  const at = doc.text.indexOf(proposal.targetText);
  const text = doc.text.slice(0, at) + proposal.replacement + doc.text.slice(at + proposal.targetText.length);
  const first = text.split("\n").find((l) => l.trim())?.trim() ?? "";
  return saveDocumentVersion(profileId, documentId, {
    text,
    hook: first && first.length <= 200 ? first : null,
    source: "PROPOSAL",
    changeSummary: `Applied a suggested edit: ${oneLine(proposal.instruction)}`.slice(0, 300),
    expectedVersion: input.expectedVersion,
  });
}
