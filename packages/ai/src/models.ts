/** The chat models a user may pick. Anything else is rejected server-side. */
export const CHAT_MODELS = [
  { id: "gpt-6.1-sol", label: "Sol 6.1", hint: "Best writing. The default." },
  { id: "gpt-6-sol", label: "Sol 6", hint: "Strong and steady." },
  { id: "gpt-6-luna", label: "Luna 6", hint: "Faster and cheaper." },
  { id: "gpt-5.5", label: "GPT-5.5", hint: "Previous generation." },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]["id"];

export function isChatModel(id: unknown): id is ChatModelId {
  return typeof id === "string" && CHAT_MODELS.some((m) => m.id === id);
}
