import type { KnowledgeStatus, KnowledgeType } from "@brandloop/db";

export type StatusView = { label: string; tone: "neutral" | "accent" | "danger" };

/** Indexing status as a pill (screens.md B14): honest words for each ingest state. */
export function knowledgeStatus(status: KnowledgeStatus): StatusView {
  if (status === "READY") return { label: "Ready", tone: "accent" };
  if (status === "FAILED") return { label: "Couldn't read", tone: "danger" };
  return { label: "Indexing", tone: "neutral" };
}

const TYPE_LABELS: Record<KnowledgeType, string> = {
  TEXT: "Note",
  DOCUMENT: "Document",
  URL: "Web page",
  VIDEO: "Video",
  IMAGE: "Image",
};

export const knowledgeTypeLabel = (type: KnowledgeType) => TYPE_LABELS[type];

export type AddFields = { kind: "link" | "note"; url: string; title: string; content: string };
export type AddPayload = { type: "URL"; url: string } | { type: "TEXT"; title: string; content: string };

/**
 * The POST /api/knowledge-base body for the add dialog: a link (always a web page; video ingest is not built yet) or
 * a titled note (the API requires a title and 100+ words and says so when either is missing).
 */
export function knowledgePayload(fields: AddFields): AddPayload {
  if (fields.kind === "link") return { type: "URL", url: fields.url.trim() };
  return { type: "TEXT", title: fields.title.trim(), content: fields.content.trim() };
}
