import type { BlockKind } from "./types";

/** An ordered plan of blocks with a line range each: the shape the writer is asked to follow (design §5). */
export type BlockPlan = { kind: BlockKind; lines: [number, number]; note: string }[];
export type Framework = { id: string; name: string; description: string; plan: BlockPlan };

export const FRAMEWORKS: readonly Framework[] = [
  {
    id: "story-lesson", name: "Story, lesson, steps, question", description: "A moment, what it taught, how to apply it, then a question.",
    plan: [{ kind: "hook", lines: [1, 1], note: "Drop into the scene" }, { kind: "prose", lines: [2, 3], note: "What happened" }, { kind: "prose", lines: [1, 2], note: "The lesson" }, { kind: "numbered", lines: [3, 4], note: "Steps to apply it" }, { kind: "close", lines: [1, 1], note: "A question for the reader" }],
  },
  {
    id: "problem-solve", name: "Problem, agitate, solve", description: "Name the problem, make the cost felt, give the fix.",
    plan: [{ kind: "hook", lines: [1, 1], note: "The problem in the reader's words" }, { kind: "prose", lines: [2, 3], note: "What it costs" }, { kind: "bullets", lines: [3, 4], note: "The fix, item by item" }, { kind: "close", lines: [1, 1], note: "The single next step" }],
  },
  {
    id: "attention-action", name: "Attention, interest, desire, action", description: "Earn attention, build interest, make it wanted, ask once.",
    plan: [{ kind: "hook", lines: [1, 1], note: "Attention" }, { kind: "prose", lines: [2, 3], note: "Interest" }, { kind: "prose", lines: [2, 3], note: "Desire: the outcome" }, { kind: "close", lines: [1, 2], note: "One clear action" }],
  },
  {
    id: "before-after", name: "Before, after, bridge", description: "Show the old state, the new one, and what connects them.",
    plan: [{ kind: "hook", lines: [1, 1], note: "The before, flatly" }, { kind: "prose", lines: [2, 2], note: "The after" }, { kind: "bullets", lines: [3, 4], note: "The bridge: what changed" }, { kind: "close", lines: [1, 1], note: "The rule to keep" }],
  },
  {
    id: "myth-truth", name: "Myth, truth, proof", description: "State a belief, replace it, back the replacement.",
    plan: [{ kind: "hook", lines: [1, 1], note: "The myth" }, { kind: "prose", lines: [2, 3], note: "The truth" }, { kind: "prose", lines: [2, 3], note: "Proof the author can supply" }, { kind: "close", lines: [1, 1], note: "What to do instead" }],
  },
  {
    id: "list-rehook", name: "List with a rehook", description: "A list whose middle gets a second hook so readers keep going.",
    plan: [{ kind: "hook", lines: [1, 1], note: "The promise" }, { kind: "numbered", lines: [3, 4], note: "First items" }, { kind: "prose", lines: [1, 1], note: "Rehook at about 60%: the best item is coming" }, { kind: "numbered", lines: [2, 3], note: "Remaining items" }, { kind: "close", lines: [1, 1], note: "The one to start with" }],
  },
];
