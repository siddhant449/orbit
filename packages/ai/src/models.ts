/**
 * The chat models a user may pick. Anything else is rejected server-side, and a saved pick that is no longer listed
 * falls back to the default. The costlier models (Sol 6.1, Sol 6, GPT-5.5) are switched off for now to control cost.
 */
export const CHAT_MODELS = [{ id: "gpt-6-luna", label: "Luna 6", hint: "Fast and affordable. The default." }] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export function isChatModel(id: unknown): id is ChatModelId {
  return typeof id === "string" && CHAT_MODELS.some((m) => m.id === id);
}
