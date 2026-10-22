/**
 * The benchmark prompt set (the same six prompts were sent to Kleo), grouped into the chats they run in.
 * Turns in one chat run in order, so later turns see the earlier ones. "{{draftFromC}}" is replaced with the
 * post prompt (c) produced, as a user would paste it.
 */
export type EvalPrompt = { id: string; text: string };
export type EvalChat = { name: string; prompts: EvalPrompt[]; openDocument: boolean };

export const DRAFT_FROM_C = "{{draftFromC}}";

export const EVAL_CHATS: EvalChat[] = [
  {
    name: "memory-and-ideas",
    openDocument: false,
    prompts: [
      { id: "a", text: "What do you remember about me?" },
      { id: "b", text: "Give me 5 post ideas for this week based on my strategy." },
    ],
  },
  {
    name: "draft-and-edit",
    // The app sends documentContext while the post is open in the side panel.
    openDocument: true,
    prompts: [
      { id: "c", text: "Draft a LinkedIn post about the difference between an MVP and a POC." },
      { id: "d", text: "Make the hook punchier and cut it to under 120 words." },
    ],
  },
  {
    name: "hooks",
    openDocument: false,
    prompts: [{ id: "e", text: "Write 3 hook variations for a post about hiring your first engineer." }],
  },
  {
    name: "analyze",
    openDocument: false,
    prompts: [{ id: "f", text: `Analyze this draft and tell me what to fix:\n\n${DRAFT_FROM_C}` }],
  },
];

export const PROMPT_IDS = EVAL_CHATS.flatMap((c) => c.prompts.map((p) => p.id));
