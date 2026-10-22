/**
 * Activity-row labels for every tool the agent can call (Kleo's wording as the reference, ours in the details).
 * Client-safe: plain data, no server imports.
 */
export type ToolState = "active" | "done" | "error";
export type ToolLabel = { active: string; done: string; error: string };

const L = (active: string, done: string, error: string): ToolLabel => ({ active, done, error });

export const TOOL_LABELS: Record<string, ToolLabel> = {
  // Memory (Task 5)
  viewMemory: L("Reviewing your memory", "Reviewed your memory", "Couldn't open your memory"),
  readMemory: L("Reading your memory", "Read your memory", "Couldn't read that memory"),
  searchMemory: L("Searching your memory", "Searched your memory", "Couldn't search your memory"),
  saveMemory: L("Saving that", "Saved to memory", "Couldn't save that"),
  editMemory: L("Updating your memory", "Updated your memory", "Couldn't update your memory"),
  // Knowledge (Task 5)
  listKB: L("Browsing your knowledge", "Browsed your knowledge", "Couldn't browse your knowledge"),
  searchKB: L("Searching your knowledge", "Searched your knowledge", "Couldn't search your knowledge"),
  readKB: L("Reading a knowledge item", "Read a knowledge item", "Couldn't read that item"),
  // Strategy (Task 5, 12)
  getContentStrategy: L("Checking your strategy", "Checked your strategy", "Couldn't load your strategy"),
  updateContentStrategy: L("Updating your strategy", "Updated your strategy", "Couldn't update your strategy"),
  // Specialists (Tasks 8, 10, 11)
  delegateWriting: L("Drafting with the writer", "Draft ready", "The writer couldn't finish"),
  delegateEditing: L("Reviewing the post", "Review ready", "The review couldn't finish"),
  delegateIdentity: L("Gathering what I know about you", "Gathered your context", "Couldn't gather your context"),
  delegateStrategy: L("Finding post ideas", "Ideas ready", "Couldn't find ideas"),
  // Documents (Tasks 8, 10)
  createDocument: L("Creating your post", "Created your post", "Couldn't create the post"),
  updateDocument: L("Updating your draft", "Updated your draft", "Couldn't update the draft"),
  proposeDocumentEdits: L("Suggesting an edit", "Suggested an edit", "Couldn't suggest an edit"),
  getPostVersions: L("Checking earlier versions", "Checked earlier versions", "Couldn't load the versions"),
  // Writing tools (Task 11)
  generateHooks: L("Writing hook options", "Hook options ready", "Couldn't write hooks"),
  analyzePost: L("Analyzing this post", "Analyzed the post", "Couldn't analyze the post"),
  runSkill: L("Loading a writing guide", "Loaded a writing guide", "Couldn't load that guide"),
  // Web (Task 11)
  web_search: L("Searching the web", "Searched the web", "Couldn't reach the web"),
};

const FALLBACK: ToolLabel = L("Working", "Done", "That step didn't work");

export function toolLabel(name: string, state: ToolState): string {
  return (TOOL_LABELS[name] ?? FALLBACK)[state];
}

/** Tools whose outputs are for the model only: the row shows the label, never the raw result. */
export const HIDDEN_OUTPUT_TOOLS: ReadonlySet<string> = new Set([
  "viewMemory",
  "readMemory",
  "searchMemory",
  "saveMemory",
  "editMemory",
  "listKB",
  "searchKB",
  "readKB",
  "generateHooks",
]);

const ERROR_TEXT = /^\s*(Failed|Refused|⚠|EDIT_REQUIREMENTS_MISSED:|STALE_DOCUMENT:|STALE_SELECTED_PASSAGE:|EXISTING_POST:)/;

/**
 * A tool output reads as a failure: a `Failed` / `Refused` / `⚠` string or one of the document error codes, or an
 * object with `error` or `success: false`.
 */
export function isToolError(output: unknown): boolean {
  if (typeof output === "string") return ERROR_TEXT.test(output);
  if (output && typeof output === "object") {
    const o = output as { error?: unknown; success?: unknown };
    return ("error" in o && o.error !== undefined && o.error !== null) || o.success === false;
  }
  return false;
}

/** Plain names for the final review's checks (the 8 deterministic ones, then the writing checks). */
export const CHECK_LABELS: Record<string, string> = {
  length: "Length",
  "hook-length": "Opening",
  hashtags: "Hashtags",
  "banned-words": "Banned words",
  placeholders: "Placeholders",
  markdown: "Plain text",
  links: "Links",
  emoji: "Emoji",
  dashes: "Dashes",
  postscript: "P.S.",
  "rhetorical-opening": "Rhetorical opening",
  "block-lines": "Block length",
  "list-adjacency": "List spacing",
  "number-provenance": "Numbers",
  "date-provenance": "Dates",
  "first-person": "Personal claims",
};
