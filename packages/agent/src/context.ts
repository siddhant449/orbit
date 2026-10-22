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
  /** The user's own words in this turn. Only this text can unlock a one-turn rule override; tool output never does. */
  userText: string;
  taskId: string;
  ai: AiClient;
  embedder: Embedder | null;
  selections: {
    knowledgeIds: string[];
    writingStyleId: string | null;
    webSearchEnabled: boolean;
    quickLinkKey: string | null;
    /** A framework or template the user picked for this message, or null. */
    formatId: string | null;
  };
  writer: UIMessageStreamWriter | null;
  /** Specialist envelopes produced this turn, keyed by tool call id. */
  handoffs: Map<string, HandoffEnvelope>;
  /**
   * The post version the user had open when they sent the message (`documentContext`), moved forward by this turn's
   * own saves. updateDocument refuses to edit when the stored post is no longer at this version.
   */
  documentContext: { id: string; version: number } | null;
  /** The chat's post: loaded at the start of the turn, replaced when a tool creates or edits it. */
  documentRef: { current: OpenDocument | null };
  now: () => Date;
  /** When the turn is aborted. The polish pass skips its model repair in the last 20 s. */
  deadline: Date;
};
