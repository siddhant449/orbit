import type { AiClient, Embedder } from "@brandloop/ai";
import type { UIMessageStreamWriter } from "ai";
import type { HandoffEnvelope } from "./specialists/envelope";

export type OpenDocument = { id: string; title: string; version: number; text: string };

/** Everything a tool needs for one chat turn. Built once per turn by the turn runner. */
export type TurnContext = {
  profileId: string;
  userId: string;
  chatId: string;
  runId: string;
  requestMessageId: string;
  taskId: string;
  ai: AiClient;
  embedder: Embedder | null;
  selections: {
    knowledgeIds: string[];
    writingStyleId: string | null;
    webSearchEnabled: boolean;
    quickLinkKey: string | null;
  };
  writer: UIMessageStreamWriter | null;
  /** Specialist envelopes produced this turn, keyed by tool call id. */
  handoffs: Map<string, HandoffEnvelope>;
  /** The chat's post: loaded at the start of the turn, replaced when a tool creates or edits it. */
  documentRef: { current: OpenDocument | null };
  now: () => Date;
};
