/**
 * The five post quick links (design section 9), in our own wording. Each sends a hidden user message with
 * `quickLinkKey`. Task 12 moves these into the flow catalogue and keeps this module as a re-export.
 */
export const QUICK_LINKS = [
  { key: "hook-variations", label: "Hook options", prompt: "Give me a few different opening lines for this post." },
  { key: "change-the-angle", label: "Try another angle", prompt: "Rewrite this post from a different angle, keeping the main point." },
  { key: "change-the-closing", label: "Rework the ending", prompt: "Give this post a stronger ending." },
  { key: "verify-post", label: "Review it", prompt: "Review this post for clarity, accuracy and anything that reads off." },
  { key: "analyze-post", label: "Analyze it", prompt: "Analyze this post: what works, what to fix, and a score out of 10." },
] as const satisfies readonly { key: string; label: string; prompt: string }[];

export type QuickLinkKey = (typeof QUICK_LINKS)[number]["key"];
