import type { AiClient, Embedder } from "@brandloop/ai";
import type { UIMessageStreamWriter } from "ai";
import type { ResearchBrief } from "./research/brief";
import type { ResearchProvider } from "./research/provider";
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
/** One picker idea as the app keeps it (the hook is the title, the source badge the category). */
export type SavedIdeaCard = { hook: string; angle: string; why: string; badge: string; sourceKind: string; sourceRef: string };

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
  /** The angle the user picked from a presentOptions panel this turn, resolved from the stored call; else null. */
  pickedAngle?: { question: string; label: string; brief: string; category?: string | null } | null;
  /** The template each writing handoff was shaped by, keyed by tool call id; createDocument records the use once the post exists. */
  templateChoices?: Map<string, { templateId: string; source: "auto" | "picked"; slug: string; title: string; category: string }>;
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
  /** Keeps the ideas the picker showed (fire and forget; a failure never reaches the chat). Absent: not kept. */
  saveIdeas?: ((profileId: string, cards: SavedIdeaCard[]) => Promise<void>) | null;
  /** Moderation for text a tool is about to save as the post. Returns the refusal message when it is flagged, else null. */
  screenText?: ((text: string) => Promise<string | null>) | undefined;
  now: () => Date;
  /** Dated research (Task W9): the provider, the newest brief of this turn, how many calls were made, and whether the first step must research. */
  research: { provider: ResearchProvider | null; brief: ResearchBrief | null; calls: number; required: boolean };
  /** When the turn is aborted. The polish pass skips its model repair in the last 20 s. */
  deadline: Date;
};
