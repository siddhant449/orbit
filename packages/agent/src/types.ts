import { z } from "zod";
import { LIMITS } from "./limits";

const TextPartSchema = z.object({ type: z.literal("text"), text: z.string() });
const FilePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string(),
  url: z
    .string()
    .min(1)
    .max(2048)
    .refine((u) => !/^\s*data:/i.test(u), "Inline data: URLs aren't accepted; upload the file first."),
  filename: z.string().max(255).optional(),
});

export const MessageMetadataSchema = z.object({
  createdAt: z.string(),
  hideInUI: z.boolean().optional(),
  quickLinkKey: z.string().optional(),
  modelId: z.string().optional(),
});

/** The `POST /api/chat` body (design §5). Only the newest user message is sent; history lives in the database. */
export const ChatRequestSchema = z.object({
  id: z.uuid(),
  runId: z.uuid(),
  message: z.object({
    id: z.string().min(1).max(200),
    role: z.literal("user"),
    parts: z
      .array(z.union([TextPartSchema, FilePartSchema]))
      .min(1)
      .max(LIMITS.messageParts)
      .refine((parts) => parts.filter((p) => p.type === "file").length <= LIMITS.messageFiles, "Too many files."),
    metadata: MessageMetadataSchema.omit({ modelId: true }).optional(),
  }),
  selectedKnowledgeBaseIds: z.array(z.string().min(1)).max(LIMITS.knowledgeSelections).default([]),
  selectedWritingStyleId: z.string().min(1).nullable().default(null),
  webSearchEnabled: z.boolean().default(true),
  documentContext: z.object({ id: z.string().min(1), version: z.number().int().min(1) }).optional(),
  quickLinkKey: z.string().min(1).optional(),
  flowType: z.string().min(1).nullable().optional(),
  flowStep: z.string().min(1).nullable().optional(),
  uiAction: z.enum(["start-flow", "quick-link", "composer-action"]).nullable().optional(),
});
export type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

export type MessageMetadata = { createdAt: string; hideInUI?: boolean; quickLinkKey?: string; modelId?: string };

export type ChatDataParts = {
  textDelta: { id: string; text: string };
  creating: boolean;
  updating: boolean;
  document: { id: string; title: string; version: number; text: string };
};

const HandoffSummarySchema = z.object({
  id: z.string(),
  specialist: z.string(),
  readiness: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  parentAction: z.string().nullable(),
  requestDigest: z.string(),
  hasMissingInput: z.boolean(),
});

/** The task ledger stored on every assistant message's context (design §4, §7.1). */
export const ActiveTaskSchema = z.object({
  version: z.literal(1),
  taskId: z.string(),
  status: z.enum(["active", "completed", "failed"]),
  attempt: z.number().int().min(1),
  artifact: z.object({ id: z.string(), title: z.string() }).nullable(),
  latestRequest: z.string(),
  requestMessageId: z.string(),
  handoffs: z.array(HandoffSummarySchema),
  completedActions: z.array(z.string()),
  recentDirections: z.array(z.object({ text: z.string(), messageId: z.string() })),
  pendingQuestion: z.string().nullable(),
  flow: z.object({ id: z.string(), step: z.string() }).nullable(),
  pendingPicker: z.object({ id: z.string(), question: z.string() }).nullable(),
  updatedAt: z.string(),
});
export type ActiveTask = z.infer<typeof ActiveTaskSchema>;
