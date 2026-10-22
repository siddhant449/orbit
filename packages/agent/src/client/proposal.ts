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

export type ProposalStatus = "ready" | "applied" | "stale";

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

function count(text: string, needle: string): number {
  let n = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Ready while the passage occurs once in the open post; applied once it's replaced; stale otherwise. */
export function proposalStatus(p: Proposal, doc: PanelDoc | null): ProposalStatus {
  if (!doc || doc.id !== p.documentId || doc.version < 1) return "ready";
  const n = count(doc.text, p.targetText);
  if (n === 1) return "ready";
  if (n === 0 && p.replacement && doc.text.includes(p.replacement)) return "applied";
  return "stale";
}
