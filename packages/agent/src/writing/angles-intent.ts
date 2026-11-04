import { isIdeasRequest } from "./ideas";

/** Hook, opening-line and first-line requests belong to generateHooks, never to the angles panel. */
const HOOKS = /\b(?:hooks?|openings?|opening lines?|first lines?|intros?)\b/i;

/** The user asks for angles, suggestions, options or directions in so many words. */
const ASK_ANGLES = [
  /\b(?:give|show|suggest|offer|need|want|send|list)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|the\s+)?(?:(?:few|some|more|other|different|new|several|couple|\d+|two|three|four|five)\s+)*(?:angles?|suggestions?|options?|directions?)\b/i,
  /\b(?:different|other|few|more|some)\s+(?:angles?|directions?)\b/i,
  /\bwhich\s+angles?\b|\bangles?\s+(?:for|on)\b/i,
  /\byou decide\b|\byou pick\b|\bsurprise me\b(?![^.]*\bjust write\b)/i,
  /\bsuggest(?:ions?)?\b[^.\n]*\b(?:post|write|writing|today|topic|about)\b/i,
];
/** With a post open only an explicit angles/directions ask counts ("options for the ending" is an edit). */
const ASK_ANGLES_OPEN_POST = /\b(?:angles?|directions?)\b/i;

/** Signals that the request already carries direction. */
const DIRECTION = /\b(?:why|how|when|what|who|should|shouldn'?t|because|vs\.?|versus|difference|for|to|that|but|not|skip|arguing|against|about how|and)\b|\d|[?:;,\n"“]/i;

/** A NEW post asked for with only a topic: "create a post on llm", "write a post about hiring", "post on pricing". */
function bareTopic(text: string): boolean {
  const t = text.trim();
  if (/\n/.test(t) || /\bshape\s*:/i.test(t)) return false;
  const m = /^(?:(?:please\s+)?(?:can you\s+)?(?:create|write|make|draft)\s+(?:me\s+)?(?:a|the|my)?\s*(?:linkedin\s+)?post\s+(?:on|about)|(?:a\s+)?(?:linkedin\s+)?post\s+(?:on|about))\s+(.+?)[.!]*$/i.exec(t);
  const subject = m?.[1]?.trim();
  if (!subject) return false;
  return subject.split(/\s+/).length <= 6 && !DIRECTION.test(subject);
}

/**
 * Whether this turn must open the angles panel (presentOptions), decided by the server instead of the model. Never when an
 * angle is already picked, the user is answering the writer's questions, or the request is for ideas or hooks. Yes for an
 * explicit ask for angles/suggestions/options/directions, or a new post on a bare topic when no post is open.
 */
export function wantsAnglesPanel(input: { userText: string; pickedAngle: boolean; hasPost: boolean }): boolean {
  const text = input.userText.trim();
  if (!text || input.pickedAngle) return false;
  if (/^Here are my answers:/.test(text)) return false;
  if (isIdeasRequest(text) || HOOKS.test(text)) return false;
  if (input.hasPost) return ASK_ANGLES_OPEN_POST.test(text) && ASK_ANGLES.some((re) => re.test(text));
  return ASK_ANGLES.some((re) => re.test(text)) || bareTopic(text);
}
