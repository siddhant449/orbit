import type { AiClient, Embedder } from "@brandloop/ai";
import type { UIMessageStreamWriter } from "ai";
import type { HandoffEnvelope } from "./specialists/envelope";

/** What the image tools need from the app: the agent package holds no database or job code of its own for images. */
export type VisualsToolDeps = {
  /** The newest finished image attached to this post, or null. */
  latestAttached(profileId: string, documentId: string): Promise<{ id: string } | null>;
  /** Starts one free edit through the same path as the edit route (safety check, edit cap, op lock, job). */
  startEdit(profileId: string, visualId: string, instruction: string): Promise<{ ok: true; remainingEdits: number } | { ok: false; message: string }>;
};

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
  /** Image tools are offered only when the app wires this in (VISUALS_ENABLED). */
  visuals?: VisualsToolDeps | null;
  now: () => Date;
  /** When the turn is aborted. The polish pass skips its model repair in the last 20 s. */
  deadline: Date;
};
