import { countOccurrences } from "../match";
import type { PanelDoc } from "./document-state";

/**
 * An edit proposal as the thread shows it (design §9): the stored `proposeDocumentEdits` output, and where it stands
 * against the post in the panel. Client-safe; the apply route re-checks everything on the server.
 */
export type Proposal = {
  proposalId: string;
  documentId: string;
  documentVersion: number;
  targetText: string;
  replacement: string;
  instruction: string;
};

export type ProposalStatus = "ready" | "applied" | "stale" | "checking";

export function parseProposal(output: unknown): Proposal | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const str = (k: string) => typeof o[k] === "string";
  if (!str("proposalId") || !str("documentId") || !str("targetText") || !str("replacement") || !str("instruction")) return null;
  if (typeof o.documentVersion !== "number" || !(o.targetText as string)) return null;
  return {
    proposalId: o.proposalId as string,
    documentId: o.documentId as string,
    documentVersion: o.documentVersion,
    targetText: o.targetText as string,
    replacement: o.replacement as string,
    instruction: o.instruction as string,
  };
}

/**
 * Applied when a saved version records this proposal (`appliedIds`, from the post's version list), never guessed from
 * the text: an expanding edit keeps the passage and a deletion leaves no trace. Otherwise ready while the passage
 * occurs exactly once (overlaps counted), stale when it doesn't, and checking while the list hasn't loaded.
 */
export function proposalStatus(p: Proposal, doc: PanelDoc | null, appliedIds: readonly string[] | null): ProposalStatus {
  if (appliedIds?.includes(p.proposalId)) return "applied";
  if (!doc || doc.id !== p.documentId || doc.version < 1) return "ready";
  if (countOccurrences(doc.text, p.targetText) === 1) return "ready";
  return appliedIds === null ? "checking" : "stale";
}
