/** Hook purposes (design §5): twelve kinds of opening line, written for Orbit. Some need evidence the user must supply. */
export const HOOK_PURPOSE_IDS = ["claim", "contrarian", "mistake", "how-to", "comparison", "curiosity", "story", "proof", "number", "prediction", "question", "announcement"] as const;
export type HookPurpose = (typeof HOOK_PURPOSE_IDS)[number];
export type Evidence = "none" | "story" | "number" | "news";

export type HookPurposeDef = { id: HookPurpose; label: string; explainer: string; evidence: Evidence; examples: [string, string] };

export const HOOK_PURPOSES: readonly HookPurposeDef[] = [
  { id: "claim", label: "Bold claim", explainer: "A flat position stated in one sentence.", evidence: "none", examples: ["[Topic] is [bold verdict].", "Most [group] get [thing] backwards."] },
  { id: "contrarian", label: "Contrarian", explainer: "Disagrees with advice everyone repeats.", evidence: "none", examples: ["Stop [common advice].", "[Popular belief] is why [bad outcome]."] },
  { id: "mistake", label: "Mistake", explainer: "Names the error that costs the most.", evidence: "none", examples: ["The costliest [topic] mistake: [mistake].", "You are [doing X] too early."] },
  { id: "how-to", label: "How-to", explainer: "Promises a result and a way to get it.", evidence: "none", examples: ["How to [result] without [pain].", "The short route to [result]."] },
  { id: "comparison", label: "Comparison", explainer: "Sets two options side by side with a verdict.", evidence: "none", examples: ["[A] or [B]? [Verdict].", "[A] is for [x]. [B] is for [y]."] },
  { id: "curiosity", label: "Curiosity", explainer: "Opens a gap the post then closes.", evidence: "none", examples: ["What [group] never ask about [topic].", "The question behind every [topic] decision."] },
  { id: "story", label: "Story", explainer: "Starts inside a real moment the author lived.", evidence: "story", examples: ["[Time]: [scene].", "[Person] said [line]. Then [turn]."] },
  { id: "proof", label: "Proof", explainer: "Leads with a result the author can show.", evidence: "number", examples: ["[Result] in [time], with [constraint].", "[Metric] went from [x] to [y]."] },
  { id: "number", label: "Number", explainer: "Leads with a figure the author supplied.", evidence: "number", examples: ["[Number] [things] that [outcome].", "[Number]% of [group] [behaviour]."] },
  { id: "prediction", label: "Prediction", explainer: "Says where a trend is heading.", evidence: "none", examples: ["[Thing] will [change] before [event].", "Soon, [group] will [shift]."] },
  { id: "question", label: "Question", explainer: "Asks the question the reader is already asking.", evidence: "none", examples: ["What if [assumption] is wrong?", "Why do [group] [behaviour]?"] },
  { id: "announcement", label: "Announcement", explainer: "States news the author has supplied.", evidence: "news", examples: ["New: [thing] for [audience].", "[Thing] is now [state]."] },
];
