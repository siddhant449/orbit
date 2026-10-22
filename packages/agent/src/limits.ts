/** Hard limits for the chat agent (design §5–7, plan Global Constraints). */
export const LIMITS = {
  /** Characters in one user message; more is a 413. */
  messageChars: 200_000,
  /** Parts in one user message. */
  messageParts: 20,
  /** File parts in one user message. */
  messageFiles: 10,
  /** Knowledge items selected in the composer per turn. */
  knowledgeSelections: 5,
  /** Orchestrator steps per turn. */
  steps: 12,
  /** Cap on any tool's string output. */
  toolOutputChars: 12_000,
  /** `readKB` gets a larger cap. */
  readKBChars: 20_000,
  /** History window: messages kept. */
  historyMessages: 24,
  /** History window: serialised characters kept. */
  historyChars: 96_000,
  /** The last N messages keep their tool outputs; older ones are omitted. */
  historyFullToolOutputs: 6,
  /** Any tool output kept in history is truncated to this many characters. */
  historyToolOutputChars: 4_000,
  /** A LinkedIn post. */
  postChars: 3_000,
  /** What a document version may store. */
  postStoredChars: 10_000,
  /** An edit proposal's passage and its replacement. */
  proposalChars: 3_000,
  /** Document and chat titles. */
  titleChars: 120,
  /** A run lock older than this is stale. */
  runLockTtlMs: 6 * 60_000,
  /** `maxOutputTokens` per orchestrator step. */
  maxOutputTokens: 4_000,
} as const;
