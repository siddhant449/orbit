/**
 * The learning guard (design §3.2, plan W11): what automatic memory learning may keep. Kleo stored "Has hired their first
 * engineer" from a test request that said to skip personal details (WQ §5, A7): it learned from the framing of a task.
 * Orbit only learns what the user states about themselves, durably, outside a writing request. Pure.
 */

const WRITING_REQUEST =
  /^\s*(?:please\s+|can you\s+|could you\s+)?(?:draft|write|compose|create|generate|rewrite|polish|give me|make|suggest|come up with|brainstorm)\b|\b(?:draft|write|compose|generate)\s+(?:me\s+)?(?:a|an|the|some|\d+|five|three|two)?\s*(?:\w+\s+){0,4}(?:post|hooks?|opening|openings|angles?|ideas?|options?|variations?|caption|carousel)\b|\bhook (?:options|variations)\b|\bpost about\b/i;

/** Test content and role-play: nothing in it is a fact about the user. */
const TEST_MARKERS = /\b(?:test(?:ing)?|dummy|lorem|placeholder|sample|for example|e\.g\.|hypothetical(?:ly)?|pretend|imagine|suppose|what if|as a test|just kidding|made[- ]up|fake)\b|\[e2e:[^\]]*\]/i;

/** A passing remark: hedged, wished-for or idle, so not durable. */
const PASSING = /\b(?:maybe|perhaps|might|thinking about|considering|someday|one day|probably|i guess|not sure|kind of|sort of|i wonder|wish i|if only|at the moment|today only|this week|right now|for now)\b/i;

/** The facts a task framing contains: instructions about the writing, not about the person. */
const INSTRUCTION_FACT =
  /\b(?:skip|without|no)\s+personal (?:details|anecdotes|stories)\b|\b(?:asked|wants?|requested|needs?)\s+(?:for\s+)?(?:a|an|the|some)?\s*(?:post|draft|hooks?|rewrite|ideas?|options?)\b|\b(?:write|draft|compose)\s+(?:a|an|the)\b|\b(?:tone|style|format|length)\s+(?:for|of)\s+(?:this|the)\s+post\b|\bfor this post\b|\bthis (?:post|draft)\b/i;

/** The user states something about themselves in the first person, in the present or as a standing fact. */
const FIRST_PERSON =
  /\b(?:i am|i'm|i have|i've|i had|i run|i ran|i work|i worked|i hired|i built|i founded|i started|i lead|i led|i manage|i own|i live|i lived|i use|i prefer|i always|i never|i usually|i like|i love|i hate|we are|we're|we have|we've|we run|we hired|we built|we founded)\b|\bmy (?:name|company|team|role|job|title|clients?|business|agency|studio|startup|audience|niche|stack)\b/i;

const EXPLICIT_REMEMBER = /\b(?:remember(?: that)?|keep in mind|note that|save (?:this|that)|don't forget)\b/i;

const words = (s: string) => new Set(s.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);

export function isWritingRequest(userText: string): boolean {
  return WRITING_REQUEST.test(userText);
}

export type LearningVerdict = { allowed: string[]; refused: { fact: string; reason: string }[] };

/**
 * Splits proposed memory facts into those that may be stored and those that may not, given the user's own words this
 * turn. Rules, in order:
 *  1. Test content or role-play in the user's message: nothing is stored.
 *  2. A fact that restates a writing instruction ("skip personal details", "wants a post") is never a fact about the user.
 *  3. Passing remarks (hedges, "right now", idle wishes) are not durable.
 *  4. In a writing request nothing is stored unless the user also states it about themselves in the first person, and the
 *     fact is about what they stated; "remember that ..." is an explicit ask and is honoured outside test content.
 */
export function learningGuard(userText: string, facts: string[]): LearningVerdict {
  const verdict: LearningVerdict = { allowed: [], refused: [] };
  const refuse = (fact: string, reason: string) => verdict.refused.push({ fact, reason });
  const writing = isWritingRequest(userText);
  const test = TEST_MARKERS.test(userText);
  const explicit = EXPLICIT_REMEMBER.test(userText);
  const stated = userText.split(/(?<=[.!?])\s+|\n+/).filter((s) => FIRST_PERSON.test(s));
  for (const fact of facts) {
    if (test) refuse(fact, "test content");
    else if (INSTRUCTION_FACT.test(fact)) refuse(fact, "a writing instruction, not a fact about you");
    else if (PASSING.test(fact) || (PASSING.test(userText) && !explicit)) refuse(fact, "a passing remark");
    else if (writing && !explicit) {
      const f = words(fact);
      const supported = stated.some((s) => !PASSING.test(s) && [...words(s)].filter((w) => f.has(w)).length >= 2);
      if (supported) verdict.allowed.push(fact);
      else refuse(fact, "learned from a writing request");
    } else verdict.allowed.push(fact);
  }
  return verdict;
}
