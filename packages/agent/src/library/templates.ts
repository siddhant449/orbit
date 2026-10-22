/** Twenty-four slot skeletons. `needs` lists the evidence the author must supply before the template is usable. */
export type Template = { id: string; category: string; title: string; skeleton: string; why: string; needs: ("story" | "number" | "news")[] };

const T = (id: string, category: string, title: string, skeleton: string, why: string, needs: Template["needs"] = []): Template => ({ id, category, title, skeleton, why, needs });

export const TEMPLATES: readonly Template[] = [
  T("edu-one-thing", "educational", "One thing to know", "[Claim about topic].\n\n[Why most people miss it].\n\n[The fix in one line].", "One idea, easy to repeat."),
  T("edu-three-steps", "educational", "Three steps", "How to [result]:\n1. [Step]\n2. [Step]\n3. [Step]\n\n[What to expect].", "Steps are easy to save."),
  T("story-moment", "story", "A moment and its turn", "[Time and place]: [scene].\n\n[What went wrong or surprised].\n\n[What changed].\n\n[Plain takeaway].", "A scene earns attention before the point.", ["story"]),
  T("story-conversation", "story", "A line someone said", "[Person] said: \"[line]\".\n\n[How I reacted].\n\n[What it made me change].", "Dialogue is concrete.", ["story"]),
  T("opinion-flat", "opinion", "Flat opinion", "[Opinion in one sentence].\n\n[Reason].\n\n[Strongest objection, answered honestly].", "A position invites replies."),
  T("opinion-stop", "opinion", "Stop doing it", "Stop [habit].\n\n[What it really costs].\n\n[What to do instead].", "A prohibition is a clear promise."),
  T("case-result", "case-study", "Result and method", "[Result] in [time].\n\nStarting point: [state].\n\nThe move: [what changed].\n\nThe lesson: [rule].", "Proof first, method second.", ["number"]),
  T("case-before-after", "case-study", "Before and after", "Before: [state].\nAfter: [state].\n\nThe bridge:\n- [change]\n- [change]", "Contrast is quick to read.", ["number"]),
  T("fw-named", "framework", "A named framework", "The [Name] test:\n1. [Question]\n2. [Question]\n3. [Question]\n\n[How to use it].", "A name makes it repeatable."),
  T("fw-matrix", "framework", "Two-by-two", "Sort every [thing] by [axis A] and [axis B].\n\n- [Quadrant]: [action]\n- [Quadrant]: [action]\n\n[What most people get wrong].", "A simple model organises choices."),
  T("list-items", "listicle", "A list of items", "[Number] [things] that [outcome]:\n1. [Item]\n2. [Item]\n3. [Item]\n\n[Which one to start with].", "Parallel items scan fast.", ["number"]),
  T("list-mistakes", "listicle", "Common mistakes", "Mistakes that slow [goal]:\n- [Mistake]\n- [Mistake]\n- [Mistake]\n\n[The fix for the worst one].", "Mistakes are specific and useful."),
  T("news-take", "news", "News and what it means", "[News, with date].\n\nWhat it means for [audience]: [implication].\n\nWhat to do this week: [action].", "Timely and useful.", ["news"]),
  T("news-reaction", "news", "Reaction", "[News].\n\nMost people will [reaction]. The better move is [move].", "A take adds value to a headline.", ["news"]),
  T("predict-trend", "prediction", "Where it is heading", "[Thing] will [change].\n\nWhy: [reason].\n\nWhat to do now: [action].", "A bold, falsifiable view."),
  T("compare-verdict", "comparison", "A versus B", "[A] versus [B].\n\n[A] wins when [condition].\n[B] wins when [condition].\n\n[Default pick].", "A verdict saves the reader time."),
  T("lesson-rule", "lesson", "Mistake to rule", "I [did the thing] for [time].\n\nIt cost [cost].\n\nThe rule I use now: [rule].", "A rule is the takeaway.", ["story"]),
  T("lesson-surprise", "lesson", "What surprised me", "I expected [expectation].\n\nWhat happened: [reality].\n\nWhat I would tell anyone else: [advice].", "Surprise is honest.", ["story"]),
  T("bts-process", "behind-the-scenes", "How the work is done", "Here is how we really [do thing]:\n- [Step, including the messy part]\n- [Step]\n\n[Why we do it this way].", "Process builds trust."),
  T("announce-plain", "announcement", "Plain announcement", "[Thing] is [state].\n\nFor: [audience].\n\nWhy it exists: [reason].\n\n[How to get it].", "Clear and quick.", ["news"]),
  T("engage-question", "engagement", "A focused question", "[Context in one line].\n\n[A specific question about a decision the reader faces]?", "Specific questions get specific answers."),
  T("authority-insight", "authority", "A checkable insight", "[Observation from the author's work].\n\nWhy it matters: [reason].\n\nHow to check it yourself: [method].", "Depth through detail."),
  T("authority-mistakes-data", "authority", "What the numbers say", "[Number] [things] looked at.\n\nWhat showed up: [pattern].\n\nWhat to do about it: [action].", "Numbers carry weight.", ["number"]),
  T("personal-moment", "personal", "A human moment", "[Small real moment].\n\nWhat it taught me about [work or life].\n\n[One sentence to keep].", "Shows who the author is.", ["story"]),
];
